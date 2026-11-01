import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBank, contentHash } from "../src/core/bank.ts";
import {
  validatePrerequisites,
  prerequisiteStatus,
} from "../src/core/prerequisites.ts";
import { newSession, advanceSession } from "../src/core/study.ts";
import { updateProgress } from "../src/core/engine.ts";
import { emptyProgress } from "../src/core/types.ts";
import { allowedHost } from "../src/server/access.ts";

const bank = () =>
  parseBank({
    deck: "Dependencies",
    questions: [
      {
        id: "intro",
        topic: "Basics",
        question: "What is a queue?",
        answer: "First in, first out",
      },
      {
        id: "variant",
        topic: "Details",
        question: "What is FIFO?",
        answer: "First in, first out",
        depends_on: ["intro"],
      },
      {
        id: "apply",
        topic: "Details",
        question: "Which item leaves first?",
        answer: "The earliest",
        depends_on: ["variant"],
      },
    ],
  });
test("prerequisites reject self links, cycles, duplicates and unknown active IDs", () => {
  const q = bank().questions;
  assert.throws(
    () => validatePrerequisites([{ ...q[0], depends_on: ["intro"] }]),
    /cycle/,
  );
  assert.throws(
    () =>
      validatePrerequisites([
        { ...q[0], depends_on: ["apply"] },
        ...q.slice(1),
      ]),
    /cycle/,
  );
  assert.throws(
    () => validatePrerequisites([{ ...q[0], depends_on: ["absent"] }]),
    /missing/,
  );
  assert.throws(
    () =>
      validatePrerequisites([
        { ...q[1], depends_on: ["intro", "intro"] },
        q[0],
      ]),
    /duplicate/,
  );
  assert.doesNotThrow(() => validatePrerequisites([q[1]], true));
});
test("recognition cannot unlock, recall unlocks and transitive foundations remain required", () => {
  const items = bank().questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
  for (let n = 0; n < 5; n++)
    items[0].progress = updateProgress(
      items[0].progress,
      true,
      "multiple_choice",
      false,
    );
  assert.deepEqual(
    prerequisiteStatus(items).map((s) => s.unlocked),
    [true, false, false],
  );
  for (let n = 0; n < 2; n++)
    items[0].progress = updateProgress(
      items[0].progress,
      true,
      "written",
      false,
    );
  assert.deepEqual(
    prerequisiteStatus(items).map((s) => s.unlocked),
    [true, true, false],
  );
  const session = newSession("d", items, {
    mode: "cram",
    topic: "Details",
    count: 10,
  });
  assert.deepEqual(
    session.queue.map((e) => e.questionId),
    ["variant"],
  );
  items[1].progress.mastered = true;
  assert.equal(prerequisiteStatus(items)[2].unlocked, true);
  items[0].progress.mastered = false;
  assert.equal(prerequisiteStatus(items)[2].unlocked, false);
  for (const mode of ["learn", "cram", "flashcards", "test"])
    assert.deepEqual(
      newSession("d", items, { mode, count: 10 }).queue.map(
        (e) => e.questionId,
      ),
      ["intro"],
    );
});
test("changing only prerequisite metadata preserves semantic revision", () => {
  const q = bank().questions[0];
  assert.equal(contentHash(q), contentHash({ ...q, depends_on: ["other"] }));
});
test("all parents are required, due reviews stay unlocked and mastery loss relocks", () => {
  const items = bank().questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
  items[2].question.depends_on = ["intro", "variant"];
  items[0].progress.mastered = true;
  assert.equal(prerequisiteStatus(items)[2].unlocked, false);
  items[1].progress.mastered = true;
  items[0].progress.nextReview = new Date(0).toISOString();
  assert.equal(prerequisiteStatus(items)[2].unlocked, true);
  items[0].progress = updateProgress(
    items[0].progress,
    false,
    "written",
    false,
  );
  assert.equal(prerequisiteStatus(items)[2].unlocked, false);
});
test("mastery dynamically adds dependent cards; overrides are explicit and restricted", () => {
  const items = bank().questions.map((question) => ({
    question: { ...question, acceptedAnswers: [question.answer] },
    revision: 1,
    progress: emptyProgress(),
  }));
  for (let n = 0; n < 2; n++)
    items[0].progress = updateProgress(
      items[0].progress,
      true,
      "written",
      false,
    );
  const s = newSession("d", items, { mode: "learn", count: 3 });
  assert.equal(s.queue.length, 1);
  advanceSession(
    s,
    items[0],
    { version: 0, revision: 1, response: items[0].question.answer },
    items,
  );
  assert.equal(s.finished, false);
  assert.equal(s.queue[s.cursor].questionId, "variant");
  for (const mode of ["test", "cram"])
    assert.equal(
      newSession("d", items, { mode, count: 3, ignorePrerequisites: true })
        .queue.length,
      3,
    );
  assert.throws(
    () => newSession("d", items, { mode: "learn", ignorePrerequisites: true }),
    /only in Cram or Test/,
  );
});
test("local API hosts reject rebinding and accept only explicitly configured remote hosts", () => {
  assert.equal(allowedHost("attacker.example"), false);
  assert.equal(allowedHost("localhost:4310"), true);
  assert.equal(allowedHost("127.0.0.1:4321"), true);
  assert.equal(
    allowedHost("recall.example.test:8445", "https://recall.example.test:8445"),
    true,
  );
  assert.equal(
    allowedHost("recall.example.test:8446", "https://recall.example.test:8445"),
    false,
  );
  assert.equal(allowedHost("127.0.0.1@attacker.example"), false);
});
