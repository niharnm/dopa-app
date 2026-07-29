import assert from "node:assert/strict";
import {
  assertTransition,
  canTransition,
  checkpointDigest,
  demonstrationResult,
  makeEvent,
  maskSandboxReference,
} from "../lib/fc-sandbox/lifecycle";

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

test("permits only the approval-gated lifecycle", () => {
  assert.equal(canTransition("created", "provisioning"), true);
  assert.equal(canTransition("provisioning", "validating"), true);
  assert.equal(canTransition("validating", "awaiting_approval"), true);
  assert.equal(canTransition("awaiting_approval", "pausing"), true);
  assert.equal(canTransition("pausing", "hibernated"), true);
  assert.equal(canTransition("hibernated", "resuming"), true);
  assert.equal(canTransition("resuming", "scoring"), true);
  assert.equal(canTransition("scoring", "completed"), true);

  assert.equal(canTransition("awaiting_approval", "scoring"), false);
  assert.equal(canTransition("created", "validating"), false);
  assert.equal(canTransition("hibernated", "completed"), false);
  assert.equal(canTransition("completed", "resuming"), false);
  assert.throws(() => assertTransition("hibernated", "scoring"));
});

test("produces stable, stage-bound checkpoint digests", () => {
  const first = checkpointDigest(
    "run-1",
    "trace-1",
    1,
    "awaiting_approval",
  );
  const repeated = checkpointDigest(
    "run-1",
    "trace-1",
    1,
    "awaiting_approval",
  );
  const advanced = checkpointDigest(
    "run-1",
    "trace-1",
    2,
    "awaiting_approval",
  );

  assert.equal(first, repeated);
  assert.notEqual(first, advanced);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("keeps local results explicitly marked as fixtures", () => {
  const result = demonstrationResult();
  assert.equal(result.source, "demonstration_fixture");
  assert.equal(result.predictedCtrPercent, 2.84);
});

test("bounds public trace summaries and masks sandbox identifiers", () => {
  assert.equal(
    maskSandboxReference("01JCED8Z9Y6XQVK8M2NRST5WXY"),
    "01JCED8Z…5WXY",
  );
  assert.throws(() =>
    makeEvent({
      sequence: 1,
      eventType: "test",
      stage: "created",
      summary: "x".repeat(241),
      evidenceClass: "local_demonstration",
    }),
  );
});
