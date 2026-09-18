import { test } from "node:test";
import assert from "node:assert/strict";
import { settingsSchema } from "../lib/settings-schema";
import { defaultSettings } from "../lib/types";

test("settings accept ordinary US phone formatting and save canonical E.164", () => {
  for (const input of [
    "4155550123",
    "(415) 555-0123",
    "1-415-555-0123",
    "+1 (415) 555-0123",
    " +14155550123 ",
  ]) {
    const settings = settingsSchema.parse({
      ...defaultSettings,
      photonRecipient: input,
    });
    assert.equal(settings.photonRecipient, "+14155550123");
  }
});

test("international phone country codes survive formatting", () => {
  const settings = settingsSchema.parse({
    ...defaultSettings,
    photonRecipient: "+44 7700 900123",
  });
  assert.equal(settings.photonRecipient, "+447700900123");
});

test("invalid recipients fail with a phone-specific error and do not accept extensions", () => {
  for (const photonRecipient of [
    "415-555",
    "+14155550123 ext 9",
    "abc4155550123",
    "+0123456789",
    "++14155550123",
  ]) {
    const result = settingsSchema.safeParse({
      ...defaultSettings,
      photonRecipient,
    });
    assert.equal(result.success, false);
    if (!result.success)
      assert.match(result.error.issues[0].message, /phone|country/i);
  }
  assert.equal(
    settingsSchema.parse({ ...defaultSettings, photonRecipient: "" })
      .photonRecipient,
    "",
  );
});
