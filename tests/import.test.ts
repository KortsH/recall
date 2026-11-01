import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBank, readBank } from "../src/core/bank.ts";
const q = { id: "one", question: "What?", answer: "A", options: ["A", "B"] };
test("legacy bank normalises into an objective with defaults", () => {
  const b = parseBank({
    deck: "Test",
    questions: [{ ...q, type: "multiple_choice" }],
  });
  assert.equal(b.schemaVersion, 1);
  assert.equal(b.questions[0].topic, "General");
  assert.deepEqual(b.questions[0].variants, []);
});
test("malformed records report field paths", () => {
  assert.throws(
    () => parseBank({ deck: "Test", questions: [{ question: "What?" }] }),
    /questions.0.id/,
  );
});
test("duplicate IDs, invalid choices and variant IDs are rejected", () => {
  assert.throws(
    () => parseBank({ deck: "T", questions: [q, q] }),
    /duplicate ID/,
  );
  assert.throws(
    () => parseBank({ deck: "T", questions: [{ ...q, answer: "C" }] }),
    /correct answers/,
  );
  assert.throws(
    () => parseBank({ deck: "T", questions: [{ ...q, options: ["A", "A"] }] }),
    /unique/,
  );
  assert.throws(
    () =>
      parseBank({
        deck: "T",
        questions: [
          {
            ...q,
            variants: [
              { id: "written", type: "written", question: "x", answer: "y" },
            ],
          },
        ],
      }),
    /reserved/,
  );
});
test("unknown fields and unsupported schema versions are rejected", () => {
  assert.throws(
    () => parseBank({ schemaVersion: 2, deck: "T", questions: [q] }),
    /schemaVersion/,
  );
  assert.throws(
    () => parseBank({ deck: "T", questions: [{ ...q, executable: "bad" }] }),
    /Unrecognized/,
  );
});
test("quoted CSV and TSV use the same validation and require deck names", async () => {
  const dir = await mkdtemp(join(tmpdir(), "recall-import-"));
  try {
    const csv = join(dir, "q.csv");
    await writeFile(
      csv,
      'id,question,answer,topic\nq1,"What, exactly?","A, indeed",MAC\n',
    );
    const b = await readBank(csv, "CSV");
    assert.equal(b.questions[0].answer, "A, indeed");
    await assert.rejects(readBank(csv), /requires --deck/);
    const tsv = join(dir, "q.tsv");
    await writeFile(tsv, "id\tquestion\tanswer\nq2\tWhy?\tBecause\n");
    assert.equal((await readBank(tsv, "TSV")).questions[0].id, "q2");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("starter deck validates", async () => {
  const b = await readBank("examples/data-protection.json");
  assert.ok(b.questions.length >= 25);
  assert.ok(
    b.questions.some((q) => q.variants.some((v) => v.type === "matching")),
  );
});
