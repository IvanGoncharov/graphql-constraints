import {
  Source,
  parse,
  concatAST,
  print
} from 'graphql';

export const constraintsIDL = new Source(`
directive @numberValue(
  min: Float
  max: Float
) on FIELD | ARGUMENT_DEFINITION | SCALAR

directive @stringValue(
  minLength: Int
  maxLength: Int
  startsWith: String
  endsWith: String
  includes: String
) on FIELD | ARGUMENT_DEFINITION | SCALAR
`, 'constraintsIDL');

export function appendDirectivesIDL(idl:Source|string):string {
  return print(concatAST([parse(idl), parse(constraintsIDL)]));
}
