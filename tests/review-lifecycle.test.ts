import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuditHook } from "../agent/hooks/audit";

test("a recorded input-limit event retains its real cause when turn.completed follows", async () => {
  const failures: string[] = [];
  let active = true;
  const hook = createAuditHook({
    async findActiveReviews(sessionId) {
      assert.equal(sessionId, "fixture");
      return active ? [{ id: "review" }] : [];
    },
    async failReview(_id, reason) {
      failures.push(reason);
      active = false;
    },
  });
  const onInput = hook.events!["input.requested"]!;
  const onCompleted = hook.events!["turn.completed"]!;
  const ctx = { session: { id: "fixture" } } as Parameters<typeof onInput>[1];
  await onInput(
    {
      data: {
        requests: [
          {
            kind: "session-limit",
            action: {
              input: { kind: "input", limit: 80000, usedTokens: 84422 },
            },
          },
        ],
      },
    } as unknown as Parameters<typeof onInput>[0],
    ctx,
  );
  await onCompleted({ data: {} } as Parameters<typeof onCompleted>[0], ctx);
  assert.deepEqual(failures, [
    "I reached this review's data limit before I could save the result.",
  ]);
});

test("owner approval requests do not get mislabeled as a token-limit failure", async () => {
  const hook = createAuditHook({
    async findActiveReviews() {
      throw new Error("Must not fail reviews for an owner approval");
    },
    async failReview() {
      throw new Error("Must not fail");
    },
  });
  const onInput = hook.events!["input.requested"]!;
  await onInput(
    {
      data: {
        requests: [
          { kind: "tool-approval", action: { input: { kind: "input" } } },
        ],
      },
    } as unknown as Parameters<typeof onInput>[0],
    { session: { id: "fixture" } } as Parameters<typeof onInput>[1],
  );
});

for (const [kind, expected] of [
  ["output", "response limit"],
  ["token-cost", "AI cost limit"],
]) {
  test(`session ${kind} limit is reported without asking to bypass it`, async () => {
    const reasons: string[] = [];
    const hook = createAuditHook({
      async findActiveReviews() {
        return [{ id: "review" }];
      },
      async failReview(_id, reason) {
        reasons.push(reason);
      },
    });
    const onInput = hook.events!["input.requested"]!;
    await onInput(
      {
        data: {
          requests: [{ kind: "session-limit", action: { input: { kind } } }],
        },
      } as unknown as Parameters<typeof onInput>[0],
      { session: { id: "fixture" } } as Parameters<typeof onInput>[1],
    );
    assert.equal(reasons.length, 1);
    assert.ok(reasons[0].includes(expected));
    assert.ok(!reasons[0].includes("Approve"));
  });
}
