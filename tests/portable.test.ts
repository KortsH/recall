import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBank, contentHash } from "../src/core/bank.ts";
import {
  exportPortable,
  importPersonal,
  parsePortable,
  questionDigest,
} from "../src/core/portable.ts";
import { emptyProgress } from "../src/core/types.ts";
import { updateProgress } from "../src/core/engine.ts";
const bank = () =>
  parseBank({
    deck: "Shared",
    questions: [
      {
        id: "base",
        question: "A definition",
        answer: "A",
        acceptedAnswers: ["A"],
      },
      {
        id: "apply",
        question: "Apply it",
        answer: "B",
        acceptedAnswers: ["B"],
        depends_on: ["base"],
      },
    ],
  });
test("portable quizzes round-trip dependencies and omit personal progress by default", async () => {
  const b = bank(),
    items = b.questions.map((question) => ({
      question,
      revision: 1,
      progress: emptyProgress(),
    }));
  const exported = await exportPortable(b, items);
  assert.equal(exported.progress, undefined);
  assert.deepEqual(parsePortable(JSON.parse(JSON.stringify(exported))).bank, b);
  assert.equal(
    await questionDigest(b.questions[0]),
    contentHash(b.questions[0]),
  );
  const imported = await importPersonal([], exported);
  assert.equal(imported.counts.created, 2);
  assert.deepEqual(imported.items[1].question.depends_on, ["base"]);
});
test("friend imports start fresh; own-device progress restore is explicit and repeat imports do not add credit", async () => {
  const b = bank(),
    items = b.questions.map((question) => ({
      question,
      revision: 1,
      progress: emptyProgress(),
    }));
  for (let n = 0; n < 3; n++)
    items[0].progress = updateProgress(
      items[0].progress,
      true,
      "written",
      false,
    );
  const file = await exportPortable(b, items, true);
  assert.equal((await importPersonal([], file)).items[0].progress.attempts, 0);
  const restored = await importPersonal([], file, { restoreProgress: true });
  assert.equal(restored.items[0].progress.mastered, true);
  const again = await importPersonal(restored.items, file, {
    restoreProgress: true,
  });
  assert.equal(again.items[0].progress.attempts, 3);
  const keep = await importPersonal(restored.items, await exportPortable(b));
  assert.deepEqual(keep.items[0].progress, restored.items[0].progress);
});
test("invalid graphs, incompatible progress and inconsistent mastery cannot partially modify a device bank", async () => {
  const b = bank(),
    existing = (await importPersonal([], b)).items,
    before = structuredClone(existing);
  await assert.rejects(
    importPersonal(
      existing,
      { ...b, questions: [b.questions[1]] },
      { replace: true },
    ),
    /missing/,
  );
  const file = await exportPortable(b, existing, true);
  file.bank.questions[0].answer = "Changed";
  await assert.rejects(
    importPersonal(existing, file, { restoreProgress: true }),
    /does not match/,
  );
  const invalid = await exportPortable(b, existing, true);
  invalid.progress!.base.progress.mastered = true;
  assert.throws(() => parsePortable(invalid), /Inconsistent/);
  assert.deepEqual(existing, before);
});
