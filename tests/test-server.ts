import * as getStream from 'get-stream';

import {
  graphql,
  buildSchema,
  GraphQLScalarType,
  GraphQLSchema,
} from 'graphql';

import { astToJSON } from './utils';

import { constraintsMiddleware } from '../src/';

const stdin = process.stdin;
const stdout = process.stdout;

stdin.resume();
stdin.setEncoding('utf8');

const stdTypeNames = ['Int', 'Float', 'String', 'Boolean', 'ID'];

interface TestConfig {
  idl: string;
  query?: string;
  rootObject?: string;
  options: {
    rootValue?: any;
  };
}

function initSchema(schema: GraphQLSchema) {
  for (let type of Object.values(schema.getTypeMap())) {
    if (type instanceof GraphQLScalarType && !stdTypeNames.includes(type.name)) {
      type.serialize = (value => value);
      (type as GraphQLScalarType).parseLiteral = astToJSON;
    }
  }
}

async function test() {
  const config:TestConfig = JSON.parse(await getStream(stdin));

  const schema = buildSchema(config.idl);

  initSchema(schema);

  constraintsMiddleware(schema);

  graphql(schema, config.query, config.options.rootValue || {}).then(result => {
    stdout.write(JSON.stringify({ response: result}));
  });
}

test();
