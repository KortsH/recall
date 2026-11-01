import { test } from "node:test";
import assert from "node:assert/strict";
import {
  grade,
  updateProgress,
  buildQueue,
  enqueueRetry,
  publicCard,
  normalise,
  chooseVariant,
} from "../src/core/engine.ts";
import { emptyProgress, type Item, type Variant } from "../src/core/types.ts";
import { parseBank, variants, contentHash } from "../src/core/bank.ts";

const bank = parseBank({
  deck: "Tests",
  questions: [
    {
      id: "rules",
      topic: "MAC",
      question: "State the BLP rules",
      answer: "No Read Up; No Write Down",
      options: ["No Read Up", "No Write Down", "No Read Down", "No Write Up"],
      correct: ["No Read Up", "No Write Down"],
      requiredParts: [["No Read Up"], ["No Write Down"]],
    },
  ],
});
const item: Item = {
  question: bank.questions[0],
  progress: emptyProgress(),
  revision: 1,
};
test("multi-select requires the complete exact set, in any order", () => {
  const v = variants(item.question)[0];
  assert.equal(grade(v, ["No Write Down", "No Read Up"]), true);
  assert.equal(grade(v, ["No Read Up"]), false);
  assert.equal(grade(v, ["No Read Up", "No Write Down", "No Write Up"]), false);
  assert.equal(grade(v, ["No Read Up", "No Read Up"]), false);
});
test("structured recall accepts reordered parts, but refuses negation and extra assertions", () => {
  const v = variants(item.question).find((v) => v.type === "written")!;
  assert.equal(grade(v, "no WRITE down; No READ up."), true);
  assert.equal(grade(v, "No Read Down; No Write Up"), false);
  assert.equal(grade(v, "Not No Read Up; No Write Down"), false);
  assert.equal(grade(v, "No Read Up; No Write Down; No Read Down"), false);
});
test("normalisation does not erase mathematical direction or negative signs", () => {
  const v: Variant = {
    id: "v",
    type: "written",
    question: "q",
    answer: "s >= o",
    acceptedAnswers: ["s >= o"],
  };
  assert.equal(grade(v, "s <= o"), false);
  assert.notEqual(normalise("-1"), normalise("1"));
});
test("free-form written answers and flashcards need self-assessment", () => {
  assert.equal(
    grade(
      { id: "x", type: "written", question: "q", answer: "a" },
      "something",
    ),
    null,
  );
  assert.equal(
    grade({ id: "x", type: "flashcard", question: "q", answer: "a" }, ""),
    null,
  );
});
test("matching checks every pair", () => {
  const v: Variant = {
    id: "m",
    type: "matching",
    question: "q",
    answer: "a",
    pairs: [
      { left: "BLP", right: "Confidentiality" },
      { left: "Biba", right: "Integrity" },
    ],
  };
  assert.equal(grade(v, { BLP: "Confidentiality", Biba: "Integrity" }), true);
  assert.equal(grade(v, { BLP: "Integrity", Biba: "Confidentiality" }), false);
});
test("recognition alone cannot establish mastery", () => {
  let p = emptyProgress();
  for (let i = 0; i < 12; i++)
    p = updateProgress(p, true, "multiple_choice", false);
  assert.equal(p.mastered, false);
  assert.equal(p.recalls, 0);
});
test("mastery requires repeated recall and a mistake resets it", () => {
  let p = updateProgress(emptyProgress(), true, "multiple_choice", false);
  p = updateProgress(p, true, "written", false);
  assert.equal(p.mastered, false);
  p = updateProgress(p, true, "written", true);
  assert.equal(p.mastered, true);
  assert.equal(p.selfAssessed, 1);
  p = updateProgress(p, false, "written", false);
  assert.equal(p.mastered, false);
  assert.equal(p.recalls, 0);
  assert.equal(p.streak, 0);
});
test("scheduling uses longer intervals after mastery, with a close retry after failure", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const p = { ...emptyProgress(), streak: 2, recalls: 1 };
  assert.equal(
    updateProgress(p, true, "written", false, now).nextReview,
    "2026-11-02T12:00:00.000Z",
  );
  assert.equal(
    updateProgress(p, false, "written", false, now).nextReview,
    "2026-11-01T12:02:00.000Z",
  );
});
test("cram includes mastered objectives even when not due", () => {
  const mastered = {
    ...item,
    progress: {
      ...emptyProgress(),
      attempts: 3,
      mastered: true,
      nextReview: "2099-01-01T00:00:00Z",
    },
  };
  assert.equal(buildQueue([mastered], "learn", 20).length, 0);
  assert.equal(buildQueue([mastered], "cram", 20).length, 1);
});
test("topic interleaving and new-question recognition", () => {
  const items = Array.from({ length: 6 }, (_, n) => ({
    ...item,
    question: { ...item.question, id: String(n), topic: n < 3 ? "A" : "B" },
  }));
  const queue = buildQueue(items, "learn", 6, Date.now(), () => 0.5);
  assert.deepEqual(
    queue.map(
      (e) => items.find((i) => i.question.id === e.questionId)!.question.topic,
    ),
    ["A", "B", "A", "B", "A", "B"],
  );
  assert.ok(queue.every((e) => e.format === "multiple_select"));
});
test("retry is interleaved, and a one-objective deck never repeats immediately", () => {
  const queue = Array.from({ length: 4 }, (_, n) => ({
    questionId: String(n),
    variantId: "choice",
    format: "multiple_choice" as const,
    retry: 0,
  }));
  const retry = enqueueRetry(queue, 0, queue[0], item);
  assert.equal(retry[3].questionId, "0");
  assert.equal(enqueueRetry([queue[0]], 0, queue[0], item).length, 1);
  const tail = enqueueRetry(queue, 3, queue[3], item);
  assert.notEqual(tail[4].questionId, "3");
  assert.equal(tail[5].questionId, "3");
});
test("public questions do not expose answers or correct choices", () => {
  const c = publicCard(
    item,
    {
      questionId: "rules",
      variantId: "choice",
      format: "multiple_select",
      retry: 0,
    },
    () => 0.5,
  );
  assert.ok(c.options);
  assert.ok(!("answer" in c));
  assert.ok(!("correct" in c));
  assert.ok(!("requiredParts" in c));
});
test("recall variants rotate rather than becoming stuck on one format", () => {
  const q = {
    ...item.question,
    variants: [
      {
        id: "match",
        type: "matching" as const,
        question: "Match",
        answer: "Pairs",
        pairs: [
          { left: "a", right: "b" },
          { left: "c", right: "d" },
        ],
      },
    ],
  };
  const first = chooseVariant(
    {
      ...item,
      question: q,
      progress: { ...emptyProgress(), attempts: 1, streak: 1 },
    },
    "learn",
    1,
  );
  const second = chooseVariant(
    {
      ...item,
      question: q,
      progress: { ...emptyProgress(), attempts: 2, streak: 2 },
    },
    "learn",
    2,
  );
  assert.equal(first.type, "matching");
  assert.equal(second.type, "written");
});
test("removing a variant safely falls back to current written recall", () => {
  const c = publicCard(item, {
    questionId: item.question.id,
    variantId: "removed",
    format: "matching",
    retry: 0,
  });
  assert.equal(c.variantId, "written");
  assert.equal(c.revision, 1);
});
test("semantic hashes ignore property order and explanation edits", () => {
  const q = item.question;
  assert.equal(
    contentHash(q),
    contentHash(
      JSON.parse(
        JSON.stringify(q).replace("State the BLP rules", "State the BLP rules"),
      ),
    ),
  );
  assert.equal(
    contentHash(q),
    contentHash({ ...q, explanation: "Better explanation", tags: ["new"] }),
  );
  assert.equal(
    contentHash(q),
    contentHash(Object.fromEntries(Object.entries(q).reverse()) as typeof q),
  );
  assert.notEqual(contentHash(q), contentHash({ ...q, answer: "Different" }));
});
test("related recall and application objectives are separated when other concepts exist", () => {
  const qs = [
    { id: "a1", concept: "A", skill: "recall" as const },
    { id: "a2", concept: "A", skill: "application" as const },
    { id: "b", concept: "B", skill: "recall" as const },
    { id: "c", concept: "C", skill: "recall" as const },
  ].map((q) => ({ ...item, question: { ...item.question, ...q } }));
  const queue = buildQueue(qs, "cram", 4, Date.now(), () => 0.5);
  assert.notEqual(queue[0].concept, queue[1].concept);
});
test("scheduled retries avoid sitting directly beside another objective on the same concept", () => {
  const queue = ["A", "B", "C", "A", "D"].map((concept, i) => ({
    questionId: String(i),
    concept,
    variantId: "written",
    format: "written" as const,
    retry: 0,
  }));
  const result = enqueueRetry(queue, 0, queue[0], {
    ...item,
    question: { ...item.question, concept: "A" },
  });
  const at = result.findIndex((e, i) => i > 0 && e.questionId === "0");
  assert.notEqual(result[at - 1]?.concept, "A");
  assert.notEqual(result[at + 1]?.concept, "A");
});
