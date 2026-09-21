import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatUpdate,
  formatReviewMessage,
  formatActionMessage,
} from "../lib/messages";
import { isPhotonOwner } from "../lib/photon-owner";
import { photonFailure } from "../lib/photon-failure";
import type { Proposal } from "../lib/types";

test("Photon permission failures are clear; uncertain sends never become automatic retries", () => {
  assert.equal(
    photonFailure(
      new Error("[spectrum-imessage] Target not allowed for this project"),
      true,
      1,
    ).status,
    "failed",
  );
  const unknown = photonFailure(
    new Error("timeout with private provider data"),
    true,
    1,
  );
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.message.includes("private provider data"), false);
  assert.equal(
    photonFailure(new Error("connection"), false, 1).status,
    "pending",
  );
});

test("messages bound the lead and bullets and include only two distinct HTTPS sources", () => {
  const body = formatUpdate({
    summary: "A long summary. ".repeat(50),
    bullets: Array(6).fill("A useful point. ".repeat(50)),
    sources: [
      { url: "javascript:alert(1)" },
      { url: "https://example.com/a" },
      { url: "https://example.com/a" },
      { url: "https://example.com/b" },
      { url: "https://example.com/c" },
    ],
  });
  const lines = body.split("\n");
  assert.ok(Array.from(lines[0]).length <= 280);
  const bullets = lines.filter((l) => l.startsWith("- "));
  assert.equal(bullets.length, 3);
  assert.ok(bullets.every((l) => Array.from(l.slice(2)).length <= 160));
  assert.deepEqual(
    lines.filter((l) => l.startsWith("https:")),
    ["https://example.com/a", "https://example.com/b"],
  );
});

test("stored review bullets use real newlines and do not leak into the lead", () => {
  const text = formatReviewMessage(
    "Your team is ready.\n\n- Keep the starters.\n\n- Check the injury report.",
    [],
    [],
  );
  assert.equal(text.split("\n")[0], "Eve: Your team is ready.");
  assert.ok(text.includes("\n- Check the injury report."));
  assert.equal(text.includes("- -"), false);
});

test("trade texts distinguish acceptance, decline and completion", () => {
  const p = {
    kind: "trade_response",
    tradeResponse: "accept",
    title: "Trade",
    sources: [],
  } as unknown as Proposal;
  assert.match(formatActionMessage(p, "submitted", ""), /has not completed/);
  assert.match(
    formatActionMessage(p, "verified", ""),
    /confirmed the roster change/,
  );
  assert.match(
    formatActionMessage({ ...p, tradeResponse: "decline" }, "verified", ""),
    /declined/,
  );
});

test("only the registered owner's direct inbound texts can reach the agent", () => {
  const owner = "+12025550101";
  assert.equal(isPhotonOwner({ userId: "202-555-0101" }, owner, true), true);
  for (const author of [
    { userId: "+12025550102" },
    { userId: owner, isMe: true },
    { userId: owner, isBot: true },
    { userId: "" },
  ])
    assert.equal(isPhotonOwner(author, owner, true), false);
  assert.equal(isPhotonOwner({ userId: owner }, owner, false), false);
  assert.equal(isPhotonOwner({ userId: "" }, "", true), false);
});
