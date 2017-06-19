import {
  GraphQLScalarType,
  GraphQLNamedType,
} from 'graphql';

import { isBuiltInScalar, getListDepth } from './utils';

import { Constraints } from './types';

export function validateConstraints(constraints: Constraints) {
  for (let constraintName in constraints) {
    const validateFn = constraintsValidateMap[constraintName];
    if (validateFn) {
      validateFn(constraints[constraintName]);
    }
  }
}

export function isCustomOrOneOfScalars(type: GraphQLNamedType, scalars: String[] = []) {
  if (!(type instanceof GraphQLScalarType)) {
    return false;
  }

  return !isBuiltInScalar(type) || scalars.includes(type.name);
}

const constraintsValidateMap = {
  minLength: constraintVal => {
    if (constraintVal < 0) {
      throw Error('minLength can\'t be less than 0')
    }
  },
  minItems: constraintVal => {
    if (constraintVal < 0) {
      throw 'minItems can\'t be less than 0'
    }
  },
  innerList: constraintVal => {
    validateConstraints(constraintVal);
  }
};

export function validateListDepth(type, constraints) {
  const depth = getListDepth(type);
  let expectedListDepth = 1;
  while(constraints.innerList) {
    expectedListDepth++;
    constraints = constraints.innerList;
  }

  if (depth === 0) {
    throw Error('@list can\'t applied to non-list type');
  }

  if (depth !== expectedListDepth) {
    throw Error(`@list directive expects list of depth ${expectedListDepth}, ` +
      `but got ${depth}`);
  }
}
