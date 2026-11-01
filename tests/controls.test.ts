import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultStudyControls,
  loadStudyControls,
  saveStudyControls,
  continuesFeedback,
  validContinueKey,
} from "../src/web/controls.ts";
test("study controls default to immediate single-choice submission and Space continuation", () => {
  Object.assign(globalThis, { localStorage: { getItem: () => null } });
  assert.deepEqual(loadStudyControls(), defaultStudyControls);
  assert.equal(continuesFeedback({ key: " " }, defaultStudyControls), true);
  assert.equal(
    continuesFeedback({ key: "Enter" }, defaultStudyControls),
    false,
  );
  assert.equal(continuesFeedback({ key: "1" }, defaultStudyControls), false);
});
test("custom and any-key continuation preserve typing composition, shortcuts, navigation and held keys", () => {
  const custom = { ...defaultStudyControls, continueKey: "f" };
  assert.equal(continuesFeedback({ key: "F" }, custom), true);
  assert.equal(continuesFeedback({ key: " " }, custom), false);
  const any = { ...defaultStudyControls, continueMode: "any" as const };
  assert.equal(continuesFeedback({ key: "q" }, any), true);
  assert.equal(continuesFeedback({ key: "ArrowRight" }, any), true);
  for (const event of [
    { key: "q", repeat: true },
    { key: "q", isComposing: true },
    { key: "q", ctrlKey: true },
    { key: "q", metaKey: true },
    { key: "q", altKey: true },
    { key: "Tab" },
    { key: "Escape" },
    { key: "Shift" },
  ])
    assert.equal(continuesFeedback(event, any), false);
  assert.equal(
    continuesFeedback({ key: " " }, { ...any, continueMode: "button" }),
    false,
  );
  assert.equal(validContinueKey("Tab"), false);
});
test("preferences persist on the device and malformed settings recover safely", () => {
  const values = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
  });
  const choice = {
    autoSubmitSingle: false,
    continueMode: "any" as const,
    continueKey: "ArrowRight",
  };
  saveStudyControls(choice);
  assert.deepEqual(loadStudyControls(), choice);
  values.set("recall-study-controls", "{");
  assert.deepEqual(loadStudyControls(), defaultStudyControls);
  values.set(
    "recall-study-controls",
    JSON.stringify({
      autoSubmitSingle: "no",
      continueMode: "bad",
      continueKey: "Escape",
    }),
  );
  assert.deepEqual(loadStudyControls(), defaultStudyControls);
});
