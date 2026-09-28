/**
 * A Workers AI binding that **throws if it is ever called**, plus a recording
 * one for the tests that mean to reach it.
 *
 * The refusing shape is the load-bearing half (ADR-0115 §4.2): the whole claim
 * behind answering `401` before touching the binding is that a bad key costs
 * zero neurons, and the only way to assert that rather than assume it is to
 * hand the route something that cannot be used quietly.
 */
import type { ModelBinding } from "../../../worker/src/model";

/** A binding whose use is the failure. */
export function refusingModel(): ModelBinding {
  return {
    async run() {
      throw new Error(
        "the model was called: this path was supposed to spend no neurons"
      );
    },
  };
}

/** A binding that answers, and remembers what it was asked. */
export function recordingModel(answer: unknown = {}) {
  const calls: { model: string; inputs: Record<string, unknown> }[] = [];
  const binding: ModelBinding = {
    async run(model, inputs) {
      calls.push({ model, inputs });
      return answer;
    },
  };
  return { binding, calls };
}
