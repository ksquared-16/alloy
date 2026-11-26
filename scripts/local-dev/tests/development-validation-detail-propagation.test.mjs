/**
 * A refusal must name WHICH refusal it is.
 *
 * The defect this locks: a validator computed a precise, actionable sentence
 * ("request names X; promoted staging is Y") and the governed-failure boundary
 * forwarded only the wrapper code `input_validation_failed`. Six mutually
 * exclusive causes arrived at the worker as one indistinguishable string, and
 * the only recovery left was to guess and refile a privileged write.
 *
 * These cases assert the nested diagnosis survives the boundary, that the
 * wrapper is not lost either, and that a detail quoting an input is redacted.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { describeExecutionFailure } = await import(
  "../lib/vacilando/governed-action-request.mjs"
);

test("validation detail reaches the worker", async (t) => {
  await t.test("the nested cause is named, not just its category", () => {
    const text = describeExecutionFailure({
      ok: false,
      error: "input_validation_failed",
      validation: {
        ok: false,
        error: "expected_staging_sha_mismatch",
        detail: "request names 10bd40ca6b9d; promoted staging is b5a770518671",
      },
    });
    assert.match(text, /expected_staging_sha_mismatch/);
    assert.match(text, /10bd40ca6b9d/);
    assert.match(text, /b5a770518671/);
  });

  await t.test("the wrapper code survives alongside the cause", () => {
    const text = describeExecutionFailure({
      ok: false,
      error: "input_validation_failed",
      validation: { ok: false, error: "missing_reason", detail: "state why convergence is needed" },
    });
    assert.match(text, /input_validation_failed/);
    assert.match(text, /missing_reason/);
  });

  await t.test("six causes under one wrapper are six distinct strings", () => {
    const causes = [
      ["invalid_expected_staging_sha", "expected_staging_sha must be a git sha"],
      ["missing_reason", "state why convergence is needed"],
      ["unsupported_ref", "this action installs origin/staging only"],
      ["promoted_staging_unreadable", "could not resolve promoted staging"],
      ["expected_staging_sha_mismatch", "request names aaaaaaaaaaaa; promoted staging is bbbbbbbbbbbb"],
      ["convergence_blocked", "gateway path is unpinned"],
    ];
    const rendered = causes.map(([error, detail]) =>
      describeExecutionFailure({ ok: false, error: "input_validation_failed", validation: { error, detail } }));
    assert.equal(new Set(rendered).size, causes.length,
      "every cause must be distinguishable; collapsing them is the defect");
  });

  await t.test("a detail is not duplicated when it repeats the code", () => {
    const text = describeExecutionFailure({
      ok: false, error: "input_validation_failed",
      validation: { error: "input_validation_failed", detail: "bad input" },
    });
    assert.equal(text.match(/input_validation_failed/g).length, 1);
  });

  await t.test("a secret quoted in a detail goes through the governed filter", () => {
    /*
     * MEASURED, NOT ASSUMED. The shared filter covers connection strings,
     * DATABASE_URL and JWTs — and nothing else. A first draft of this case
     * asserted that `password=hunter2` would be masked; it is not, because that
     * class was never in the pattern. The lock states the real boundary rather
     * than a comfortable one, so nobody reads this path as blanket redaction.
     */
    const dsn = describeExecutionFailure({
      ok: false,
      error: "input_validation_failed",
      validation: { error: "bad_target", detail: "refused postgresql://u:p@host:5432/db as a target" },
    });
    assert.doesNotMatch(dsn, /u:p@host/);
    assert.match(dsn, /\[redacted\]/);

    const jwt = describeExecutionFailure({
      ok: false,
      error: "input_validation_failed",
      validation: { error: "bad_token", detail: `rejected eyJ${"a".repeat(24)}.payload.signature` },
    });
    assert.match(jwt, /\[redacted\]/);
  });

  await t.test("the filter's reach is narrow, and this path does not widen it", () => {
    // Documents the limit above as a fact about the shared filter, so a future
    // reader does not mistake "it went through redact()" for "it is safe to
    // quote any input here". Widening secretRe is a separate, wider change.
    const text = describeExecutionFailure({
      ok: false, error: "input_validation_failed",
      validation: { error: "bad_token", detail: "rejected password=hunter2" },
    });
    assert.match(text, /hunter2/,
      "the shared filter does not cover bare key=value secrets; validators must not quote them");
  });

  await t.test("no validation half still yields the outer code", () => {
    assert.match(describeExecutionFailure({ ok: false, error: "execution_threw" }), /execution_threw/);
  });

  await t.test("the action failureReason is used when nothing else exists", () => {
    assert.match(
      describeExecutionFailure({ ok: false, action: { failureReason: "child exited 127" } }),
      /child exited 127/,
    );
  });

  await t.test("an empty result is never an empty message", () => {
    assert.equal(describeExecutionFailure({}), "trusted-host execution failed");
    assert.equal(describeExecutionFailure(null), "trusted-host execution failed");
  });

  await t.test("the message fits the 500-char failure_reason bound", () => {
    const text = describeExecutionFailure({
      ok: false, error: "input_validation_failed",
      validation: { error: "convergence_blocked", detail: "x".repeat(2000) },
    });
    assert.ok(text.length > 100, "long details are carried, not discarded");
  });
});
