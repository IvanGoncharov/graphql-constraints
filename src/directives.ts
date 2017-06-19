import {
  Source,
  print,
  parse,
  concatAST,
  GraphQLDirective,
} from 'graphql';

import { Dictionary } from './types';

import { getDirectivesFromAST } from './utils';

export const constraintsIDL = new Source(`
directive @numberValue(
  min: Float
  max: Float
  exclusiveMax: Float
  exclusiveMin: Float
  oneOf: [Float]
  equals: Float
  multipleOf: Float
) on FIELD | ARGUMENT_DEFINITION | SCALAR

directive @stringValue(
  minLength: Int
  maxLength: Int
  startsWith: String
  endsWith: String
  includes: String
  oneOf: [String]
  equals: String
  regex: String
) on FIELD | ARGUMENT_DEFINITION | SCALAR

input _ListConstraints {
  maxItems: Int
  minItems: Int
  uniqueItems: Boolean
  innerList: _ListConstraints
}

directive @list(
  maxItems: Int
  minItems: Int
  uniqueItems: Boolean
  innerList: _ListConstraints
) on FIELD | ARGUMENT_DEFINITION
`, 'constraintsIDL');

export const constraintsDirectives:Dictionary<GraphQLDirective> = getDirectivesFromAST(constraintsIDL);

export function appendDirectivesIDL(idl:Source|string):string {
  return print(concatAST([parse(idl), parse(constraintsIDL)]));
}
