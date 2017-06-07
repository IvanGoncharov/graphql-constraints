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
  DirectiveNode,
  ScalarTypeDefinitionNode,
  InputValueDefinitionNode,
} from 'graphql';

import { getArgumentValues } from 'graphql/execution/values.js';

import { each, keyBy, mapValues } from 'lodash';


type Dictionary<T> = {[key: string]: T};

interface ASTNodeWithDirectives {
  directives?: DirectiveNode[];
}

type Constraints =
  | StringConstraints
  | NumberConstraints
  | BooleanConstraints;

interface StringConstraints {
  minLength: number;
  maxLength: number;
}

interface NumberConstraints {
  min: number;
  max: number;
}

interface BooleanConstraints {
  equals: boolean;
}

interface ConstraintsMap {
  '@stringValue'?: StringConstraints;
  '@numberValue'?: NumberConstraints;
  '@booleanValue'?: BooleanConstraints;
}

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

function getDirectivesFromAST(idl:Source) {
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

function extractConstraints(astNode: ASTNodeWithDirectives):ConstraintsMap {
  if (astNode === null)
    return {};
  let result:Dictionary<Constraints> = {};
  astNode.directives.forEach(directiveNode => {
    const name = directiveNode.name.value;
    const directive = constraintsDirectives[name];
    result['@' + name] = getArgumentValues(directive, directiveNode) as Constraints;
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

function validate(value: any, directives:ConstraintsMap): void {
  if (value === null && Object.keys(directives).length === 0)
    return;

  const valueType = typeOf(value);
  if (valueType === 'Array') {
    //while () {
    //}
    return value.forEach(item => validate(item, directives));
  }
  else if(valueType === 'Object') {
  }
  else {
    const expectedDirective = `@${valueType}Value`;
    const validateFn = {
      String: stringValue,
      Number: numberValue,
      Boolean: booleanValue,
    } [valueType];

    const directiveNames = Object.keys(directives);
    if (!directiveNames.includes(expectedDirective)) {
      const allowedTypes = directiveNames.map(
        name => /@(.+)Value/.exec(name)[1]
      );
      throw Error(`Got ${valueType} expected ${allowedTypes.join(',')}`)
    }
    return validateFn(value, directives[expectedDirective]);
  }
}

function stringValue(str:string, constraints: StringConstraints) {
  if (constraints.minLength && str.length < constraints.minLength)
    throw Error('less than minLength');
  if (constraints.maxLength && str.length > constraints.maxLength)
    throw Error('less than maxLength');
}

function numberValue(num:number, constraints: NumberConstraints) {
  if (constraints.min && num < constraints.min)
    throw Error('less than min');
  if (constraints.max && num > constraints.max)
    throw Error('less than max');
}

function booleanValue(value:boolean, constraints: BooleanConstraints) {
  if (constraints.equals && value !== constraints.equals)
    throw Error('not equals');
}

function constraintsMiddleware(schema: GraphQLSchema):void {
  Object.values(schema.getTypeMap()).forEach(type => {
    if (type.name.startsWith('__'))
      return;

    if (type instanceof GraphQLScalarType) {
      const astNode = (type as any).astNode as ScalarTypeDefinitionNode;
      extractConstraints(astNode);
    }
    if (type instanceof GraphQLObjectType) {
      each(type.getFields(), field => {
        const argsConstraints = mapValues(keyBy(field.args, 'name'), arg => {
          const astNode = (arg as any).astNode as InputValueDefinitionNode;
          return extractConstraints(astNode);
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
