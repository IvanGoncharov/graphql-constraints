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

import { each, keyBy, mapValues, mergeWith } from 'lodash';

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

interface BooleanConstraints {
  equals?: boolean;
}

interface ConstraintsMap {
  '@stringValue'?: StringConstraints[];
  '@numberValue'?: NumberConstraints[];
  '@booleanValue'?: BooleanConstraints[];
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
    const validateFn = {
      string: stringValue,
      number: numberValue,
      boolean: booleanValue,
    } [valueType];

    const directiveNames = Object.keys(directives);
    // we got
    if (!directiveNames.includes(expectedDirective)) {
      const allowedTypes = directiveNames.map(
        name => /@(.+)Value/.exec(name)[1]
      );
      throw Error(`Got ${valueType} expected ${allowedTypes.join(',')}`)
    }

    for (let directive of directives[expectedDirective]) {
      validateFn(value, directive);
    }
  }
}

function stringValue(str:string, constraints: StringConstraints) {
  if (constraints.minLength != null && str.length < constraints.minLength) {
    throw Error('Less than minLength');
  }
  if (constraints.maxLength != null && str.length > constraints.maxLength) {
    throw Error('Greater than maxLength');
  }
  if (constraints.startsWith != null && !str.startsWith(constraints.startsWith)) {
    throw Error(`Doesn\'t start with ${constraints.startsWith}`);
  }
  if (constraints.endsWith != null && !str.endsWith(constraints.endsWith)) {
    throw Error(`Doesn\'t end with ${constraints.endsWith}`);
  }
  if (constraints.includes != null && !str.includes(constraints.includes)) {
    throw Error(`Doesn\'t includes ${constraints.endsWith}`);
  }
  if (constraints.oneOf != null && !constraints.oneOf.includes(str)) {
    throw Error(`Not one of "${constraints.oneOf.join(', ')}"`);
  }
  if (constraints.equals != null && str != constraints.equals) {
    throw Error(`Not equal to "${constraints.equals}"`);
  }
  if (constraints.regex != null && RegExp(constraints.regex).test(str) === false) {
    throw Error(`Does not match pattern "${constraints.regex}"`);
  }
}

function numberValue(num:number, constraints: NumberConstraints) {
  if (constraints.min != null && num < constraints.min) {
    throw Error('Less than min');
  }
  if (constraints.max != null && num > constraints.max) {
    throw Error('Greater than max');
  }
  if (constraints.exclusiveMax != null && num >= constraints.exclusiveMax) {
    throw Error('Greater or equal to exclusiveMax');
  }
  if (constraints.exclusiveMin != null && num <= constraints.exclusiveMin) {
    throw Error('Less or eqaul to exclusiveMin');
  }
  if (constraints.oneOf != null && !constraints.oneOf.includes(num)) {
    throw Error(`Not one of "${constraints.oneOf.join(', ')}"`);
  }
  if (constraints.equals != null && num != constraints.equals) {
    throw Error(`Not equal to "${constraints.equals}"`);
  }
  if (constraints.multipleOf != null && (num / constraints.multipleOf % 1 !== 0)) {
    throw Error(`Not multiple of "${constraints.multipleOf}"`);
  }
}

function booleanValue(value:boolean, constraints: BooleanConstraints) {
  if (constraints.equals != null && value !== constraints.equals) {
    throw Error('not equals');
  }
}

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
