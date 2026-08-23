/**
 * Shared test helpers.
 *
 * The service layer returns errors as data rather than throwing, which is right
 * for agents and awkward for tests: every result is a union and every field
 * access has to get past it. These two assert which branch you expected and
 * narrow the type at the same time, so a test reads as an intention rather than
 * as type gymnastics.
 */

import assert from "node:assert/strict";

/**
 * Assert the call succeeded, and hand back the success branch.
 *
 * @template T
 * @param {T} result
 * @returns {Exclude<T, { error: string }>}
 */
export function ok(result) {
  const err = /** @type {{ error?: string }} */ (result)?.error;
  assert.equal(err, undefined, `expected success, got: ${err}`);
  return /** @type {Exclude<T, { error: string }>} */ (result);
}

/**
 * Assert the call failed, and hand back the message so it can be matched.
 *
 * @param {unknown} result
 * @returns {string}
 */
export function failed(result) {
  const err = /** @type {{ error?: string }} */ (result)?.error;
  assert.ok(typeof err === "string" && err.length > 0, "expected an error, got success");
  return err;
}
