import { tr } from "./i18n.ts";
export interface StudyControls {
  autoSubmitSingle: boolean;
  continueMode: "key" | "any" | "button";
  continueKey: string;
}
export const defaultStudyControls: StudyControls = {
  autoSubmitSingle: true,
  continueMode: "key",
  continueKey: " ",
};
const storageKey = "recall-study-controls";
const excluded = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "Tab",
  "Escape",
  "CapsLock",
  "Dead",
  "Unidentified",
]);
export const validContinueKey = (key: string) =>
  key.length > 0 && key.length <= 32 && !excluded.has(key);
export function keyLabel(key: string) {
  return key === " "
    ? tr("key.space")
    : key === "ArrowRight"
      ? tr("key.right")
      : key === "ArrowLeft"
        ? tr("key.left")
        : key.length === 1
          ? key.toUpperCase()
          : key;
}
export function loadStudyControls(): StudyControls {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!value) return { ...defaultStudyControls };
    return {
      autoSubmitSingle:
        typeof value.autoSubmitSingle === "boolean"
          ? value.autoSubmitSingle
          : true,
      continueMode: ["key", "any", "button"].includes(value.continueMode)
        ? value.continueMode
        : "key",
      continueKey:
        typeof value.continueKey === "string" &&
        validContinueKey(value.continueKey)
          ? value.continueKey
          : " ",
    };
  } catch {
    return { ...defaultStudyControls };
  }
}
export function saveStudyControls(value: StudyControls) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}
export function continuesFeedback(
  event: {
    key: string;
    repeat?: boolean;
    isComposing?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
  },
  controls: StudyControls,
) {
  if (
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !validContinueKey(event.key)
  )
    return false;
  return (
    controls.continueMode === "any" ||
    (controls.continueMode === "key" &&
      event.key.toLowerCase() === controls.continueKey.toLowerCase())
  );
}
