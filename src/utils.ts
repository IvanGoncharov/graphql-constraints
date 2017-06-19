import {
  Source,
  parse,
  concatAST,
  buildASTSchema,
  GraphQLDirective,
  GraphQLScalarType,
  GraphQLType,
  GraphQLList,
  GraphQLNonNull,
  isNamedType,
} from 'graphql';

import { keyBy } from 'lodash';

import { Dictionary } from './types';

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

export function isStandardType(type) {
  return type.name.startsWith('__');
}

const builtInScalarNames = ['String', 'Int', 'Float', 'Boolean', 'GraphQLID'];
export function isBuiltInScalar(type: GraphQLScalarType): boolean {
 return builtInScalarNames.includes(type.name);
}

export function getListDepth(type: GraphQLType):number {
 let res = 0;
 while(!isNamedType(type)) {
   if (type instanceof GraphQLList) {
     res++;
   }
   type = (type as (GraphQLList<any> | GraphQLNonNull<any>)).ofType;
 }
 return res;
}

export function isUniqueItems(array) {
 // TODO: put indexes of duplicated items in error msg
 // FIXME: handle object
 return !array.some((item, index) => array.indexOf(item) !== index);
}
