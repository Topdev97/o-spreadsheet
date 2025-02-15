import { functionRegistry } from "../functions/index";
import { _lt } from "../translation";
import { CompiledFormula, FunctionDescription, NormalizedFormula } from "../types/index";
import { AST, ASTFuncall, parse } from "./parser";

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

/**
 * Takes a list of strings that might be single or multiline
 * and maps them in a list of single line strings.
 */
function splitCodeLines(codeBlocks: string[]): string[] {
  return codeBlocks
    .map((code) => code.split("\n"))
    .flat()
    .filter((line) => line.trim() !== "");
}
/**
 * Used as intermediate compilation.
 * Formula `=SUM(|0|, |1|)` gives the following code.
 * ```js
 * let _2 = range(0, deps, sheetId)
 * let _3 = range(1, deps, sheetId)
 * ctx.__lastFnCalled = 'SUM'
 * let _1 = ctx['SUM'](_2,_3)
 * ```
 * The result id is `_1`.
 */
type CompiledAST = {
  /**
   * The result of the code is stored in this identifier.
   * Can be a variable or a primitive value.
   */
  id: string;
  /**
   * String containing the compiled code
   */
  code: string;
};

// this cache contains all compiled function code, grouped by "structure". For
// example, "=2*sum(A1:A4)" and "=2*sum(B1:B4)" are compiled into the same
// structural function.
// It is only exported for testing purposes
export const functionCache: { [key: string]: CompiledFormula } = {};

// -----------------------------------------------------------------------------
// COMPILER
// -----------------------------------------------------------------------------

export function compile(formula: NormalizedFormula): CompiledFormula {
  if (!functionCache[formula.text]) {
    const ast = parse(formula.text);
    let nextId = 1;

    if (ast.type === "BIN_OPERATION" && ast.value === ":") {
      throw new Error(_lt("Invalid formula"));
    }
    if (ast.type === "UNKNOWN") {
      throw new Error(_lt("Invalid formula"));
    }
    const compiledAST = compileAST(ast);
    const code = splitCodeLines([
      `// ${formula.text}`,
      compiledAST.code,
      `return ${compiledAST.id};`,
    ]).join("\n");
    let baseFunction = new Function(
      "deps", // the dependencies in the current formula
      "sheetId", // the sheet the formula is currently evaluating
      "ref", // a function to access a certain dependency at a given index
      "range", // same as above, but guarantee that the result is in the form of a range
      "ctx",
      code
    );

    //@ts-ignore
    functionCache[formula.text] = baseFunction;
    functionCache[formula.text].dependenciesFormat = formatAST(ast);

    /**
     * This function compile the function arguments. It is mostly straightforward,
     * except that there is a non trivial transformation in one situation:
     *
     * If a function argument is asking for a range, and get a cell, we transform
     * the cell value into a range. This allow the grid model to differentiate
     * between a cell value and a non cell value.
     */
    function compileFunctionArgs(ast: ASTFuncall): CompiledAST[] {
      const functionDefinition = functions[ast.value.toUpperCase()];
      const currentFunctionArguments = ast.args;

      // check if arguments are supplied in the correct quantities

      const nbrArg = currentFunctionArguments.length;

      if (nbrArg < functionDefinition.minArgRequired) {
        throw new Error(
          _lt(
            "Invalid number of arguments for the %s function. Expected %s minimum, but got %s instead.",
            ast.value.toUpperCase(),
            functionDefinition.minArgRequired.toString(),
            nbrArg.toString()
          )
        );
      }

      if (nbrArg > functionDefinition.maxArgPossible) {
        throw new Error(
          _lt(
            "Invalid number of arguments for the %s function. Expected %s maximum, but got %s instead.",
            ast.value.toUpperCase(),
            functionDefinition.maxArgPossible.toString(),
            nbrArg.toString()
          )
        );
      }

      const repeatingArg = functionDefinition.nbrArgRepeating;
      if (repeatingArg > 1) {
        const argBeforeRepeat = functionDefinition.args.length - repeatingArg;
        const nbrRepeatingArg = nbrArg - argBeforeRepeat;
        if (nbrRepeatingArg % repeatingArg !== 0) {
          throw new Error(
            _lt(
              "Invalid number of arguments for the %s function. Expected all arguments after position %s to be supplied by groups of %s arguments",
              ast.value.toUpperCase(),
              argBeforeRepeat.toString(),
              repeatingArg.toString()
            )
          );
        }
      }

      let listArgs: CompiledAST[] = [];
      for (let i = 0; i < nbrArg; i++) {
        const argPosition = functionDefinition.getArgToFocus(i + 1) - 1;
        if (0 <= argPosition && argPosition < functionDefinition.args.length) {
          const currentArg = currentFunctionArguments[i];
          const argDefinition = functionDefinition.args[argPosition];
          const argTypes = argDefinition.type || [];

          // detect when an argument need to be evaluated as a meta argument
          const isMeta = argTypes.includes("META");
          // detect when an argument need to be evaluated as a lazy argument
          const isLazy = argDefinition.lazy;

          const hasRange = argTypes.some(
            (t) =>
              t === "RANGE" ||
              t === "RANGE<BOOLEAN>" ||
              t === "RANGE<DATE>" ||
              t === "RANGE<NUMBER>" ||
              t === "RANGE<STRING>"
          );
          const isRangeOnly = argTypes.every(
            (t) =>
              t === "RANGE" ||
              t === "RANGE<BOOLEAN>" ||
              t === "RANGE<DATE>" ||
              t === "RANGE<NUMBER>" ||
              t === "RANGE<STRING>"
          );
          if (isRangeOnly) {
            if (currentArg.type !== "NORMALIZED_REFERENCE") {
              throw new Error(
                _lt(
                  "Function %s expects the parameter %s to be reference to a cell or range, not a %s.",
                  ast.value.toUpperCase(),
                  (i + 1).toString(),
                  currentArg.type.toLowerCase().replace("normalized_", "")
                )
              );
            }
          }

          const compiledAST = compileAST(currentArg, isLazy, isMeta, hasRange, {
            functionName: ast.value.toUpperCase(),
            paramIndex: i + 1,
          });
          listArgs.push(compiledAST);
        }
      }

      return listArgs;
    }

    /**
     * This function compiles all the information extracted by the parser into an
     * executable code for the evaluation of the cells content. It uses a cash to
     * not reevaluate identical code structures.
     *
     * The function is sensitive to two parameters “isLazy” and “isMeta”. These
     * parameters may vary when compiling function arguments:
     *
     * - isLazy: In some cases the function arguments does not need to be
     * evaluated before entering the functions. For example the IF function might
     * take invalid arguments that do not need to be evaluate and thus should not
     * create an error. For this we have lazy arguments.
     *
     * - isMeta: In some cases the function arguments expects information on the
     * cell/range other than the associated value(s). For example the COLUMN
     * function needs to receive as argument the coordinates of a cell rather
     * than its value. For this we have meta arguments.
     */

    function compileAST(
      ast: AST,
      isLazy = false,
      isMeta = false,
      hasRange = false,
      referenceVerification: {
        functionName?: string;
        paramIndex?: number;
      } = {}
    ): CompiledAST {
      const codeBlocks: string[] = [];
      let id, fnName, statement;
      if (
        ast.type !== "NORMALIZED_REFERENCE" &&
        !(ast.type === "BIN_OPERATION" && ast.value === ":")
      ) {
        if (isMeta) {
          throw new Error(_lt(`Argument must be a reference to a cell or range.`));
        }
      }
      if (ast.debug) {
        codeBlocks.push("debugger;");
      }
      switch (ast.type) {
        case "BOOLEAN":
        case "NUMBER": // probably dead case
        case "STRING": // probably dead case
          if (!isLazy) {
            return { id: ast.value as string, code: "" };
          }
          id = nextId++;
          statement = `${ast.value}`;
          break;
        case "NORMALIZED_NUMBER":
          id = nextId++;
          statement = `deps.numbers[${ast.value}]`;
          break;
        case "NORMALIZED_STRING":
          id = nextId++;
          statement = `deps.strings[${ast.value}]`;
          break;
        case "REFERENCE":
          throw new Error(`Only normalized references can be compiled: ${ast.value}`);
        case "NORMALIZED_REFERENCE":
          const referenceIndex = formula.dependencies.references[ast.value];
          if (!referenceIndex) {
            id = nextId++;
            statement = `null`;
            break;
          }
          id = nextId++;
          if (hasRange) {
            statement = `range(${ast.value}, deps.references, sheetId)`;
          } else {
            statement = `ref(${ast.value}, deps.references, sheetId, ${
              isMeta ? "true" : "false"
            }, "${referenceVerification.functionName || OPERATOR_MAP["="]}",  ${
              referenceVerification.paramIndex
            })`;
          }
          break;
        case "FUNCALL":
          id = nextId++;
          const args = compileFunctionArgs(ast);
          codeBlocks.push(splitCodeLines(args.map((arg) => arg.code)).join("\n"));
          fnName = ast.value.toUpperCase();
          codeBlocks.push(`ctx.__lastFnCalled = '${fnName}';`);
          statement = `ctx['${fnName}'](${args.map((arg) => arg.id)})`;
          break;
        case "UNARY_OPERATION": {
          id = nextId++;
          fnName = UNARY_OPERATOR_MAP[ast.value];
          const right = compileAST(ast.right, false, false, false, {
            functionName: fnName,
          });
          codeBlocks.push(right.code);
          codeBlocks.push(`ctx.__lastFnCalled = '${fnName}';`);
          statement = `ctx['${fnName}']( ${right.id})`;
          break;
        }
        case "BIN_OPERATION": {
          id = nextId++;
          fnName = OPERATOR_MAP[ast.value];
          const left = compileAST(ast.left, false, false, false, {
            functionName: fnName,
          });
          const right = compileAST(ast.right, false, false, false, {
            functionName: fnName,
          });
          codeBlocks.push(left.code);
          codeBlocks.push(right.code);
          codeBlocks.push(`ctx.__lastFnCalled = '${fnName}';`);
          statement = `ctx['${fnName}'](${left.id}, ${right.id})`;
          break;
        }
        case "UNKNOWN":
          if (!isLazy) {
            return { id: "undefined", code: "" };
          }
          id = nextId++;
          statement = `undefined`;
          break;
      }
      if (isLazy) {
        const lazyFunction =
          `const _${id} = () => {\n` +
          `\t${splitCodeLines(codeBlocks).join("\n\t")}\n` +
          `\treturn ${statement};\n` +
          "}";
        return { id: `_${id}`, code: lazyFunction };
      } else {
        codeBlocks.push(`let _${id} = ${statement};`);
        return { id: `_${id}`, code: splitCodeLines(codeBlocks).join("\n") };
      }
    }

    /** Return a stack of formats corresponding to the priorities in which
     * formats should be tested.
     *
     * If the value of the stack is a number it corresponds to a dependency from
     * which the format can be inferred.
     *
     * If the value is a string it corresponds to a literal format which can be
     * applied directly.
     * */
    function formatAST(ast: AST): (string | number)[] {
      let fnDef: FunctionDescription;
      switch (ast.type) {
        case "NORMALIZED_REFERENCE":
          const referenceIndex = formula.dependencies.references[ast.value];
          if (referenceIndex) {
            return [ast.value];
          }
          break;
        case "FUNCALL":
          fnDef = functions[ast.value.toUpperCase()];
          if (fnDef.returnFormat) {
            if (fnDef.returnFormat === "FormatFromArgument") {
              if (ast.args.length > 0) {
                const argPosition = 0;
                const argType = fnDef.args[argPosition].type;
                if (!argType.includes("META")) {
                  return formatAST(ast.args[argPosition]);
                }
              }
            } else {
              return [fnDef.returnFormat.specificFormat];
            }
          }
          break;
        case "UNARY_OPERATION":
          return formatAST(ast.right);
        case "BIN_OPERATION":
          // the BIN_OPERATION ast is the only function case where we will look
          // at the following argument when the current argument has't format.
          // So this is the only place where the stack can grow.
          fnDef = functions[OPERATOR_MAP[ast.value]];
          if (fnDef.returnFormat) {
            if (fnDef.returnFormat === "FormatFromArgument") {
              const left = formatAST(ast.left);
              // as a string represents a safe format, we don't need to know the
              // format of the following arguments.
              if (typeof left[left.length - 1] === "string") {
                return left;
              }
              const right = formatAST(ast.right);
              return left.concat(right);
            } else {
              return [fnDef.returnFormat.specificFormat];
            }
          }
          break;
      }
      return [];
    }
  }
  return functionCache[formula.text];
}
