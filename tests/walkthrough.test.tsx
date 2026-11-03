import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { Walkthrough } from "../src/web/walkthrough.tsx";
import {
  walkthroughSource,
  walkthroughBank,
  walkthroughSteps,
} from "../src/web/walkthrough-data.ts";
import { parseBank } from "../src/core/bank.ts";
import { resolveVariant } from "../src/core/questions.ts";
import { setLanguage } from "../src/web/i18n.ts";

test("the downloadable walkthrough and every README JSON example validate, and the reference names every supported field", async () => {
  assert.equal(walkthroughBank.questions.length, 11);
  const ids = new Set(walkthroughBank.questions.map((q) => q.id));
  for (const step of walkthroughSteps) {
    assert.ok(ids.has(step.question));
    const q = walkthroughBank.questions.find((q) => q.id === step.question)!;
    assert.equal(resolveVariant(q, step.variant).id, step.variant);
  }
  const text = await readFile("README.md", "utf8");
  const snippets = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  assert.ok(snippets.length >= 4);
  for (const [, json] of snippets) {
    const value = JSON.parse(json);
    parseBank(
      value.deck
        ? value
        : value.type
          ? {
              deck: "Documentation",
              questions: [
                {
                  id: "example",
                  question: "Q",
                  answer: "A",
                  variants: [value],
                },
              ],
            }
          : { deck: "Documentation", questions: [value] },
    );
  }
  const schema = JSON.parse(
    await readFile("docs/question-bank.schema.json", "utf8"),
  );
  for (const key of Object.keys(schema.properties))
    assert.ok(text.includes("`" + key + "`"), `Missing bank field ${key}`);
  for (const key of Object.keys(schema.properties.questions.items.properties))
    assert.ok(text.includes("`" + key + "`"), `Missing question field ${key}`);
});

test("guided practice uses the shared rules without network or workspace writes, teaches all formats, and exports questions only", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://recall.example.test/#guide",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Event: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent,
    localStorage: dom.window.localStorage,
    location: dom.window.location,
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  dom.window.scrollTo = () => {};
  localStorage.setItem("real-deck", "Personal study stays unchanged");
  let requests = 0,
    closed = 0;
  const saves: any[] = [];
  const errors: unknown[] = [];
  dom.window.addEventListener("error", (event) => errors.push(event.error));
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("No network in tutorial");
  });
  window.RecallFiles = {
    postMessage: (message) => saves.push(JSON.parse(message)),
  };
  await setLanguage("en");
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const button = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.trim() === label,
    )!;
  const click = async (label: string) => act(async () => button(label).click());
  const chapter = async (id: string) =>
    act(async () =>
      document
        .querySelectorAll<HTMLButtonElement>(".guide-steps button")
        [walkthroughSteps.findIndex((s) => s.id === id)].click(),
    );
  const type = async (value: string) =>
    act(async () => {
      const input = document.querySelector<HTMLTextAreaElement>(
        ".guide-answer-label textarea",
      )!;
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(<Walkthrough onClose={() => closed++} />),
    );
    const monday = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".guide-option"),
    ).find((b) => b.textContent!.includes("Monday"))!;
    await act(async () => monday.click());
    assert.match(
      document.querySelector(".guide-verdict")!.textContent!,
      /Correct/,
    );
    await chapter("aliases");
    await type("sixty");
    await click("Check answer");
    assert.match(
      document.querySelector(".guide-verdict")!.textContent!,
      /Correct/,
    );
    await chapter("prose");
    await type("It helps me avoid missing a step.");
    await click("Compare answer");
    assert.match(
      document.querySelector(".answer-comparison")!.textContent!,
      /It helps me avoid missing a step/,
    );
    await click("Good");
    await chapter("reverse");
    await type("First in, first out");
    await click("Check answer");
    await click("Reverse prompt");
    await type("FIFO");
    await click("Check answer");
    assert.match(
      document.querySelector(".guide-direction-progress")!.textContent!,
      /forward 1 · reverse 1/,
    );
    await chapter("select");
    for (const option of ["2", "4"]) {
      const b = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".guide-option"),
      ).find((b) => b.textContent!.trim().slice(1) === option)!;
      await act(async () => b.click());
    }
    await click("Check answer");
    assert.match(
      document.querySelector(".guide-verdict")!.textContent!,
      /Correct/,
    );
    await chapter("parts");
    await type("four; two");
    await click("Check answer");
    assert.match(
      document.querySelector(".guide-verdict")!.textContent!,
      /Correct/,
    );
    await chapter("hint");
    await click("Show hint");
    assert.match(
      document.querySelector(".guide-hint")!.textContent!,
      /does not add unaided mastery/,
    );
    await chapter("matching");
    for (const select of document.querySelectorAll<HTMLSelectElement>(
      ".guide-matching select",
    )) {
      await act(async () => {
        select.value = select.parentElement!.textContent!.startsWith("Save")
          ? "Keep changes"
          : "Reverse the last change";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    await click("Check answer");
    assert.match(
      document.querySelector(".guide-verdict")!.textContent!,
      /Correct/,
    );
    await chapter("flashcards");
    await click("Reveal answer");
    await click("Good");
    await chapter("dependencies");
    assert.ok(document.querySelector(".guide-locked"));
    await click("Practise the foundation");
    for (let n = 0; n < 2; n++) {
      await type("60");
      await click("Check answer");
      if (n === 0) await click("Try this example again");
    }
    await chapter("dependencies");
    assert.equal(
      document.querySelector(".guide-locked"),
      null,
      "Three unaided foundation recalls unlock application",
    );
    await chapter("defaults");
    assert.ok(document.querySelectorAll(".guide-option").length >= 2);
    await chapter("pictures");
    assert.equal(
      document.querySelectorAll(".guide-authoring-steps li").length,
      3,
    );
    assert.ok(document.querySelector(".guide-card .quiz-image img"));
    await chapter("math");
    const example = JSON.parse(
      document.querySelector(".guide-authoring-example pre code")!.textContent!,
    );
    assert.equal(example.answer, "$$\\frac{1}{2}$$");
    assert.ok(document.querySelector(".guide-formula-result .katex math"));
    assert.equal(
      walkthroughSteps.length,
      16,
      "Authoring help must not add more chapters",
    );
    await chapter("make");
    const prompt = document.querySelector<HTMLTextAreaElement>(
      ".guide-prompt textarea",
    )!.value;
    assert.ok(prompt.includes("reversible:true"));
    assert.ok(prompt.includes("multiple_select"));
    assert.ok(prompt.includes('"deck": "My first quiz"'));
    await click("Download sample quiz");
    assert.equal(saves.length, 1);
    const saved = JSON.parse(saves[0].content);
    assert.deepEqual(saved, walkthroughSource);
    assert.equal("progress" in saved, false);
    parseBank(saved);
    await act(async () => setLanguage("et"));
    assert.ok(document.body.textContent!.includes("Loo oma viktoriin"));
    await act(async () => setLanguage("en"));
    assert.equal(requests, 0);
    assert.deepEqual(errors, []);
    assert.equal(
      localStorage.getItem("real-deck"),
      "Personal study stays unchanged",
    );
    await click("Back to Recall");
    assert.equal(closed, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
