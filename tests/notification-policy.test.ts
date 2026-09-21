import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewNotificationStatus } from "../lib/notification-policy";
test("one daily digest is sent while pregame, waiver and conversational checks stay in the activity log", () => {
  const checks = [
    {
      id: "daily",
      occurrence: "daily:123:2026:2026-09-20",
      trigger: "daily schedule",
    },
    {
      id: "waiver",
      occurrence: "waiver:123:2026-09-20T07:00Z",
      trigger: "before waiver processing",
    },
    {
      id: "pregame60",
      occurrence: "prelock:123:2026-09-20T17:00Z:60",
      trigger: "before game lock",
    },
    {
      id: "pregame15",
      occurrence: "prelock:123:2026-09-20T17:00Z:15",
      trigger: "before game lock",
    },
    { id: "manual", occurrence: "manual:fixture", trigger: "dashboard" },
    { id: "chat", occurrence: "conversation:fixture", trigger: "conversation" },
  ];
  assert.deepEqual(checks.map(reviewNotificationStatus), [
    "pending",
    "suppressed",
    "suppressed",
    "suppressed",
    "suppressed",
    "suppressed",
  ]);
});
