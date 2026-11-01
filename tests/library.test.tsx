import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { QuestionLibrary } from "../src/web/library.tsx";
import { parseBank } from "../src/core/bank.ts";
import { validatePrerequisites } from "../src/core/prerequisites.ts";
import { emptyProgress, type Question } from "../src/core/types.ts";

test("library drag/drop sets the correct dependency direction, rejects cycles, moves topics and undoes", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "https://recall.example.test",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let items = parseBank({
    deck: "UI",
    questions: [
      {
        id: "foundation",
        topic: "Basics",
        question: "Foundation definition",
        answer: "A",
      },
      {
        id: "application",
        topic: "Practice",
        question: "Applied problem",
        answer: "B",
      },
    ],
  }).questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
  const rejected: string[] = [];
  const save = async (q: Question) => {
    const next = items.map((i) =>
      i.question.id === q.id ? { ...i, question: q } : i,
    );
    try {
      validatePrerequisites(next.map((i) => i.question));
    } catch (e) {
      rejected.push((e as Error).message);
      return false;
    }
    items = next;
    render();
    return true;
  };
  const render = () =>
    root.render(
      <QuestionLibrary
        items={items}
        topic=""
        search=""
        busy={false}
        onTopic={() => {}}
        onEdit={() => {}}
        onUpdate={save}
      />,
    );
  const row = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>(".question-row")].find(
      (e) => e.textContent?.includes(text),
    )!;
  async function drag(source: Element, target: Element) {
    const values = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => values.set(k, v),
      getData: (k: string) => values.get(k) ?? "",
      effectAllowed: "",
    };
    await act(async () => {
      for (const [element, type] of [
        [source, "dragstart"],
        [target, "dragover"],
        [target, "drop"],
      ] as const) {
        const event = new dom.window.Event(type, {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
        element.dispatchEvent(event);
      }
    });
  }
  try {
    await act(async () => render());
    await drag(row("Applied problem"), row("Foundation definition"));
    assert.deepEqual(
      items.find((i) => i.question.id === "application")!.question.depends_on,
      ["foundation"],
    );
    assert.equal(items[0].question.depends_on, undefined);
    assert.match(document.body.textContent!, /RequiresFoundation definition/);
    await drag(row("Foundation definition"), row("Applied problem"));
    assert.match(rejected[0], /cycle/);
    assert.equal(items[0].question.depends_on, undefined);
    const heading = document.querySelector(
      '[aria-label="Basics questions"] .library-topic-heading',
    )!;
    await drag(row("Applied problem"), heading);
    assert.equal(items[1].question.topic, "Basics");
    assert.deepEqual(items[1].question.depends_on, ["foundation"]);
    const undo = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((e) => e.textContent === "Undo last change")!;
    await act(async () => undo.click());
    assert.equal(items[1].question.topic, "Practice");
    assert.deepEqual(items[1].question.depends_on, ["foundation"]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
