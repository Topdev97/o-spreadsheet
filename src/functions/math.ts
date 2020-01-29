import { FunctionMap, args } from "./functions";

function toNumber(n: any) {
  return typeof n === "number" ? n : 0;
}

export const functions: FunctionMap = {
  SUM: {
    description: "Returns the sum of all values in a range.",
    args: args`
        number (number,cell,range)
        numbers (number,cell,range,optional,repeating)
    `,
    returns: ["NUMBER"],
    compute: function(...args) {
      return args.flat().reduce((a, b) => a + toNumber(b), 0);
    }
  },
  RAND: {
    description: "Returns a random number between 0 and 1",
    args: [],
    returns: ["NUMBER"],
    compute: function() {
      return Math.random();
    }
  },
  MIN: {
    description: "Returns the minimum value.",
    args: args`
        number (number,cell,range)
        numbers (number,cell,range,optional,repeating)
    `,
    returns: ["NUMBER"],
    compute: function(...args) {
      return Math.min(...args);
    }
  },
  MAX: {
    description: "Returns the maximum value.",
    args: args`
        number (number,cell,range)
        numbers (number,cell,range,optional,repeating)
    `,
    returns: ["NUMBER"],
    compute: function(...args) {
      return Math.max(...args);
    }
  }
};
