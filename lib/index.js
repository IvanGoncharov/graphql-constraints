"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var graphql_1 = require("graphql");
var values_js_1 = require("graphql/execution/values.js");
var each = require("lodash/each.js");
var keyBy = require("lodash/keyBy.js");
var mapValues = require("lodash/mapValues.js");
exports.constraintsIDL = new graphql_1.Source("\ndirective @numberValue(\n  min: Int\n  max: Int\n) on FIELD | QUERY\n\ndirective @stringValue(\n  minLength: Int\n  maxLength: Int\n) on FIELD | QUERY\n", 'constraintsIDL');
var constraintsDirectives = getDirectivesFromAST(exports.constraintsIDL);
function getDirectivesFromAST(idl) {
    var dummyIDL = "\n    type Query {\n      dummy: String\n    }\n  ";
    var fullAST = graphql_1.concatAST([graphql_1.parse(idl), graphql_1.parse(dummyIDL)]);
    var schema = graphql_1.buildASTSchema(fullAST);
    var directives = keyBy(schema.getDirectives(), 'name');
    delete directives.skip;
    delete directives.include;
    delete directives.deprecated;
    return directives;
}
function getConstrainDirectives(astNode) {
    if (astNode === null)
        return {};
    var result = {};
    astNode.directives.forEach(function (directiveNode) {
        var name = directiveNode.name.value;
        var directive = constraintsDirectives[name];
        result['@' + name] = values_js_1.getArgumentValues(directive, directiveNode);
    });
    return result;
}
function typeOf(value) {
    if (value == null)
        return 'Null';
    var type = value.constructor && value.constructor.name;
    // handle objects created with Object.create(null)
    if (!type && (typeof value === 'object'))
        type = 'Object';
    return type;
}
function validate(value, directives) {
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
            return value.forEach(function (item) { return validate(item, directives); });
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
function constraintsMiddleware(schema) {
    Object.values(schema.getTypeMap()).forEach(function (type) {
        if (type.name.startsWith('__'))
            return;
        if (type instanceof graphql_1.GraphQLScalarType) {
            var astNode = type.astNode;
            getConstrainDirectives(astNode);
        }
        if (type instanceof graphql_1.GraphQLObjectType) {
            each(type.getFields(), function (field) {
                var argsConstraints = mapValues(keyBy(field.args, 'name'), function (arg) {
                    var astNode = arg.astNode;
                    return getConstrainDirectives(astNode);
                });
                console.log(argsConstraints);
                var orginalResolve = field.resolve;
                field.resolve = function (source, args, context, info) {
                    each(args, function (value, name) {
                        validate(value, argsConstraints[name]);
                    });
                    return orginalResolve(source, args, context, info);
                };
            });
        }
    });
}
var userSchema = graphql_1.buildSchema("\n  type Query {\n    dummyField(\n      dummyArg: String @stringValue(minLength: 5)\n      dummyArg2: Int @numberValue(max: 5)\n    ): String\n  }\n");
userSchema.getQueryType().getFields().dummyField.resolve = (function () { return 'Dummy'; });
constraintsMiddleware(userSchema);
graphql_1.graphql(userSchema, "\n  {\n    dummyField(dummyArg: \"acde\", dummyArg2: 4)\n  }\n").then(function (result) { return console.log(result); });
//# sourceMappingURL=index.js.map