import {
  Source,
  parse,
  concatAST,
  print,
  buildASTSchema,
  GraphQLDirective,
} from 'graphql';

import { keyBy } from 'lodash';

export type Dictionary<T> = {[key: string]: T};

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
`, 'constraintsIDL');

export function appendDirectivesIDL(idl:Source|string):string {
  return print(concatAST([parse(idl), parse(constraintsIDL)]));
}

export function getDirectivesFromAST(idl:Source):Dictionary<GraphQLDirective> {
  const dummyIDL = `
    type Query {
      dummy: String
    }
  `;
  const fullAST = concatAST([parse(idl), parse(dummyIDL)]);
  const schema = buildASTSchema(fullAST);

  const directives = keyBy(schema.getDirectives(), 'name');
  delete directives.skip;
  delete directives.include;
  delete directives.deprecated;

  return directives;
}

export function typeOf(value: any): string {
  if (value == null)
    return 'null';

  let type = value.constructor && value.constructor.name;
  // handle objects created with Object.create(null)
  if (!type && (typeof value === 'object'))
    type = 'object';
  return type.toLowerCase();
}
