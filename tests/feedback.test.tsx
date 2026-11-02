import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseBank } from "../src/core/schema.ts";
import { emptyProgress, type Attempt, type Item } from "../src/core/types.ts";
import { choiceConnections } from "../src/core/feedback.ts";
import { newSession, advanceSession, sessionView } from "../src/core/study.ts";
import { AnswerComparison } from "../src/web/answers.tsx";

const fixture = (): Item[] =>
  parseBank({
    deck: "Feedback",
    questions: [
      {
        id: "color",
        question: "What color means stop on a traffic light?",
        answer: "Red",
        options: ["Red", "Green", "Blue"],
        correct: ["Red"],
      },
      {
        id: "go",
        topic: "Traffic",
        question: "What color means go on a traffic light?",
        answer: "Green",
      },
      {
        id: "sky",
        question: "What color is a clear daytime sky?",
        answer: "Blue",
        reversible: true,
        reverse: {
          question: "What can appear blue on a clear day?",
          answer: "The sky",
        },
      },
    ],
  }).questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
const wrong = (changes: Partial<Attempt> = {}): Attempt => ({
  questionId: "color",
  variantId: "choice",
  format: "multiple_choice",
  response: ["Green"],
  correct: false,
  selfAssessed: false,
  revision: 1,
  question: "What color means stop on a traffic light?",
  answer: "Red",
  explanation: "",
  topic: "General",
  at: new Date().toISOString(),
  ...changes,
});

test("wrong choices explain the exact related question once, including generated and reverse answers", () => {
  const items = fixture();
  const links = choiceConnections(wrong(), items)!;
  assert.equal(links.length, 1);
  assert.equal(links[0].answer, "Green");
  assert.deepEqual(links[0].questions, [
    {
      questionId: "go",
      variantId: "written",
      question: items[1].question.question,
      topic: "Traffic",
    },
  ]);
  assert.equal(
    choiceConnections(wrong({ variantId: "learn-choice" }), items)?.[0]
      .questions[0].questionId,
    "go",
  );
  assert.equal(
    choiceConnections(wrong({ response: ["The sky"] }), items)?.[0].questions[0]
      .question,
    "What can appear blue on a clear day?",
  );
  assert.equal(choiceConnections(wrong({ correct: true }), items), undefined);
  assert.equal(
    choiceConnections(wrong({ format: "written" }), items),
    undefined,
  );
  assert.equal(
    choiceConnections(
      wrong({ response: ["A plausible invented distractor"] }),
      items,
    ),
    undefined,
  );
  assert.equal(
    choiceConnections(wrong({ response: ["green"] }), items),
    undefined,
    "Do not infer a relationship from a near match",
  );
  items[1].archived = true;
  assert.equal(choiceConnections(wrong(), items), undefined);
  items[1].archived = false;
  items[1].question.flag = { note: "Needs review", allowDependents: false };
  assert.equal(choiceConnections(wrong(), items), undefined);
});

test("multi-answer feedback explains only wrongly selected options, never correctly selected or missing options", () => {
  const items = fixture();
  items[0].question.correct = ["Red", "Green"];
  const attempt = wrong({
    format: "multiple_select",
    response: ["Green", "Blue"],
  });
  const links = choiceConnections(attempt, items)!;
  assert.equal(links.length, 1);
  assert.equal(links[0].answer, "Blue");
  assert.equal(links[0].questions[0].questionId, "sky");
  assert.equal(
    choiceConnections({ ...attempt, response: ["Red"] }, items),
    undefined,
  );
});

test("shared session feedback carries distractor context but an unfinished test reveals none", () => {
  const items = fixture(),
    session = newSession("d", items, { mode: "cram", count: 1 });
  session.queue = [
    {
      questionId: "color",
      variantId: "choice",
      format: "multiple_choice",
      retry: 0,
    },
  ];
  const result = advanceSession(
    session,
    items[0],
    { version: 0, revision: 1, response: ["Green"] },
    items,
  );
  assert.equal(result.attempt.confusedWith?.[0].questions[0].questionId, "go");
  const exam = newSession("d", items, { mode: "test", count: 2 });
  exam.queue = [
    {
      questionId: "color",
      variantId: "choice",
      format: "multiple_choice",
      retry: 0,
    },
    { questionId: "go", variantId: "written", format: "written", retry: 0 },
  ];
  advanceSession(
    exam,
    items[0],
    { version: 0, revision: 1, response: ["Green"] },
    items,
  );
  const view = sessionView(exam, items);
  assert.equal(view.result, null);
  assert.ok(!JSON.stringify(view).includes("confusedWith"));
});

test("comparison shows related question and model, while mental recall shows only the model", () => {
  const items = fixture(),
    connections = choiceConnections(wrong(), items);
  const comparison = renderToStaticMarkup(
    <AnswerComparison
      value={["Green"]}
      answer="Red"
      connections={connections}
    />,
  );
  assert.match(comparison, /Your answer/);
  assert.match(comparison, /That answer belongs to/);
  assert.match(comparison, /What color means go/);
  assert.match(comparison, /MODEL ANSWER/);
  assert.match(comparison, /Red/);
  const mental = renderToStaticMarkup(
    <AnswerComparison
      value="Partial text I chose not to submit"
      mental
      answer="A complete model answer"
      connections={connections}
    />,
  );
  assert.match(mental, /A complete model answer/);
  assert.doesNotMatch(mental, /Your answer|Partial text|That answer belongs/);
  assert.match(mental, /model-only/);
  const correct = renderToStaticMarkup(
    <AnswerComparison
      value="An accepted alias"
      correct
      answer="The complete model answer"
    />,
  );
  assert.match(correct, /The complete model answer/);
  assert.doesNotMatch(correct, /Your answer|An accepted alias/);
  assert.match(correct, /model-only/);
});
