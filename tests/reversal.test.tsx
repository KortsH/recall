import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseBank, contentHash } from "../src/core/bank.ts";
import { emptyProgress, type Item } from "../src/core/types.ts";
import {
  newSession,
  advanceSession,
  sessionView,
  prepareSession,
} from "../src/core/study.ts";
import { updateProgress, publicCard } from "../src/core/engine.ts";
import { variants, recallDirection } from "../src/core/questions.ts";
import { exportPortable, importPersonal } from "../src/core/portable.ts";
import { SubmittedAnswer, responseText } from "../src/web/answers.tsx";
const source = {
  deck: "Two directions",
  questions: [
    {
      id: "queue",
      question: "Which removal order defines a queue?",
      answer: "First in, first out",
      acceptedAnswers: ["First in, first out"],
      hint: "Remember the name queue.",
      rubric: ["Describe order"],
      reversible: true,
      reverse: {
        question: "Which data structure removes the oldest item first?",
        answer: "Queue",
        acceptedAnswers: ["Queue"],
      },
    },
    {
      id: "application",
      question: "A then B enter a queue. Which leaves first?",
      answer: "A",
      acceptedAnswers: ["A"],
      depends_on: ["queue"],
    },
  ],
};
const fixture = (): Item[] =>
  parseBank(source).questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
test("reversible imports require explicit prompts and keep old semantic hashes unchanged", () => {
  const raw = source.questions[0];
  assert.throws(
    () => parseBank({ ...source, questions: [{ ...raw, reverse: undefined }] }),
    /requires an explicit reverse/,
  );
  assert.throws(
    () => parseBank({ ...source, questions: [{ ...raw, reversible: false }] }),
    /omit reverse/,
  );
  const plain = parseBank({
    deck: "Old",
    questions: [{ id: "q", question: "Q", answer: "A" }],
  }).questions[0];
  assert.equal(
    contentHash(plain),
    contentHash({ ...plain, reversible: false }),
  );
  assert.throws(
    () =>
      parseBank({
        ...source,
        questions: [
          {
            ...raw,
            variants: [
              {
                id: "reverse",
                type: "written",
                question: "Other",
                answer: "Other",
              },
            ],
          },
        ],
      }),
    /reserved variant/,
  );
});
test("Learn requires both recall directions before mastery or dependent unlock and resumes the same reverse card", () => {
  const items = fixture(),
    s = newSession("d", items, { mode: "learn" });
  const answer = (response: string) => {
    const item = items.find(
      (i) => i.question.id === s.queue[s.cursor].questionId,
    )!;
    const r = advanceSession(
      s,
      item,
      { version: s.version, revision: 1, response },
      items,
    );
    item.progress = r.progress;
    s.version++;
  };
  assert.equal(sessionView(s, items).card!.format, "multiple_choice");
  answer("First in, first out");
  assert.equal(sessionView(s, items).card!.variantId, "written");
  answer("First in, first out");
  assert.equal(items[0].progress.mastered, false);
  assert.deepEqual(s.learning!.ids, ["queue"]);
  assert.equal(sessionView(s, items).card!.variantId, "reverse");
  assert.equal(
    sessionView(s, items).card!.hasHint,
    false,
    "Forward hint must not give away reverse answer",
  );
  const saved = JSON.parse(JSON.stringify(s));
  prepareSession(saved, items);
  assert.equal(sessionView(saved, items).card!.variantId, "reverse");
  answer("Queue");
  assert.equal(items[0].progress.mastered, true);
  assert.deepEqual(items[0].progress.recallDirections, {
    forward: 1,
    reverse: 1,
  });
  assert.equal(sessionView(s, items).card!.questionId, "application");
  const reverse = variants(items[0].question).find((v) => v.id === "reverse")!;
  assert.deepEqual(reverse.rubric, []);
});
test("one-way or assisted successes cannot master reversible questions; a failure resets both directions", () => {
  let p = emptyProgress();
  for (let i = 0; i < 4; i++)
    p = updateProgress(
      p,
      true,
      "written",
      false,
      new Date(),
      "good",
      "recall",
      false,
      "forward",
    );
  assert.equal(p.mastered, false);
  p = updateProgress(
    p,
    true,
    "written",
    false,
    new Date(),
    "good",
    "recall",
    true,
    "reverse",
  );
  assert.equal(p.mastered, false);
  p = updateProgress(
    p,
    true,
    "written",
    false,
    new Date(),
    "good",
    "recall",
    false,
    "reverse",
  );
  assert.equal(p.mastered, true);
  p = updateProgress(
    p,
    false,
    "written",
    false,
    new Date(),
    "again",
    "recall",
    false,
    "reverse",
  );
  assert.equal(p.mastered, false);
  assert.deepEqual(p.recallDirections, { forward: 0, reverse: 0 });
});
test("portable reversible banks preserve both-direction progress and reject false one-way mastery", async () => {
  const items = fixture();
  let p = emptyProgress();
  p = updateProgress(
    p,
    true,
    "multiple_choice",
    false,
    new Date(),
    undefined,
    "recall",
    false,
    "forward",
  );
  for (const d of ["forward", "reverse"] as const)
    p = updateProgress(
      p,
      true,
      "written",
      false,
      new Date(),
      "good",
      "recall",
      false,
      d,
    );
  items[0].progress = p;
  const bank = parseBank(source),
    file = await exportPortable(bank, items, true),
    restored = await importPersonal([], file, { restoreProgress: true });
  assert.deepEqual(restored.items[0].progress, p);
  assert.deepEqual(
    restored.items[0].question.reverse,
    bank.questions[0].reverse,
  );
  const invalid = structuredClone(file);
  delete invalid.progress!.queue.progress.recallDirections;
  await assert.rejects(
    importPersonal([], invalid, { restoreProgress: true }),
    /both directions/,
  );
});
test("submitted-answer display is compact readable text for prose, choices and matching, with honest mental/blank states", () => {
  assert.equal(responseText(["One", "Two"]), "One; Two");
  assert.equal(responseText({ A: "B" }), "A → B");
  const prose = renderToStaticMarkup(
    <SubmittedAnswer value={"A < B\nNo write down"} />,
  );
  assert.ok(prose.includes("A &lt; B"));
  assert.ok(prose.includes("Your answer"));
  assert.ok(
    renderToStaticMarkup(<SubmittedAnswer value="" mental />).includes(
      "Answered in your head",
    ),
  );
  assert.ok(
    renderToStaticMarkup(<SubmittedAnswer value="" />).includes(
      "No written answer",
    ),
  );
});
