import {
  DirectiveNode,
} from 'graphql';

export interface ASTNodeWithDirectives {
  directives?: DirectiveNode[];
}

export interface Constraints {
  minLength?: number;
  maxLength?: number;
  startsWith?: string;
  endsWith?: string;
  includes?: string;
  regex: string;
  min?: number;
  max?: number;
  exclusiveMax?: number;
  exclusiveMin?: number;
  oneOf?: number[] | string [];
  equals?: number | string;
  multipleOf?: number;
}

export interface ConstraintsMap {
  '@stringValue'?: Constraints[];
  '@numberValue'?: Constraints[];
}

export type Dictionary<T> = {[key: string]: T};
