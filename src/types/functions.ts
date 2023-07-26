import { Locale } from "./locale";
import { Arg, ArgValue, FunctionReturn, FunctionReturnFormat, FunctionReturnValue } from "./misc";

export type ArgType =
  | "ANY"
  | "BOOLEAN"
  | "NUMBER"
  | "STRING"
  | "DATE"
  | "RANGE"
  | "RANGE<BOOLEAN>"
  | "RANGE<NUMBER>"
  | "RANGE<DATE>"
  | "RANGE<STRING>"
  | "RANGE<ANY>"
  | "META";

export interface ArgDefinition {
  repeating?: boolean;
  optional?: boolean;
  lazy?: boolean;
  description: string;
  name: string;
  type: ArgType[];
  default?: boolean;
  defaultValue?: any;
}

export type ComputeFunctionArg<T> = T | (() => T);
export type ComputeFunction<T, R> = (this: EvalContext, ...args: ComputeFunctionArg<T>[]) => R;

interface AddFunctionDescriptionBase {
  description: string;
  category?: string;
  args: ArgDefinition[];
  returns: [ArgType];
  isExported?: boolean;
  hidden?: boolean;
}

interface ComputeValue {
  compute: ComputeFunction<ArgValue, FunctionReturnValue>;
}

interface ComputeFormat {
  computeFormat: ComputeFunction<Arg, FunctionReturnFormat>;
}

interface ComputeValueAndFormat {
  computeValueAndFormat: ComputeFunction<Arg, FunctionReturn>;
}

export type AddFunctionDescription =
  | (AddFunctionDescriptionBase & ComputeValue & Partial<ComputeFormat>)
  | (AddFunctionDescriptionBase & ComputeValueAndFormat);

export type FunctionDescription = AddFunctionDescription & {
  minArgRequired: number;
  maxArgPossible: number;
  nbrArgRepeating: number;
  getArgToFocus: (argPosition: number) => number;
};

export type EvalContext = {
  __lastFnCalled?: string;
  __originCellXC?: () => string;
  locale: Locale;
  [key: string]: any;
};
