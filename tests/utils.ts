import {
  Kind,
  ASTNode
} from 'graphql';

export function astToJSON(ast:ASTNode):any {
  switch (ast.kind) {
    case Kind.NULL:
      return null;
    case Kind.INT:
      return parseInt(ast.value, 10);
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.LIST:
      return ast.values.map(astToJSON);
    case Kind.OBJECT:
      return ast.fields.reduce((object, {name, value}) => {
        object[name.value] = astToJSON(value);
        return object;
      }, {});
  }
}
