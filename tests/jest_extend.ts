import { Model } from "../src";

declare global {
  namespace jest {
    interface Matchers<R> {
      /**
       * Check that the given models are synchronized, i.e. they have the same
       * exportData
       */
      toHaveSynchronizedExportedData(): R;
      /**
       * Check that the same callback on each users give the same expected value
       */
      toHaveSynchronizedValue<T>(callback: (model: Model) => T, expected: T): R;
      /**
       * Check that the export data of the model is the same as the expected.
       * Note that it ignore the revisionId, as it's intended that it should be
       * different
       */
      toExport<T>(expected: T): R;
    }
  }
}

expect.extend({
  toExport(model: Model, expected: any) {
    const exportData = model.exportData();
    if (!this.equals(exportData, { ...expected, revisionId: expect.any(String) })) {
      return {
        pass: this.isNot,
        message: () =>
          `Diff: ${this.utils.printDiffOrStringify(expected, exportData, "Expected", "Received", false)}`
      };
    }
    return { pass: !this.isNot, message: () => "" };
  },
  toHaveSynchronizedValue(users: Model[], callback: (model: Model) => any, expected: any) {
    for (let user of users) {
      const result = callback(user);
      if (!this.equals(result, expected)) {
        const userId = user.getters.getClient().name;
        return {
          pass: this.isNot,
          message: () =>
            `${userId} does not have the expected value: \nReceived: ${this.utils.printReceived(
              result
            )}\nExpected: ${this.utils.printExpected(expected)}`,
        };
      }
    }
    return { pass: !this.isNot, message: () => "" };
  },
  toHaveSynchronizedExportedData(users: Model[]) {
    for (let a of users) {
      for (let b of users) {
        if (a === b) {
          continue;
        }
        const exportA = a.exportData();
        const exportB = b.exportData();
        if (!this.equals(exportA, exportB)) {
          const clientA = a.getters.getClient().id;
          const clientB = b.getters.getClient().id;
          return {
            pass: this.isNot,
            message: () =>
              `${clientA} and ${clientB} are not synchronized: \n${this.utils.printDiffOrStringify(
                exportA,
                exportB,
                clientA,
                clientB,
                false
              )}`,
          };
        }
      }
    }
    return { pass: !this.isNot, message: () => "" };
  },
});
