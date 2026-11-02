import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { Dictation, type Recognition } from "../src/web/dictation.tsx";
import { setLanguage } from "../src/web/i18n.ts";

async function setup(Constructor?: unknown, initial = "") {
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
  const changes: string[] = [],
    submitted: string[] = [];
  function Harness({ id, disabled }: { id: string; disabled: boolean }) {
    const [value, setValue] = useState(initial);
    const submit = () => {
      window.dispatchEvent(new Event("recall-stop-dictation"));
      submitted.push(value);
    };
    return (
      <>
        <textarea
          aria-label="Answer"
          value={value}
          onChange={(e) => {
            window.dispatchEvent(new Event("recall-stop-dictation"));
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Dictation
          draftKey={id}
          disabled={disabled}
          value={value}
          onChange={(text) => {
            changes.push(text);
            setValue(text);
          }}
          onSubmit={submit}
          onReady={() => document.querySelector("textarea")?.focus()}
        />
      </>
    );
  }
  const render = async (id = "card-1", disabled = false) =>
    act(async () =>
      root.render(<Harness key={id} id={id} disabled={disabled} />),
    );
  const button = (label: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === label,
    )!;
  const click = async (label: string) => act(async () => button(label).click());
  return {
    dom,
    root,
    changes,
    submitted,
    render,
    button,
    click,
    value: () => document.querySelector<HTMLTextAreaElement>("textarea")!.value,
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
  continuous = false;
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

test("continuous dictation writes into the answer, survives long pauses and browser disconnects, and stops only on user action", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  LocalRecognition.instances = [];
  const h = await setup(LocalRecognition, "Thought:");
  try {
    await h.render();
    assert.equal(LocalRecognition.instances.length, 0);
    document.querySelector("details")!.open = true;
    await h.click("Dictate answer");
    const first = LocalRecognition.instances.at(-1)!;
    assert.equal(first.processLocally, true);
    assert.equal(first.lang, "en-US");
    assert.equal(first.continuous, true);
    assert.equal(document.querySelector("details")!.open, false);
    assert.equal(document.activeElement, document.querySelector("textarea"));
    await act(async () =>
      first.onresult?.({ results: [[{ transcript: "No read" }]] }),
    );
    await act(async () =>
      first.onresult?.({ results: [[{ transcript: "No read up" }]] }),
    );
    assert.equal(h.value(), "Thought: No read up");
    assert.deepEqual(h.submitted, []);
    assert.equal(document.querySelectorAll("textarea").length, 1);
    assert.equal(h.button("Insert into answer"), undefined);
    await act(async () => t.mock.timers.tick(120000));
    assert.equal(first.aborts, 0, "No one-minute app cutoff");
    assert.ok(h.button("Stop dictation"));
    const late = first.onresult!;
    await act(async () => {
      first.onerror?.({ error: "no-speech" });
      first.onend?.();
    });
    await act(async () => t.mock.timers.tick(15000));
    const second = LocalRecognition.instances.at(-1)!;
    assert.notEqual(second, first);
    assert.equal(second.starts, 1);
    await act(async () =>
      second.onresult?.({ results: [[{ transcript: "No write down" }]] }),
    );
    await act(async () =>
      late({ results: [[{ transcript: "Obsolete text" }]] }),
    );
    assert.equal(h.value(), "Thought: No read up No write down");
    await h.click("Stop dictation");
    const count = LocalRecognition.instances.length;
    await act(async () => t.mock.timers.tick(120000));
    assert.equal(LocalRecognition.instances.length, count);
    assert.ok(second.aborts > 0);
    await h.render("card-2");
    assert.equal(h.value(), "Thought:");
    await act(async () => late({ results: [[{ transcript: "Wrong card" }]] }));
    assert.equal(h.value(), "Thought:");
  } finally {
    await h.close();
  }
});

test("Enter stops and submits current dictated text without a separate Stop; submission cancels pending silent restarts", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  LocalRecognition.instances = [];
  const h = await setup(LocalRecognition);
  try {
    await h.render();
    await h.click("Dictate answer");
    const r = LocalRecognition.instances.at(-1)!;
    await act(async () =>
      r.onresult?.({ results: [[{ transcript: "My spoken answer" }]] }),
    );
    const late = r.onresult!;
    await act(async () =>
      document
        .querySelector("textarea")!
        .dispatchEvent(
          new h.dom.window.KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
          }),
        ),
    );
    assert.deepEqual(h.submitted, ["My spoken answer"]);
    assert.ok(r.aborts > 0);
    await act(async () =>
      late({ results: [[{ transcript: "Late final answer" }]] }),
    );
    assert.equal(h.value(), "My spoken answer");
    await h.click("Dictate answer");
    const next = LocalRecognition.instances.at(-1)!;
    await act(async () => next.onend?.());
    const count = LocalRecognition.instances.length;
    await act(async () =>
      h
        .button("Stop dictation")
        .dispatchEvent(
          new h.dom.window.KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
          }),
        ),
    );
    await act(async () => t.mock.timers.tick(15000));
    assert.equal(LocalRecognition.instances.length, count);
    assert.deepEqual(h.submitted, ["My spoken answer", "My spoken answer"]);
  } finally {
    await h.close();
  }
});

test("browser-service opt-in remains explicit, permission errors stop retrying, and legacy previews migrate without grading", async () => {
  class BrowserRecognition extends LocalRecognition {
    constructor() {
      super();
      delete (this as Partial<LocalRecognition>).processLocally;
    }
  }
  LocalRecognition.instances = [];
  const h = await setup(BrowserRecognition);
  try {
    sessionStorage.setItem(
      "recall-dictation-preview:card-1",
      "An existing preview",
    );
    await h.render();
    assert.equal(h.value(), "An existing preview");
    assert.equal(
      sessionStorage.getItem("recall-dictation-preview:card-1"),
      null,
    );
    assert.deepEqual(h.submitted, []);
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
    assert.equal(LocalRecognition.instances.at(-1)!.starts, 0);
    let bubbled = 0;
    document.addEventListener("keydown", () => bubbled++);
    await act(async () =>
      h
        .button("Dictate answer")
        .dispatchEvent(
          new h.dom.window.KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
          }),
        ),
    );
    assert.equal(bubbled, 0);
    await h.click("Dictate answer");
    const r = LocalRecognition.instances.at(-1)!;
    await act(async () => r.onerror?.({ error: "not-allowed" }));
    assert.match(
      document.querySelector("[role=status]")!.textContent!,
      /access was denied/,
    );
    assert.equal(r.onend, null);
    assert.ok(r.aborts > 0);
    assert.deepEqual(h.submitted, []);
  } finally {
    await h.close();
  }
});

test("unsupported browsers fall back and cancelled local-availability checks never start later", async () => {
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
  } finally {
    await h.close();
  }
});
