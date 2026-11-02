import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import {
  loadTheme,
  applyTheme,
  saveTheme,
  resolveTheme,
} from "../src/web/theme.ts";
import { ReadAloud, localVoices } from "../src/web/speech.tsx";

test("theme switches persist per device, follow system and update native controls and browser chrome", () => {
  const dom = new JSDOM('<meta name="theme-color" content="#7560d3">', {
    url: "https://recall.example.test",
  });
  let dark = false;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
  });
  Object.defineProperty(dom.window, "matchMedia", {
    value: () => ({ matches: dark }),
  });
  try {
    assert.equal(loadTheme(), "system");
    assert.equal(applyTheme(loadTheme()), "light");
    saveTheme("dark");
    assert.equal(loadTheme(), "dark");
    assert.equal(document.documentElement.dataset.theme, "dark");
    assert.equal(document.documentElement.style.colorScheme, "dark");
    assert.equal(
      document
        .querySelector('meta[name="theme-color"]')!
        .getAttribute("content"),
      "#18171f",
    );
    saveTheme("light");
    assert.equal(document.documentElement.dataset.theme, "light");
    dark = true;
    saveTheme("system");
    assert.equal(document.documentElement.dataset.theme, "dark");
    dark = false;
    applyTheme("system");
    assert.equal(document.documentElement.dataset.theme, "light");
    dom.window.localStorage.setItem("recall-theme", "invalid");
    assert.equal(loadTheme(), "system");
    assert.equal(resolveTheme("light", true), "light");
  } finally {
    dom.window.close();
  }
});
test("read-aloud is explicit, uses local voices only, stops on navigation and handles unavailable voices", async () => {
  const dom = new JSDOM(
    '<html lang="en"><body><div id="root"></div></body></html>',
    { url: "https://recall.example.test" },
  );
  const synth = new dom.window.EventTarget() as EventTarget & {
    getVoices: () => SpeechSynthesisVoice[];
    speak: (u: any) => void;
    cancel: () => void;
  };
  let voices = [
    { name: "Remote", lang: "en-US", localService: false },
  ] as SpeechSynthesisVoice[];
  const spoken: any[] = [];
  let cancelled = 0;
  synth.getVoices = () => voices;
  synth.speak = (u) => spoken.push(u);
  synth.cancel = () => {
    cancelled++;
  };
  class Utterance {
    constructor(public text: string) {}
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    SpeechSynthesisUtterance: Utterance,
    IS_REACT_ACT_ENVIRONMENT: true,
    Event: dom.window.Event,
  });
  Object.defineProperty(dom.window, "speechSynthesis", { value: synth });
  Object.defineProperty(dom.window, "SpeechSynthesisUtterance", {
    value: Utterance,
  });
  const { createRoot } = await import("react-dom/client"),
    root = createRoot(document.getElementById("root")!);
  try {
    await act(async () =>
      root.render(<ReadAloud text="A practice question" />),
    );
    assert.equal(spoken.length, 0);
    assert.equal(document.querySelector("button")!.disabled, true);
    voices = [
      ...voices,
      {
        name: "Device",
        lang: "en-GB",
        localService: true,
      } as SpeechSynthesisVoice,
    ];
    await act(async () => synth.dispatchEvent(new Event("voiceschanged")));
    assert.equal(localVoices(voices).length, 1);
    await act(async () => document.querySelector("button")!.click());
    assert.equal(spoken[0].voice.name, "Device");
    assert.equal(spoken[0].text, "A practice question");
    assert.equal(
      document.querySelector("button")!.getAttribute("aria-pressed"),
      "true",
    );
    const before = cancelled;
    await act(async () =>
      root.render(<ReadAloud text="A different question" />),
    );
    assert.ok(cancelled > before);
    assert.equal(spoken.length, 1, "Changing cards must never autoplay");
    assert.equal(
      document.querySelector("button")!.getAttribute("aria-pressed"),
      "false",
    );
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
