import { DEFAULT_ERROR_MESSAGE } from "../constants";
import { parseNumber } from "../helpers/index";
import { _lt } from "../translation";
import { FORMULA_REF_IDENTIFIER, Token, tokenize } from "./tokenizer";

const UNARY_OPERATORS = ["-", "+"];

// -----------------------------------------------------------------------------
// PARSER
// -----------------------------------------------------------------------------
interface ASTBase {
  debug?: boolean;
}

interface ASTNumber extends ASTBase {
  type: "NUMBER";
  value: number;
}
interface ASTReference extends ASTBase {
  type: "REFERENCE";
  value: number;
}

interface ASTString extends ASTBase {
  type: "STRING";
  value: string;
}

interface ASTBoolean extends ASTBase {
  type: "BOOLEAN";
  value: boolean;
}

interface ASTUnaryOperation extends ASTBase {
  type: "UNARY_OPERATION";
  value: any;
  right: AST;
}

interface ASTOperation extends ASTBase {
  type: "BIN_OPERATION";
  value: any;
  left: AST;
  right: AST;
}

export interface ASTFuncall extends ASTBase {
  type: "FUNCALL";
  value: string;
  args: AST[];
}

interface ASTUnknown extends ASTBase {
  type: "UNKNOWN";
  value: string;
}

export type AST =
  | ASTOperation
  | ASTUnaryOperation
  | ASTFuncall
  | ASTNumber
  | ASTBoolean
  | ASTString
  | ASTReference
  | ASTUnknown;

const OP_PRIORITY = {
  "^": 30,
  "*": 20,
  "/": 20,
  "+": 15,
  "-": 15,
  "&": 13,
  ">": 10,
  "<>": 10,
  ">=": 10,
  "<": 10,
  "<=": 10,
  "=": 10,
};

const FUNCTION_BP = 6;

function bindingPower(token: Token): number {
  switch (token.type) {
    case "NUMBER":
    case "SYMBOL":
      return 0;
    case "COMMA":
      return 3;
    case "LEFT_PAREN":
      return 5;
    case "RIGHT_PAREN":
      return 5;
    case "OPERATOR":
      return OP_PRIORITY[token.value] || 15;
  }
  throw new Error(_lt("Unknown token: %s", token.value));
}

function parsePrefix(current: Token, tokens: Token[]): AST {
  switch (current.type) {
    case "DEBUGGER":
      const next = parseExpression(tokens, 1000);
      next.debug = true;
      return next;
    case "NUMBER":
      return { type: current.type, value: parseNumber(current.value) };
    case "STRING":
      return { type: current.type, value: current.value };
    case "FUNCTION":
      if (tokens.shift()!.type !== "LEFT_PAREN") {
        throw new Error(_lt("Wrong function call"));
      } else {
        const args: AST[] = [];
        if (tokens[0].type !== "RIGHT_PAREN") {
          if (tokens[0].type === "COMMA") {
            args.push({ type: "UNKNOWN", value: "" });
          } else {
            args.push(parseExpression(tokens, FUNCTION_BP));
          }
          while (tokens[0].type === "COMMA") {
            tokens.shift();
            if ((tokens as any)[0].type === "RIGHT_PAREN") {
              args.push({ type: "UNKNOWN", value: "" });
              break;
            }
            if ((tokens as any)[0].type === "COMMA") {
              args.push({ type: "UNKNOWN", value: "" });
            } else {
              args.push(parseExpression(tokens, FUNCTION_BP));
            }
          }
        }
        if (tokens.shift()!.type !== "RIGHT_PAREN") {
          throw new Error(_lt("Wrong function call"));
        }
        return { type: "FUNCALL", value: current.value, args };
      }
    case "REFERENCE":
      return {
        type: "REFERENCE",
        value: parseInt(current.value, 10),
      };
    case "SYMBOL":
      if (["TRUE", "FALSE"].includes(current.value.toUpperCase())) {
        return { type: "BOOLEAN", value: current.value.toUpperCase() === "TRUE" } as AST;
      } else {
        if (current.value) {
          throw new Error(_lt("Invalid formula"));
        }
        return { type: "UNKNOWN", value: current.value };
      }
    case "LEFT_PAREN":
      const result = parseExpression(tokens, 5);
      if (!tokens.length || tokens[0].type !== "RIGHT_PAREN") {
        throw new Error(_lt("Unmatched left parenthesis"));
      }
      tokens.shift();
      return result;
    default:
      if (current.type === "OPERATOR" && UNARY_OPERATORS.includes(current.value)) {
        return {
          type: "UNARY_OPERATION",
          value: current.value,
          right: parseExpression(tokens, OP_PRIORITY[current.value]),
        };
      }
      throw new Error(_lt("Unexpected token: %s", current.value));
  }
}

function parseInfix(left: AST, current: Token, tokens: Token[]): AST {
  if (current.type === "OPERATOR") {
    const bp = bindingPower(current);
    const right = parseExpression(tokens, bp);

    return {
      type: "BIN_OPERATION",
      value: current.value,
      left,
      right,
    };
  }
  throw new Error(DEFAULT_ERROR_MESSAGE);
}

function parseExpression(tokens: Token[], bp: number): AST {
  const token = tokens.shift();
  if (!token) {
    throw new Error(DEFAULT_ERROR_MESSAGE);
  }
  let expr = parsePrefix(token, tokens);
  while (tokens[0] && bindingPower(tokens[0]) > bp) {
    expr = parseInfix(expr, tokens.shift()!, tokens);
  }
  return expr;
}

/**
 * Parse an expression (as a string) into an AST.
 */
export function parse(str: string): AST {
  const tokens = tokenize(str).filter((x) => x.type !== "SPACE");
  if (tokens[0].type === "OPERATOR" && tokens[0].value === "=") {
    tokens.splice(0, 1);
  }
  const result = parseExpression(tokens, 0);
  if (tokens.length) {
    throw new Error(DEFAULT_ERROR_MESSAGE);
  }
  return result;
}

/**
 * Converts an ast formula to the corresponding string
 */
export function astToFormula(ast: AST): string {
  switch (ast.type) {
    case "FUNCALL":
      const args = ast.args.map((arg) => astToFormula(arg));
      return `${ast.value}(${args.join(",")})`;
    case "NUMBER":
      return ast.value.toString();
    case "STRING":
      return ast.value;
    case "BOOLEAN":
      return ast.value ? "TRUE" : "FALSE";
    case "UNARY_OPERATION":
      return ast.value + astToFormula(ast.right);
    case "BIN_OPERATION":
      return astToFormula(ast.left) + ast.value + astToFormula(ast.right);
    case "REFERENCE":
      return `${FORMULA_REF_IDENTIFIER}${ast.value}${FORMULA_REF_IDENTIFIER}`;
    default:
      return ast.value;
  }
}
