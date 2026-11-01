import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPool, migrate, databaseUrl } from "../src/server/db.ts";
import { Store } from "../src/server/store.ts";
import { parseBank } from "../src/core/bank.ts";
import { createApp } from "../src/server/http.ts";

// Isolated real PostgreSQL database. Never clear or reuse a user's development database.
const name = "recall_test_" + randomUUID().replaceAll("-", "");
const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? databaseUrl());
adminUrl.pathname = "/postgres";
const testUrl = new URL(adminUrl);
testUrl.pathname = "/" + name;
const admin = createPool(adminUrl.toString());
const pool = createPool(testUrl.toString());
const store = new Store(pool);
const server = createApp(store);
let base = "";
const bank = parseBank({
  deck: "Integration",
  questions: Array.from({ length: 5 }, (_, i) => ({
    id: "q" + i,
    topic: i % 2 ? "DAC" : "MAC",
    question: "Question " + i,
    answer: "A",
    options: ["A", "B", "C"],
    acceptedAnswers: ["A"],
    explanation: "A is correct.",
  })),
});
before(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await migrate(pool);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});
async function fresh() {
  const result = await store.importBank({
    ...bank,
    deck: "Deck " + randomUUID(),
  });
  return result.deckId;
}
async function answer(id: string, correct = true) {
  const s = await store.getSession(id);
  assert.ok(s.card);
  const c = s.card!;
  return store.answer(id, {
    version: s.version,
    revision: c.revision,
    response: c.options ? [correct ? "A" : "B"] : correct ? "A" : "B",
  });
}

test("repeat import is idempotent and preserves existing progress", async () => {
  const id = await fresh();
  const s = await store.createSession(id, { mode: "learn", count: 5 });
  await answer(s.id);
  const before = await store.question(id, s.card!.questionId);
  const b = await store.exportBank(id);
  const result = await store.importBank(b);
  assert.equal(result.unchanged, 5);
  assert.deepEqual(
    (await store.question(id, s.card!.questionId)).progress,
    before.progress,
  );
});
test("answer submission survives store recreation and rejects duplicate answers", async () => {
  const id = await fresh();
  const s = await store.createSession(id, { mode: "learn", count: 5 });
  const input = {
    version: s.version,
    revision: s.card!.revision,
    response: ["A"],
  };
  await store.answer(s.id, input);
  await assert.rejects(store.answer(s.id, input), /Session changed/);
  const again = await new Store(pool).getSession(s.id);
  assert.equal(again.cursor, 1);
  assert.equal(
    (await store.question(id, s.card!.questionId)).progress.attempts,
    1,
  );
});
test("parallel submissions credit exactly one answer", async () => {
  const id = await fresh();
  const s = await store.createSession(id, { mode: "cram" });
  const input = {
    version: s.version,
    revision: s.card!.revision,
    response: ["A"],
  };
  const results = await Promise.allSettled([
    store.answer(s.id, input),
    store.answer(s.id, input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await store.question(id, s.card!.questionId)).progress.attempts,
    1,
  );
});
test("mistakes return after intervening objectives", async () => {
  const id = await fresh();
  const s = await store.createSession(id, { mode: "cram", count: 5 });
  const result = await answer(s.id, false);
  const raw = await store.loadSession(s.id);
  assert.equal(raw.queue[3].questionId, s.card!.questionId);
  assert.notEqual(result.session.card!.questionId, s.card!.questionId);
});
test("explanation edits preserve progress; answer edits reset and invalidate scores", async () => {
  const id = await fresh();
  const s = await store.createSession(id, { mode: "test", count: 1 });
  await answer(s.id);
  let item = await store.question(id, s.card!.questionId);
  await store.editQuestion(
    id,
    item.question.id,
    { ...item.question, explanation: "Improved explanation" },
    item.revision,
  );
  item = await store.question(id, item.question.id);
  assert.equal(item.progress.attempts, 1);
  assert.equal(item.revision, 1);
  await store.editQuestion(
    id,
    item.question.id,
    { ...item.question, answer: "B", acceptedAnswers: ["B"] },
    item.revision,
  );
  assert.equal(
    (await store.question(id, item.question.id)).progress.attempts,
    0,
  );
  const result = await store.getSession(s.id);
  assert.equal(result.result!.answers[0].outdated, true);
  assert.equal(result.result!.graded, 0);
});
test("editing a live question rejects a stale answer and stale edits", async () => {
  const id = await fresh();
  const s = await store.createSession(id, { mode: "test", count: 1 });
  const item = await store.question(id, s.card!.questionId);
  await store.editQuestion(
    id,
    item.question.id,
    { ...item.question, question: "Corrected prompt" },
    item.revision,
  );
  await assert.rejects(
    store.answer(s.id, {
      version: s.version,
      revision: s.card!.revision,
      response: ["A"],
    }),
    /Question changed/,
  );
  await assert.rejects(
    store.editQuestion(id, item.question.id, item.question, item.revision),
    /edited elsewhere/,
  );
});
test("flashcard self-assessment requires reveal and records the original response", async () => {
  const id = await fresh();
  let s = await store.createSession(id, { mode: "flashcards", count: 1 });
  await assert.rejects(
    store.answer(s.id, {
      version: s.version,
      revision: s.card!.revision,
      response: "",
      rating: "good",
    }),
    /Reveal/,
  );
  const r = await store.reveal(s.id, {
    version: s.version,
    revision: s.card!.revision,
    response: "my recall",
  });
  const result = await store.answer(s.id, {
    version: r.version,
    revision: s.card!.revision,
    response: "tampered",
    rating: "good",
  });
  assert.equal(result.feedback!.response, "my recall");
  assert.equal(result.feedback!.selfAssessed, true);
  assert.equal(
    (await store.question(id, s.card!.questionId)).progress.selfAssessed,
    1,
  );
});
test("test mode hides feedback and model answers until completion", async () => {
  const id = await fresh();
  const s = await store.createSession(id, { mode: "test", count: 2 });
  assert.ok(!JSON.stringify(s).includes("A is correct"));
  await assert.rejects(
    store.reveal(s.id, {
      version: s.version,
      revision: s.card!.revision,
      response: "",
    }),
    /after the test/,
  );
  const r = await answer(s.id);
  assert.equal(r.feedback, null);
  assert.equal(r.session.result, null);
  const done = await answer(s.id);
  assert.equal(done.session.finished, true);
  assert.equal(done.session.result!.answers.length, 2);
});
test("written exam answers can be self-graded only after completion and only once", async () => {
  const id = (
    await store.importBank(
      parseBank({
        deck: "Essay " + randomUUID(),
        questions: [
          {
            id: "essay",
            question: "Explain",
            answer: "Model answer",
            rubric: ["First idea"],
          },
        ],
      }),
    )
  ).deckId;
  const s = await store.createSession(id, { mode: "test", count: 1 });
  const r = await store.answer(s.id, {
    version: s.version,
    revision: s.card!.revision,
    response: "My essay",
  });
  assert.equal(r.session.result!.pending, 1);
  assert.deepEqual(r.session.result!.answers[0].rubric, ["First idea"]);
  const graded = await store.rateTest(s.id, 0, "good");
  assert.equal(graded.result!.correct, 1);
  await assert.rejects(store.rateTest(s.id, 0, "good"), /already been graded/);
});
test("expired timed tests finish without accepting another answer", async () => {
  const id = await fresh();
  const s = await store.createSession(id, {
    mode: "test",
    count: 3,
    minutes: 1,
  });
  const raw = await store.loadSession(s.id);
  raw.deadline = "2000-01-01T00:00:00Z";
  await pool.query("UPDATE sessions SET data=$2 WHERE id=$1", [s.id, raw]);
  const r = await store.answer(s.id, {
    version: s.version,
    revision: s.card!.revision,
    response: ["A"],
  });
  assert.equal(r.session.finished, true);
  assert.equal(r.session.result!.unanswered, 3);
  assert.equal(r.session.result!.graded, 0);
});
test("HTTP validates imports atomically and rejects cross-origin mutations", async () => {
  const before = (await store.decks()).length;
  let r = await fetch(base + "/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deck: "Bad bank",
      questions: [bank.questions[0], { id: "broken" }],
    }),
  });
  assert.equal(r.status, 400);
  assert.equal((await store.decks()).length, before);
  r = await fetch(base + "/api/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://elsewhere.invalid",
    },
    body: JSON.stringify(bank),
  });
  assert.equal(r.status, 403);
});
test("CLI import, export and stats operate on the same real database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "recall-cli-"));
  try {
    const file = join(dir, "bank.json");
    const title = "CLI " + randomUUID();
    await writeFile(file, JSON.stringify({ ...bank, deck: title }));
    const cli = (args: string[]) => {
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx", "src/cli.ts", ...args],
        {
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: testUrl.toString() },
        },
      );
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout);
    };
    assert.equal(cli(["import", file, "--json"]).created, 5);
    assert.equal(cli(["import", file, "--json"]).unchanged, 5);
    const d = cli(["stats", title, "--json"]);
    assert.equal(d.stats.total, 5);
    const s = cli(["session-start", title, "--questions", "2"]);
    const response = join(dir, "answer.json");
    await writeFile(
      response,
      JSON.stringify({
        version: s.version,
        revision: s.card.revision,
        response: ["A"],
      }),
    );
    cli(["answer", s.id, "--file", response]);
    assert.equal(cli(["stats", title, "--json"]).stats.attempts, 1);
    const exported = join(dir, "out.json");
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "export", title, "-o", exported],
      {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: testUrl.toString() },
      },
    );
    assert.equal(r.status, 0, r.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
