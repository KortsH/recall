import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBank, contentHash } from "../src/core/bank.ts";
import { emptyProgress, type Item, type Session } from "../src/core/types.ts";
import {
  newSession,
  advanceSession,
  sessionView,
  prepareSession,
} from "../src/core/study.ts";
import { learningEntry, publicCard } from "../src/core/engine.ts";

const fixture = (count = 18): Item[] =>
  parseBank({
    deck: "Learning rounds",
    questions: Array.from({ length: count }, (_, n) => ({
      id: `q${n}`,
      topic: "Foundations",
      question: `Define item ${n}`,
      answer: `Definition ${n}`,
      acceptedAnswers: [`Definition ${n}`],
    })),
  }).questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
function answer(s: Session, items: Item[], correct = true) {
  const entry = s.queue[s.cursor],
    item = items.find((i) => i.question.id === entry.questionId)!;
  const result = advanceSession(
    s,
    item,
    {
      version: s.version,
      revision: item.revision,
      response: correct ? item.question.answer : "Deliberately wrong",
    },
    items,
  );
  item.progress = result.progress;
  s.version++;
  return result;
}

test("option-less questions start with choices, then recall in a stable 12-card working set", () => {
  const items = fixture(),
    hashes = items.map((i) => contentHash(i.question));
  const s = newSession("d", items, { mode: "learn" }),
    initial = new Set(s.learning!.ids);
  assert.equal(s.learning!.size, 12);
  assert.equal(initial.size, 12);
  for (let n = 0; n < 12; n++) {
    assert.equal(s.queue[s.cursor].format, "multiple_choice");
    const card = sessionView(s, items).card!;
    assert.equal(card.options!.length, 4);
    assert.ok(
      card.options!.includes(
        items.find((i) => i.question.id === card.questionId)!.question.answer,
      ),
    );
    assert.ok(!("answer" in card));
    assert.ok(
      card.options!.every((a) => items.some((i) => i.question.answer === a)),
    );
    answer(s, items);
  }
  assert.equal(s.learning!.round, 1);
  assert.ok(
    s.queue
      .slice(s.cursor)
      .every((e) => initial.has(e.questionId) && e.format === "written"),
  );
  const resumed = JSON.parse(JSON.stringify(s));
  assert.deepEqual(
    sessionView(resumed, items).card,
    sessionView(s, items).card,
  );
  for (let n = 0; n < 24; n++) {
    assert.equal(s.learning!.round, 1);
    assert.ok(initial.has(s.queue[s.cursor].questionId));
    answer(s, items);
  }
  assert.ok(
    items
      .filter((i) => initial.has(i.question.id))
      .every((i) => i.progress.mastered),
  );
  assert.equal(s.learning!.round, 2);
  assert.equal(s.learning!.ids.length, 6);
  assert.ok(s.learning!.ids.every((id) => !initial.has(id)));
  assert.equal(sessionView(s, items).card!.format, "multiple_choice");
  while (!s.finished) answer(s, items);
  assert.ok(items.every((i) => i.progress.mastered));
  assert.equal(s.answers.length, 54);
  assert.deepEqual(
    items.map((i) => contentHash(i.question)),
    hashes,
  );
});

test("a mistake keeps the cohort together and returns to recognition without a four-try cutoff", () => {
  const items = fixture(3),
    s = newSession("d", items, { mode: "learn", count: 1 });
  const id = s.learning!.ids[0];
  for (let n = 0; n < 6; n++) {
    answer(s, items, false);
    assert.equal(s.learning!.round, 1);
    assert.equal(s.queue[s.cursor].questionId, id);
    assert.equal(s.queue[s.cursor].format, "multiple_choice");
    assert.equal(s.finished, false);
  }
  answer(s, items);
  assert.equal(s.queue[s.cursor].format, "written");
  answer(s, items);
  answer(s, items);
  assert.equal(s.learning!.round, 2);
  assert.notEqual(s.queue[s.cursor].questionId, id);
});

test("one unlocked foundation progresses through recognition and recall before introducing dependents", () => {
  const items = fixture(3);
  items[1].question.depends_on = ["q0"];
  items[2].question.depends_on = ["q1"];
  const s = newSession("d", items, { mode: "learn" });
  assert.deepEqual(s.learning!.ids, ["q0"]);
  for (const format of ["multiple_choice", "written", "written"]) {
    assert.equal(s.queue[s.cursor].questionId, "q0");
    assert.equal(s.queue[s.cursor].format, format);
    answer(s, items);
  }
  assert.equal(s.learning!.round, 2);
  assert.equal(s.queue[s.cursor].questionId, "q1");
  assert.equal(s.queue[s.cursor].format, "multiple_choice");
  while (!s.finished) answer(s, items);
  assert.ok(items.every((i) => i.progress.mastered));
  assert.equal(s.answers.length, 9);
});

test("legacy unfinished Learn sessions upgrade only their unanswered queue without changing progress", () => {
  const items = fixture(3),
    s = newSession("d", items, { mode: "learn" });
  answer(s, items);
  const evidence = structuredClone(s.answers),
    progress = structuredClone(items.map((i) => i.progress));
  delete s.learning;
  s.queue = s.queue.map((e) => ({
    ...e,
    variantId: "written",
    format: "written",
  }));
  const prefix = structuredClone(s.queue.slice(0, s.cursor));
  prepareSession(s, items);
  assert.ok(s.learning);
  assert.deepEqual(s.answers, evidence);
  assert.deepEqual(s.queue.slice(0, s.cursor), prefix);
  assert.deepEqual(
    items.map((i) => i.progress),
    progress,
  );
  const entry = s.queue[s.cursor],
    item = items.find((i) => i.question.id === entry.questionId)!;
  assert.equal(
    entry.format,
    item.progress.recognition ? "written" : "multiple_choice",
  );
  const saved = JSON.stringify(s);
  prepareSession(s, items);
  assert.equal(JSON.stringify(s), saved);
});

test("choice projection avoids equivalent aliases, prefers authored options, and handles tiny decks", () => {
  const items = fixture(3);
  items[0].question.acceptedAnswers = ["Definition 0", "Definition 1"];
  const entry = learningEntry(items[0], items);
  assert.ok(!entry.choiceOptions!.includes("Definition 1"));
  const authored = {
    ...items[0],
    question: {
      ...items[0].question,
      options: ["Definition 0", "Other"],
      correct: ["Definition 0"],
    },
  };
  assert.equal(learningEntry(authored, items).variantId, "choice");
  const tiny = publicCard(items[0], learningEntry(items[0], [items[0]]));
  assert.deepEqual(
    new Set(tiny.options),
    new Set(["Definition 0", "I don’t know yet"]),
  );
});
