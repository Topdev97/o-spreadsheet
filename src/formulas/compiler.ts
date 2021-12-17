import { functionRegistry } from "../functions/index";
import { _lt } from "../translation";
import { Arg, CompiledFormula, NormalizedFormula } from "../types/index";
import { AST, ASTAsyncFuncall, ASTFuncall, parse } from "./parser";

const functions = functionRegistry.content;

const OPERATOR_MAP = {
  "=": "EQ",
  "+": "ADD",
  "-": "MINUS",
  "*": "MULTIPLY",
  "/": "DIVIDE",
  ">=": "GTE",
  "<>": "NE",
  ">": "GT",
  "<=": "LTE",
  "<": "LT",
  "^": "POWER",
  "&": "CONCATENATE",
};

const UNARY_OPERATOR_MAP = {
  "-": "UMINUS",
  "+": "UPLUS",
};

// this cache contains all compiled function code, grouped by "structure". For
// example, "=2*sum(A1:A4)" and "=2*sum(B1:B4)" are compiled into the same
// structural function.
//
// It is only exported for testing purposes
export const functionCache: { [key: string]: CompiledFormula } = {};

// -----------------------------------------------------------------------------
// COMPILER
// -----------------------------------------------------------------------------
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export function compile(str: NormalizedFormula): CompiledFormula {
  // TODO: rename that 'str' variable. Doesn't make sense
  let isAsync = false;

  if (!functionCache[str.text]) {
    const ast = parse(str.text);
    let nextId = 1;
    const code = [`// ${str.text}`];

    if (ast.type === "BIN_OPERATION" && ast.value === ":") {
      throw new Error(_lt("Invalid formula"));
    }
    if (ast.type === "UNKNOWN") {
      throw new Error(_lt("Invalid formula"));
    }

    /**
     * This function compile the function arguments. It is mostly straightforward,
     * except that there is a non trivial transformation in one situation:
     *
     * If a function argument is asking for a range, and get a cell, we transform
     * the cell value into a range. This allow the grid model to differentiate
     * between a cell value and a non cell value.
     */
    function compileFunctionArgs(ast: ASTAsyncFuncall | ASTFuncall): string[] {
      const functionDefinition = functions[ast.value.toUpperCase()];
      let argDefinition: Arg;

      const result: string[] = [];
      const currentFunctionArguments = ast.args;

      const isRepeating = functionDefinition.args.length
        ? functionDefinition.args[functionDefinition.args.length - 1].repeating
        : false;
      let minArg = 0;
      let maxArg = isRepeating ? Infinity : functionDefinition.args.length;
      for (let arg of functionDefinition.args) {
        if (!arg.optional) {
          minArg++;
        }
      }
      if (currentFunctionArguments.length < minArg || currentFunctionArguments.length > maxArg) {
        throw new Error(
          _lt(
            "Invalid number of arguments for the %s function. Expected %s, but got %s instead.",
            ast.value.toUpperCase(),
            functionDefinition.args.length.toString(),
            currentFunctionArguments.length.toString()
          )
        );
      }
      for (let i = 0; i < currentFunctionArguments.length; i++) {
        const arg = currentFunctionArguments[i];
        argDefinition = functionDefinition.args[i] || argDefinition!;
        const isLazy = argDefinition && argDefinition.lazy;
        const types = (argDefinition && argDefinition.type) || [];
        const hasRange = types.some(
          (t) =>
            t === "RANGE" ||
            t === "RANGE<BOOLEAN>" ||
            t === "RANGE<DATE>" ||
            t === "RANGE<NUMBER>" ||
            t === "RANGE<STRING>"
        );
        const isRangeOnly = types.every(
          (t) =>
            t === "RANGE" ||
            t === "RANGE<BOOLEAN>" ||
            t === "RANGE<DATE>" ||
            t === "RANGE<NUMBER>" ||
            t === "RANGE<STRING>"
        );
        if (isRangeOnly && arg.type !== "REFERENCE") {
          throw new Error(
            _lt(
              "Function %s expects the parameter %s to be reference to a cell or range, not a %s.",
              ast.value.toUpperCase(),
              (i + 1).toString(),
              arg.type.toLowerCase().replace("normalized_", "")
            )
          );
        }
        if (
          // a range of more than 1 cell
          arg.type === "BIN_OPERATION" &&
          arg.value === ":" &&
          arg.left.value !== arg.right.value &&
          !hasRange
        ) {
          throw new Error(
            _lt(
              "Function %s expects the parameter %s to be a single value or a single cell reference, not a range.",
              ast.value.toUpperCase(),
              (i + 1).toString()
            )
          );
        }
        let argValue = compileAST(arg, isLazy, hasRange, {
          functionName: ast.value.toUpperCase(),
          paramIndex: i + 1,
        });
        result.push(argValue);
      }
      return result;
    }

    /**
     * This function compiles all the information extracted by the parser into an
     * executable code for the evaluation of the cells content. It uses a cache to
     * not reevaluate identical code structures.
     *
     * The function is sensitive to parameter “isLazy”. It may vary when compiling
     * function arguments:
     *
     * - isLazy: In some cases the function arguments does not need to be
     * evaluated before entering the functions. For example the IF function might
     * take invalid arguments that do not need to be evaluate and thus should not
     * create an error. For this we have lazy arguments.
     *
     */

    function compileAST(
      ast: AST,
      isLazy = false,
      hasRange = false,
      referenceVerification: {
        functionName?: string;
        paramIndex?: number;
      } = {}
    ): string {
      let id, left, right, args, fnName, statement;
      if (ast.debug) {
        code.push("debugger;");
      }
      switch (ast.type) {
        case "BOOLEAN":
        case "NUMBER": // probably dead case
        case "STRING": // probably dead case
          id = nextId++;
          statement = ast.value;
          break;
        case "NORMALIZED_NUMBER":
        case "NORMALIZED_STRING":
          id = nextId++;
          statement = `deps[${ast.value}]`;
          break;
        case "REFERENCE":
          const referenceText = str.dependencies[ast.value];
          if (!referenceText) {
            id = nextId++;
            statement = `null`;
            break;
          }
          id = nextId++;
          if (hasRange) {
            statement = `range(${ast.value}, deps, sheetId)`;
          } else {
            statement = `ref(${ast.value}, deps, sheetId,
              "${referenceVerification.functionName}", ${referenceVerification.paramIndex})`;
          }
          break;
        case "FUNCALL":
          id = nextId++;
          args = compileFunctionArgs(ast);
          fnName = ast.value.toUpperCase();
          code.push(`ctx.__lastFnCalled = '${fnName}'`);
          statement = `ctx['${fnName}'](${args})`;
          break;
        case "ASYNC_FUNCALL":
          id = nextId++;
          isAsync = true;
          args = compileFunctionArgs(ast);
          fnName = ast.value.toUpperCase();
          code.push(`ctx.__lastFnCalled = '${fnName}'`);
          statement = `await ctx['${fnName}'](${args})`;
          break;
        case "UNARY_OPERATION":
          id = nextId++;
          right = compileAST(ast.right);
          fnName = UNARY_OPERATOR_MAP[ast.value];
          code.push(`ctx.__lastFnCalled = '${fnName}'`);
          statement = `ctx['${fnName}']( ${right})`;
          break;
        case "BIN_OPERATION":
          id = nextId++;
          left = compileAST(ast.left);
          right = compileAST(ast.right);
          fnName = OPERATOR_MAP[ast.value];
          code.push(`ctx.__lastFnCalled = '${fnName}'`);
          statement = `ctx['${fnName}'](${left}, ${right})`;
          break;
        case "UNKNOWN":
          if (!isLazy) {
            return "null";
          }
          id = nextId++;
          statement = `null`;
          break;
      }
      code.push(`let _${id} = ` + (isLazy ? `()=> ` : ``) + statement);
      return `_${id}`;
    }
    code.push(`return ${compileAST(ast)};`);

    const Constructor = isAsync ? AsyncFunction : Function;
    let baseFunction = new Constructor(
      "deps", // the dependencies in the current formula
      "sheetId", // the sheet the formula is currently evaluating
      "ref", // a function to access a certain dependency at a given index
      "range", // same as above, but guarantee that the result is in the form of a range
      "ctx",
      code.join("\n")
    );
    functionCache[str.text] = baseFunction;
    functionCache[str.text].async = isAsync;
  }

  return functionCache[str.text];
}
