import {
  defaultFieldResolver,
  GraphQLSchema,
  getNamedType,
  GraphQLNamedType,
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLArgument,
  DirectiveNode,
} from 'graphql';

import { getArgumentValues } from 'graphql/execution/values.js';

import { each, keyBy, mapValues, mergeWith, upperFirst } from 'lodash';

import {
  constraintsIDL,
  getDirectivesFromAST,
  typeOf,
} from './utils';

interface ASTNodeWithDirectives {
  directives?: DirectiveNode[];
}

interface StringConstraints {
  minLength?: number;
  maxLength?: number;
  startsWith?: string;
  endsWith?: string;
  includes?: string;
  oneOf?: string[];
  equals?: string;
  regex: string;
}

interface NumberConstraints {
  min?: number;
  max?: number;
  exclusiveMax?: number;
  exclusiveMin?: number;
  oneOf?: number[];
  equals?: number;
  multipleOf?: number;
}

interface ConstraintsMap {
  '@stringValue'?: StringConstraints[];
  '@numberValue'?: NumberConstraints[];
}

const constraintsDirectives = getDirectivesFromAST(constraintsIDL);

function extractConstraints(astNode: ASTNodeWithDirectives):ConstraintsMap {
  if (astNode === null) {
    return {};
  }

  let result = {};
  astNode.directives.forEach(directiveNode => {
    const name = directiveNode.name.value;
    const directive = constraintsDirectives[name];
    if (directive === undefined) {
      return;
    }

    const constraints = getArgumentValues(directive, directiveNode);
    result['@' + name] = Object.keys(constraints).length ? [constraints] : [];
  });
  return result;
}

function validate(value: any, directives:ConstraintsMap): void {
  if (Object.keys(directives).length === 0 || value == null) {
    return;
  }

  const valueType = typeOf(value);
  if (valueType === 'array') {
    return value.forEach(item => validate(item, directives));
  } else if(valueType === 'object') {
    each(directives, (propertyDirectives, key) => {
      if (key[0] === '@') {
        return;
      }
      validate(value[key], propertyDirectives);
    })
    // TODO
  } else {
    const expectedDirective = `@${valueType}Value`;
    const directiveNames = Object.keys(directives);
    // we got
    if (!directiveNames.includes(expectedDirective)) {
      const allowedTypes = directiveNames.map(
        name => /@(.+)Value/.exec(name)[1]
      );
      throw Error(`Got ${valueType} expected ${allowedTypes.join(',')}`)
    }

    for (let directive of directives[expectedDirective]) {
      each(directive, (constraint, name) => {
        if (constraintsMap[name](constraint, value)) {
          return;
        }
        const code = upperFirst(valueType) + 'Value' + upperFirst(name);
        const message = errorsMessages[code](constraint,value);
        throw Error(message);
      });
    }
  }
}

const constraintsMap = {
  oneOf: (constraint, value) => constraint.includes(value),
  equals: (constraints, value) => value === constraints,

  minLength: (constraint, str) => str.length >= constraint,
  maxLength: (constraint, str) => str.length <= constraint,
  startsWith: (constraint, str) => str.startsWith(constraint),
  endsWith: (constraint, str) => str.endsWith(constraint),
  includes: (constraint, str) => str.includes(constraint),
  regex: (constraint, str) => RegExp(constraint).test(str),

  min: (constraint, num) => num >= constraint,
  max: (constraint, num) => num <= constraint,
  exclusiveMin: (constraint, num) => num > constraint,
  exclusiveMax: (constraint, num) => num < constraint,
  multipleOf: (constraint, num) => num / constraint % 1 === 0,
};

const errorsMessages = {
  StringValueMinLength: () => 'Less than minLength',
  StringValueMaxLength: () => 'Greater than maxLength',
  StringValueStartsWith: (startsWith) => `Doesn't start with ${startsWith}`,
  StringValueEndsWith: (endsWith) => `Doesn't end with ${endsWith}`,
  StringValueIncludes: (includes) => `Doesn't includes ${includes}`,
  StringValueOneOf: (oneOf) => `Not one of "${oneOf.join(', ')}"`,
  StringValueEquals: (equals) => `Not equal to "${equals}"`,
  StringValueRegex: (regex) => `Does not match pattern "${regex}"`,

  NumberValueMin: () => 'Less than min',
  NumberValueMax: () => 'Greater than max',
  NumberValueExclusiveMax: () => 'Greater or equal to exclusiveMax',
  NumberValueExclusiveMin: () => 'Less or eqaul to exclusiveMin',
  NumberValueOneOf: (oneOf) => `Not one of "${oneOf.join(', ')}"`,
  NumberValueEquals: (equals) => `Not equal to "${equals}"`,
  NumberValueMultipleOf: (multipleOf) => `Not multiple of "${multipleOf}"`,
};

function isStandardType(type) {
  return type.name.startsWith('__');
}

function extractTypeConstraints(type: GraphQLNamedType): ConstraintsMap {
  if (isStandardType(type)) {
    return {};
  }

  if (type instanceof GraphQLScalarType) {
    return extractConstraints((type as any).astNode);
  }
  if (type instanceof GraphQLInputObjectType) {
    debugger;
    return mapValues(
      type.getFields(),
      field => mergeConstraints(
        extractConstraints((field as any).astNode),
        extractTypeConstraints(getNamedType(field.type))
      )
    );
  }
}

function mergeConstraints(obj:ConstraintsMap, source:ConstraintsMap) {
  return mergeWith(
    obj, source, (obj, src) => obj && obj.concat(src) || src
  );
}

export function constraintsMiddleware(schema: GraphQLSchema):void {
  let typeConstraints = mapValues(schema.getTypeMap(), extractTypeConstraints);

  Object.values(schema.getTypeMap()).forEach(type => {
    if (isStandardType(type) || !(type instanceof GraphQLObjectType)) {
      return;
    }

    each(type.getFields(), field => {
      const argsConstraints = getArgsConstraints(field.args);

      const orginalResolve = field.resolve || defaultFieldResolver;
      field.resolve = (source, args, context, info) => {
        each(args, (value, name) => {
          validate(value, argsConstraints[name]);
        });
        let res = orginalResolve(source, args, context, info);
        return res;
      };
    });
  });

  function getArgsConstraints(args: Array<GraphQLArgument>)
    : ConstraintsMap {
    return mapValues(keyBy(args, 'name'), arg => {
      const astNode = (arg as any).astNode;
      return mergeConstraints(
        extractConstraints(astNode),
        typeConstraints[getNamedType(arg.type).name]
      );
    });
  }
}
