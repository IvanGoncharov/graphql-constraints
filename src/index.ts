import {
  defaultFieldResolver,
  GraphQLSchema,
  getNamedType,
  GraphQLType,
  GraphQLNamedType,
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLArgument,
  GraphQLDirective,
} from 'graphql';

import { getArgumentValues } from 'graphql/execution/values.js';

import { each, keyBy, mapValues, omit, mergeWith, upperFirst } from 'lodash';

import {
  typeOf,
  isStandardType,
  isUniqueItems,
} from './utils';

import {
  ASTNodeWithDirectives,
  Constraints,
  ConstraintsMap,
} from './types';

import {
  isCustomOrOneOfScalars,
  validateConstraints,
  validateListDepth,
} from './validate-constraints';

import {
  constraintsDirectives
} from './directives';

function getDirectiveConstraints(
  directive: GraphQLDirective,
  node: ASTNodeWithDirectives,
  type?: GraphQLType
): Constraints {
  const constraints = getArgumentValues(directive, node);

  if (!type) {
    return constraints;
  }

  let namedType = getNamedType(type);

  if (directive.name === 'numberValue') {
    if (!isCustomOrOneOfScalars(namedType, ['Int', 'Float'])) {
      throw new Error(`Cant apply numberValue to type ${namedType.name}`);
    }
  } else if (directive.name === 'stringValue') {
    if (!isCustomOrOneOfScalars(namedType, ['String', 'ID'])) {
      throw new Error(`Cant apply numberValue to type ${namedType.name}`);
    }
  } else if (directive.name === 'list') {
    validateListDepth(type, constraints);
  }

  validateConstraints(constraints);
  return constraints;
}

function extractConstraints(
  def: { astNode: ASTNodeWithDirectives, type?: GraphQLType }
): ConstraintsMap {
  const astNode = (def as any).astNode;
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

    const constraints = getDirectiveConstraints(directive, directiveNode, def.type);
    result['@' + name] = Object.keys(constraints).length ? [constraints] : [];
  });
  return result;
}

function validate(value: any, directives:ConstraintsMap): void {
  if (Object.keys(directives).length === 0 || value == null) {
    return;
  }

  const valueType = typeOf(value);
  if(valueType === 'object') {
    each(directives, (propertyDirectives, key) => {
      if (key[0] !== '@') {
        validate(value[key], propertyDirectives);
      }
    })
  } else if (valueType === 'array') {
    const itemConstraints = omit(directives, '@list');
    const listCostraints = directives['@list'];

    if (listCostraints) {
      validateValue('@list', value);

      const innerList = listCostraints
        .map(x => x.innerList)
        .filter(x => x != null);
      if (innerList.length !== 0) {
        itemConstraints['@list'] = innerList;
      }
    }

    value.forEach(item => validate(item, itemConstraints));
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

    validateValue(expectedDirective, value);
  }

  function validateValue(directiveName, value) {
    const directiveConstraints = directives[directiveName];
    each(directiveConstraints, constrainSet => {
      each(constrainSet, (constraint, name) => {
        const validateFn = constraintsMap[name];
        if (!validateFn || validateFn(constraint, value)) {
          return;
        }
        const code = upperFirst(directiveName.slice(1)) + upperFirst(name);
        const message = errorsMessages[code](constraint,value);
        throw Error(message);
      });
    });
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

  minItems: (constraint, array) => array.length >= constraint,
  maxItems: (constraint, array) => array.length <= constraint,
  uniqueItems: (constraint, array) => constraint && isUniqueItems(array),
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

  ListMinItems: () => 'Less than minItems',
  ListMaxItems: () => 'Greater that maxItems',
  ListUniqueItems: () => 'Non unique array items',
};

function extractTypeConstraints(type: GraphQLNamedType): ConstraintsMap {
  if (isStandardType(type)) {
    return {};
  }

  if (type instanceof GraphQLScalarType) {
    return extractConstraints(type as any);
  }

  if (type instanceof GraphQLInputObjectType) {
    return mapValues(
      type.getFields(),
      field => mergeConstraints(
        extractConstraints(field as any),
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
      return mergeConstraints(
        extractConstraints(arg as any),
        typeConstraints[getNamedType(arg.type).name]
      );
    });
  }
}
