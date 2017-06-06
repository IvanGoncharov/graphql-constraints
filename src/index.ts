import {
  graphql,
  Source,
  parse,
  concatAST,
  buildSchema,
  buildASTSchema,
  GraphQLSchema,
  GraphQLScalarType,
  GraphQLObjectType,
  ScalarTypeDefinitionNode,
  InputValueDefinitionNode,
} from 'graphql';

import { getArgumentValues } from 'graphql/execution/values.js';

import * as each from 'lodash/each.js';
import * as keyBy from 'lodash/keyBy.js';
import * as mapValues from 'lodash/mapValues.js';

export const constraintsIDL = new Source(`
directive @numberValue(
  min: Int
  max: Int
) on FIELD | QUERY

directive @stringValue(
  minLength: Int
  maxLength: Int
) on FIELD | QUERY
`, 'constraintsIDL');

const constraintsDirectives = getDirectivesFromAST(constraintsIDL);

function getDirectivesFromAST(idl) {
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

function getConstrainDirectives(astNode) {
  if (astNode === null)
    return {};
  var result = {};
  astNode.directives.forEach(directiveNode => {
    const name = directiveNode.name.value;
    const directive = constraintsDirectives[name];
    result['@' + name] = getArgumentValues(directive, directiveNode);
  });
  return result;
}

function typeOf(value: any): string {
  if (value == null)
    return 'Null';

  let type = value.constructor && value.constructor.name;
  // handle objects created with Object.create(null)
  if (!type && (typeof value === 'object'))
    type = 'Object';
  return type;
}

function validate(value: any, directives): void {
  switch (typeOf(value)) {
    case 'Null':
      return;
    case 'String':
      return stringValue(value, directives['@stringValue']);
    case 'Number':
      return numberValue(value, directives['@numberValue']);
    case 'Boolean':
      return booleanValue(value, directives['@booleanValue']);
    case 'Array':
      //while () {
      //}
      return value.forEach(item => validate(item, directives));
    // case 'Object':
  }
}

function stringValue(str, constraints) {
  if (constraints.minLength && str.length < constraints.minLength)
    throw Error('less than minLength');
  if (constraints.maxLength && str.length > constraints.maxLength)
    throw Error('less than maxLength');
}

function numberValue(num, constraints) {
  if (constraints.min && num < constraints.min)
    throw Error('less than min');
  if (constraints.max && num > constraints.max)
    throw Error('less than max');
}

function booleanValue(value, constraints) {
  if (constraints.equals && value !== constraints.equals)
    throw Error('not equals');
}

function constraintsMiddleware(schema: GraphQLSchema):void {
  Object.values(schema.getTypeMap()).forEach(type => {
    if (type.name.startsWith('__'))
      return;

    if (type instanceof GraphQLScalarType) {
      const astNode = (type as any).astNode as ScalarTypeDefinitionNode;
      getConstrainDirectives(astNode);
    }
    if (type instanceof GraphQLObjectType) {
      each(type.getFields(), field => {
        const argsConstraints = mapValues(keyBy(field.args, 'name'), arg => {
          const astNode = (arg as any).astNode as InputValueDefinitionNode;
          return getConstrainDirectives(astNode);
        });
        console.log(argsConstraints);

        const orginalResolve = field.resolve;
        field.resolve = (source, args, context, info) => {
          each(args, (value, name) => {
            validate(value, argsConstraints[name]);
          });
          return orginalResolve(source, args, context, info);
        };
      });
    }
  });
}

const userSchema = buildSchema(`
  type Query {
    dummyField(
      dummyArg: String @stringValue(minLength: 5)
      dummyArg2: Int @numberValue(max: 5)
    ): String
  }
`);


userSchema.getQueryType().getFields().dummyField.resolve = (() => 'Dummy');
constraintsMiddleware(userSchema);

graphql(userSchema, `
  {
    dummyField(dummyArg: "acde", dummyArg2: 4)
  }
`).then(result => console.log(result));
