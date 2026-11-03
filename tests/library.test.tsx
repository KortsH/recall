import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { QuestionLibrary } from "../src/web/library.tsx";
import { parseBank } from "../src/core/bank.ts";
import { validatePrerequisites } from "../src/core/prerequisites.ts";
import { emptyProgress, type Question } from "../src/core/types.ts";
import {
  planOrganization,
  filterQuestions,
  type TopicMove,
} from "../src/core/organization.ts";

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

test("large-library views, filters and selected-card drag/drop use one undoable batch", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "https://recall.example.test",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client"),
    root = createRoot(document.getElementById("root")!);
  let items = parseBank({
    deck: "Large library",
    questions: Array.from({ length: 100 }, (_, n) => ({
      id: `q${n}`,
      topic: n < 10 ? "General" : `Topic ${n % 4}`,
      question: `Synthetic prompt ${n}`,
      answer: `Answer ${n}`,
      difficulty: (n % 5) + 1,
      ...(n === 0
        ? {
            hint: "A starting point",
            flag: { note: "Needs review", allowDependents: false },
          }
        : {}),
    })),
  }).questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
  let batchCalls = 0;
  const move = async (moves: TopicMove[]) => {
    batchCalls++;
    const plan = planOrganization(items, { moves, apply: true });
    const destinations = new Map(plan.changes.map((m) => [m.id, m.topic]));
    items = items.map((i) =>
      destinations.has(i.question.id)
        ? {
            ...i,
            question: {
              ...i.question,
              topic: destinations.get(i.question.id)!,
            },
          }
        : i,
    );
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
        onUpdate={async () => true}
        onMove={move}
      />,
    );
  const button = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (e) => e.textContent === text,
    )!;
  try {
    await act(async () => render());
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="3-column grid"]')!
        .click(),
    );
    assert.equal(
      document
        .querySelector('[aria-label="3-column grid"]')!
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      JSON.parse(dom.window.localStorage.getItem("recall-library-view")!)
        .layout,
      "grid3",
    );
    assert.equal(
      document.querySelectorAll(".library-inbox .question-row").length,
      10,
    );
    await act(async () => {
      document
        .querySelector<HTMLInputElement>('[aria-label="Select q0"]')!
        .click();
      document
        .querySelector<HTMLInputElement>('[aria-label="Select q1"]')!
        .click();
    });
    const values = new Map<string, string>(),
      dataTransfer = {
        setData: (k: string, v: string) => values.set(k, v),
        getData: (k: string) => values.get(k) ?? "",
        effectAllowed: "",
      };
    const source = document.querySelector(
        '[aria-label="Select q0"]',
      )!.parentElement!,
      target = document.querySelector(
        '[aria-label="Topic 0 questions"] .library-topic-heading',
      )!;
    await act(async () => {
      for (const [element, type] of [
        [source, "dragstart"],
        [target, "dragover"],
        [target, "drop"],
      ] as const) {
        const e = new dom.window.Event(type, {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(e, "dataTransfer", { value: dataTransfer });
        element.dispatchEvent(e);
      }
    });
    assert.equal(batchCalls, 1);
    assert.equal(items[0].question.topic, "Topic 0");
    assert.equal(items[1].question.topic, "Topic 0");
    await act(async () => button("Undo last change").click());
    assert.equal(batchCalls, 2);
    assert.equal(items[0].question.topic, "General");
    assert.equal(items[1].question.topic, "General");
    const flags = document.querySelector<HTMLSelectElement>(
      '[aria-label="Filter by flags"]',
    )!;
    await act(async () => {
      flags.value = "with";
      flags.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(document.querySelectorAll(".question-row").length, 1);
    assert.match(document.body.textContent!, /Needs review/);
    await act(async () => button("Clear filters").click());
    assert.equal(document.querySelectorAll(".question-row").length, 100);
    await act(async () => {
      const quick = [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".library-quick-filters button",
        ),
      ].find((b) => b.textContent?.startsWith("Unseen"))!;
      quick.click();
    });
    assert.equal(document.querySelectorAll(".question-row").length, 100);
    assert.equal(
      document.querySelector(".library-quick-filters [aria-pressed=true]")
        ?.textContent,
      "Unseen 100",
    );
    assert.ok(
      items.every((i) => i.revision === 1 && i.progress.attempts === 0),
    );
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("not learned includes seen but unmastered objectives, while unseen excludes them and keeps prerequisite locks", () => {
  const questions = parseBank({
    deck: "Filters",
    questions: [
      { id: "a", question: "A", answer: "A" },
      { id: "b", question: "B", answer: "B", depends_on: ["a"] },
      { id: "c", question: "C", answer: "C" },
    ],
  }).questions;
  const items = questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
  items[0].progress = { ...emptyProgress(), attempts: 1, wrong: 1 };
  items[2].progress = {
    ...emptyProgress(),
    attempts: 3,
    correct: 3,
    streak: 3,
    recalls: 2,
    mastered: true,
  };
  assert.deepEqual(
    filterQuestions(items, { status: "unlearned" }).map((i) => i.question.id),
    ["a", "b"],
  );
  assert.deepEqual(
    filterQuestions(items, { status: "unseen" }).map((i) => i.question.id),
    ["b"],
  );
  assert.deepEqual(
    filterQuestions(items, { status: "locked" }).map((i) => i.question.id),
    ["b"],
  );
});
