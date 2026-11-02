import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { Dictation, type Recognition } from "../src/web/dictation.tsx";
import { setLanguage } from "../src/web/i18n.ts";

async function setup(Constructor?: unknown) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://recall.example.test",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(dom.window, "isSecureContext", { value: true });
  if (Constructor)
    Object.defineProperty(dom.window, "SpeechRecognition", {
      value: Constructor,
    });
  await setLanguage("en");
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const inserted: string[] = [];
  const render = async (key = "card-1", disabled = false) =>
    act(async () =>
      root.render(
        <Dictation
          key={key}
          draftKey={key}
          disabled={disabled}
          onInsert={(text) => inserted.push(text)}
        />,
      ),
    );
  const button = (label: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === label,
    )!;
  const click = async (label: string) => act(async () => button(label).click());
  return {
    dom,
    root,
    inserted,
    render,
    button,
    click,
    close: async () => {
      await act(async () => root.unmount());
      dom.window.close();
    },
  };
}
class LocalRecognition implements Recognition {
  static instances: LocalRecognition[] = [];
  static async available() {
    return "available";
  }
  processLocally = false;
  lang = "";
  continuous = true;
  interimResults = false;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  starts = 0;
  aborts = 0;
  constructor() {
    LocalRecognition.instances.push(this);
  }
  start() {
    this.starts++;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.aborts++;
  }
}

test("dictation stays local by default, previews without submitting, deduplicates results and isolates late events and drafts", async () => {
  LocalRecognition.instances = [];
  const h = await setup(LocalRecognition);
  try {
    await h.render();
    assert.equal(
      LocalRecognition.instances.length,
      0,
      "No microphone action on mount",
    );
    await h.click("Dictate answer");
    const r = LocalRecognition.instances.at(-1)!;
    assert.equal(r.processLocally, true);
    assert.equal(r.lang, "en-US");
    assert.equal(r.starts, 1);
    assert.equal(r.continuous, false);
    await act(async () =>
      r.onresult?.({ results: [[{ transcript: "No read" }]] }),
    );
    await act(async () =>
      r.onresult?.({ results: [[{ transcript: "No read up" }]] }),
    );
    assert.deepEqual(h.inserted, []);
    const late = r.onresult!;
    await h.click("Stop dictation");
    await h.click("Dictate answer");
    const continued = LocalRecognition.instances.at(-1)!;
    await act(async () =>
      continued.onresult?.({ results: [[{ transcript: "No write down" }]] }),
    );
    await h.click("Stop dictation");
    assert.equal(
      document.querySelector<HTMLTextAreaElement>("textarea")!.value,
      "No read up No write down",
    );
    // A preview survives reload/remount on this card, but cannot leak onto another card.
    await h.render("card-2");
    assert.equal(document.querySelector("textarea"), null);
    await act(async () =>
      late({ results: [[{ transcript: "Obsolete result" }]] }),
    );
    assert.equal(document.querySelector("textarea"), null);
    await h.render("card-1");
    assert.equal(
      document.querySelector<HTMLTextAreaElement>("textarea")!.value,
      "No read up No write down",
    );
    await h.click("Insert into answer");
    assert.deepEqual(h.inserted, ["No read up No write down"]);
    assert.equal(document.querySelector("textarea"), null);
    await h.click("Dictate answer");
    const active = LocalRecognition.instances.at(-1)!;
    await act(async () =>
      window.dispatchEvent(new Event("recall-stop-dictation")),
    );
    assert.ok(active.aborts > 0);
    assert.equal(active.onresult, null);
    await h.click("Dictate answer");
    const next = LocalRecognition.instances.at(-1)!;
    await h.render("card-1", true);
    assert.ok(next.aborts > 0);
  } finally {
    await h.close();
  }
});

test("remote recognition needs explicit opt-in, permission failures remain editable and control keys never submit an answer", async () => {
  class BrowserRecognition extends LocalRecognition {
    constructor() {
      super();
      delete (this as Partial<LocalRecognition>).processLocally;
    }
  }
  LocalRecognition.instances = [];
  const h = await setup(BrowserRecognition);
  try {
    await h.render();
    await h.click("Dictate answer");
    assert.equal(LocalRecognition.instances.at(-1)!.starts, 0);
    assert.match(
      document.querySelector("[role=status]")!.textContent!,
      /On-device speech is unavailable/,
    );
    await act(async () =>
      document.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(),
    );
    assert.match(
      document.querySelector(".dictation-privacy")!.textContent!,
      /may send microphone audio/,
    );
    assert.equal(
      LocalRecognition.instances.at(-1)!.starts,
      0,
      "Opting in does not start recording",
    );
    let bubbled = 0;
    document.addEventListener("keydown", () => bubbled++);
    await act(async () =>
      h.button("Dictate answer").dispatchEvent(
        new h.dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      ),
    );
    assert.equal(bubbled, 0);
    await h.click("Dictate answer");
    const r = LocalRecognition.instances.at(-1)!;
    assert.equal(r.starts, 1);
    await act(async () => r.onerror?.({ error: "not-allowed" }));
    assert.match(
      document.querySelector("[role=status]")!.textContent!,
      /access was denied/,
    );
    assert.ok(h.button("Dictate answer"));
    assert.deepEqual(h.inserted, []);
  } finally {
    await h.close();
  }
});

test("unsupported browsers fall back without starting anything and cancelled availability checks never start later", async () => {
  let h = await setup();
  try {
    await h.render();
    assert.equal(document.querySelector("button"), null);
    assert.match(document.body.textContent!, /operating system’s dictation/);
  } finally {
    await h.close();
  }
  let ready!: (status: string) => void;
  class CheckingRecognition extends LocalRecognition {
    static available = () =>
      new Promise<string>((resolve) => {
        ready = resolve;
      });
  }
  LocalRecognition.instances = [];
  h = await setup(CheckingRecognition);
  try {
    await h.render();
    await h.click("Dictate answer");
    await h.click("Cancel speech check");
    await act(async () => ready("available"));
    assert.equal(LocalRecognition.instances.at(-1)!.starts, 0);
    assert.deepEqual(h.inserted, []);
  } finally {
    await h.close();
  }
});
