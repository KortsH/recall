import { test } from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { parseBank, contentHash } from "../src/core/bank.ts";
import { emptyProgress, type Item } from "../src/core/types.ts";
import {
  newSession,
  advanceSession,
  requestHint,
  sessionView,
  prepareSession,
} from "../src/core/study.ts";
import {
  prerequisiteStatus,
  dependentQuestions,
} from "../src/core/prerequisites.ts";
import {
  exportPortable,
  importPersonal,
  parsePortable,
} from "../src/core/portable.ts";
import { planOrganization, filterQuestions } from "../src/core/organization.ts";

function fixture(): Item[] {
  return parseBank({
    deck: "Cues",
    questions: [
      {
        id: "base",
        question: "Name the primary colours of light.",
        answer: "Red, green, blue",
        acceptedAnswers: ["Red, green, blue"],
        hint: "Think about how a screen mixes light.",
        difficulty: 2,
      },
      {
        id: "child",
        topic: "Application",
        question: "Mix red and green light.",
        answer: "Yellow",
        depends_on: ["base"],
      },
    ],
  }).questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));
}
test("flags skip all study modes and explicitly waive only the chosen prerequisite without fake mastery", () => {
  const items = fixture();
  items.push({
    ...structuredClone(items[1]),
    question: { ...items[1].question, id: "second", depends_on: [] },
  });
  items[1].question.depends_on = ["base", "second"];
  items.push({
    ...structuredClone(items[1]),
    question: { ...items[1].question, id: "grandchild", depends_on: ["child"] },
  });
  const s = newSession("flags", items, { mode: "learn" });
  const hash = contentHash(items[0].question),
    before = structuredClone(items[0].progress);
  items[0].question.flag = {
    note: "Ambiguous wording; rewrite later",
    allowDependents: false,
  };
  assert.equal(contentHash(items[0].question), hash);
  assert.deepEqual(
    dependentQuestions(items, "base").map((i) => i.question.id),
    ["child", "grandchild"],
  );
  assert.equal(
    prerequisiteStatus(items).find((s) => s.id === "child")!.unlocked,
    false,
  );
  items[0].question.flag.allowDependents = true;
  assert.equal(
    prerequisiteStatus(items).find((s) => s.id === "child")!.unlocked,
    false,
    "A second unmet prerequisite is never bypassed",
  );
  items[2].progress = {
    ...emptyProgress(),
    mastered: true,
    attempts: 3,
    correct: 3,
    streak: 3,
    recalls: 2,
    recognition: 1,
  };
  assert.equal(
    prerequisiteStatus(items).find((s) => s.id === "child")!.unlocked,
    true,
  );
  assert.equal(
    prerequisiteStatus(items).find((s) => s.id === "grandchild")!.unlocked,
    false,
  );
  assert.deepEqual(items[0].progress, before);
  prepareSession(s, items);
  assert.ok(!s.queue.slice(s.cursor).some((e) => e.questionId === "base"));
  for (const mode of ["learn", "cram", "test", "flashcards"]) {
    const session = newSession("flags", items, {
      mode,
      ignorePrerequisites: ["cram", "test"].includes(mode),
    });
    assert.ok(
      !session.queue.some((e) => e.questionId === "base"),
      `${mode} must skip flagged cards even with prerequisite override`,
    );
  }
  delete items[0].question.flag;
  assert.equal(
    prerequisiteStatus(items).find((s) => s.id === "child")!.unlocked,
    false,
    "Removing a flag restores real mastery requirements",
  );
});
test("assisted recall is recorded, cannot unlock dependents, and later unaided recall can", () => {
  const items = fixture(),
    s = newSession("cue", items, { mode: "learn", count: 2 });
  const answer = () => {
    const v = sessionView(s, items);
    assert.equal(v.card?.questionId, "base");
    const r = advanceSession(
      s,
      items[0],
      { version: s.version, revision: 1, response: items[0].question.answer },
      items,
    );
    items[0].progress = r.progress;
    return r;
  };
  assert.throws(
    () => requestHint(s, items[0], { version: s.version, revision: 1 }),
    /not available/,
  );
  answer(); // recognition
  assert.equal(sessionView(s, items).card?.format, "written");
  const before = structuredClone(items[0].progress);
  requestHint(s, items[0], { version: s.version, revision: 1 });
  const resumed = structuredClone(s);
  assert.match(sessionView(resumed, items).hint!, /screen/);
  const assisted = answer();
  assert.equal(assisted.attempt.hintUsed, true);
  assert.equal(assisted.progress.assisted, 1);
  assert.equal(assisted.progress.streak, before.streak);
  assert.equal(assisted.progress.recalls, 0);
  assert.equal(prerequisiteStatus(items)[1].unlocked, false);
  assert.equal(sessionView(s, items).hint, undefined);
  assert.equal(s.hinted, undefined);
  assert.equal(answer().attempt.hintUsed, undefined);
  assert.equal(items[0].progress.mastered, false);
  answer();
  assert.equal(items[0].progress.mastered, true);
  assert.equal(prerequisiteStatus(items)[1].unlocked, true);
  assert.equal(sessionView(s, items).card?.questionId, "child");
});
test("hints cannot reveal model answers, run in Test, bypass concurrency or mutate unavailable cards", () => {
  const items = fixture(),
    s = newSession("cue", items, { mode: "flashcards" });
  const snap = structuredClone(s);
  assert.throws(
    () => requestHint(s, items[0], { version: s.version + 1, revision: 1 }),
    /changed/,
  );
  assert.throws(
    () => requestHint(s, items[0], { version: s.version, revision: 2 }),
    /changed/,
  );
  assert.deepEqual(s, snap);
  requestHint(s, items[0], { version: s.version, revision: 1 });
  assert.throws(
    () =>
      advanceSession(
        s,
        items[0],
        {
          version: s.version,
          revision: 1,
          response: "attempt",
          rating: "good",
        },
        items,
      ),
    /Reveal the model/,
  );
  const exam = newSession("cue", items, { mode: "test" });
  assert.throws(
    () => requestHint(exam, items[0], { version: exam.version, revision: 1 }),
    /not available/,
  );
});
test("hint-only edits and portable sharing retain content hashes, dependencies and assisted progress", async () => {
  const items = fixture();
  const changed = { ...items[0].question, hint: "A different starting point" };
  assert.equal(contentHash(changed), contentHash(items[0].question));
  const plan = await importPersonal(items, {
    deck: "Cues",
    questions: [changed],
  });
  assert.equal(plan.counts.reviewReset, 0);
  assert.equal(plan.items[0].revision, 1);
  plan.items[0].progress = {
    ...emptyProgress(),
    assisted: 1,
    attempts: 1,
    correct: 1,
  };
  const bundle = await exportPortable(
    {
      schemaVersion: 1,
      deck: "Cues",
      description: "",
      questions: plan.items.map((i) => i.question),
    },
    plan.items,
    true,
  );
  const parsed = parsePortable(bundle);
  assert.equal(parsed.bank.questions[0].hint, changed.hint);
  assert.deepEqual(parsed.bank.questions[1].depends_on, ["base"]);
  assert.equal(parsed.progress?.base.progress.assisted, 1);
  assert.equal(parsed.progress?.base.progress.mastered, false);
});
test("organization plans validate the full batch without mutation and share library filters", () => {
  const items = fixture(),
    before = structuredClone(items);
  const moves = [
    { id: "base", topic: "Colour", fromTopic: "General" },
    { id: "child", topic: "Colour" },
  ];
  assert.equal(planOrganization(items, { moves }).dryRun, true);
  assert.equal(planOrganization(items, { moves, apply: true }).moved, 2);
  assert.throws(
    () =>
      planOrganization(items, {
        moves: [...moves, { id: "missing", topic: "Colour" }],
        apply: true,
      }),
    /not found/,
  );
  assert.throws(
    () => planOrganization(items, { moves: [moves[0], moves[0]] }),
    /unique/,
  );
  assert.throws(
    () =>
      planOrganization(items, {
        moves: [{ id: "base", topic: "Colour", fromTopic: "Elsewhere" }],
      }),
    /Topic changed/,
  );
  assert.deepEqual(items, before);
  assert.deepEqual(
    filterQuestions(items, { status: "locked" }).map((i) => i.question.id),
    ["child"],
  );
  assert.deepEqual(
    filterQuestions(items, { hints: "with", difficulty: "2" }).map(
      (i) => i.question.id,
    ),
    ["base"],
  );
});
test("device hints, bulk moves and assisted progress persist with zero network requests", async () => {
  const values = new Map([["recall-workspace", "personal"]]);
  let requests = 0;
  Object.assign(globalThis, {
    indexedDB,
    window: new EventTarget(),
    localStorage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    },
    fetch: async () => {
      requests++;
      throw new Error("Offline");
    },
  });
  const cache = await import("../src/web/cache.ts");
  const bank = { deck: "Cues", questions: fixture().map((i) => i.question) };
  const imported = await cache.api<any>("/import", bank),
    id = imported.deckId;
  let view = await cache.api<any>(`/decks/${id}/sessions`, { mode: "learn" });
  view = (
    await cache.api<any>(`/sessions/${view.id}/answer`, {
      version: view.version,
      revision: 1,
      response: bank.questions[0].answer,
    })
  ).session;
  const cue = await cache.api<any>(`/sessions/${view.id}/hint`, {
    version: view.version,
    revision: 1,
  });
  const restarted = await import(
    new URL("../src/web/cache.ts?hint-restart", import.meta.url).href
  );
  view = await restarted.api(`/sessions/${view.id}`);
  assert.equal(view.hint, cue.hint);
  const result = await restarted.api(`/sessions/${view.id}/answer`, {
    version: view.version,
    revision: 1,
    response: bank.questions[0].answer,
  });
  assert.equal(result.feedback.hintUsed, true);
  const before = await restarted.api(`/decks/${id}/questions`);
  await assert.rejects(
    restarted.api(`/decks/${id}/organize`, {
      moves: [
        { id: "base", topic: "Colour" },
        { id: "missing", topic: "Colour" },
      ],
      apply: true,
    }),
    /not found/,
  );
  assert.deepEqual(await restarted.api(`/decks/${id}/questions`), before);
  await restarted.api(`/decks/${id}/organize`, {
    moves: [
      { id: "base", topic: "Colour" },
      { id: "child", topic: "Colour" },
    ],
    apply: true,
  });
  const after = await restarted.api(`/decks/${id}/questions`);
  assert.deepEqual(
    after.map((i: Item) => i.question.topic),
    ["Colour", "Colour"],
  );
  assert.deepEqual(
    after.map((i: Item) => i.progress),
    before.map((i: Item) => i.progress),
  );
  assert.equal(requests, 0);
  const base = after.find((i: Item) => i.question.id === "base");
  await restarted.api(
    `/decks/${id}/questions/base`,
    {
      question: {
        ...base.question,
        flag: { note: "Reword this foundation", allowDependents: true },
      },
      revision: base.revision,
    },
    "PUT",
  );
  const flagged = await restarted.api(`/decks/${id}/questions/base`);
  assert.deepEqual(flagged.progress, base.progress);
  const resumed = await restarted.api(`/sessions/${view.id}`);
  assert.equal(resumed.card.questionId, "child");
  const exported = await restarted.api(`/decks/${id}/export`);
  assert.equal(
    exported.questions.find((q: any) => q.id === "base").flag.note,
    "Reword this foundation",
  );
  assert.equal(requests, 0);
});
