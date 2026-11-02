import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPool, migrate, databaseUrl } from "../src/server/db.ts";
import { Store } from "../src/server/store.ts";
import { parseBank } from "../src/core/bank.ts";
import { createApp } from "../src/server/http.ts";
import { newSession, advanceSession, requestHint } from "../src/core/study.ts";
import { syncOfflineSession } from "../src/server/offline.ts";
import { remoteBackend } from "../src/remote.ts";
import { createRecovery } from "../src/core/recovery.ts";
import { request } from "node:http";

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
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
});
async function fresh() {
  const result = await store.importBank({
    ...bank,
    deck: "Deck " + randomUUID(),
  });
  return result.deckId;
}
test("HTTP hints and offline evidence preserve assistance without double mastery credit", async () => {
  const imported = await store.importBank(
      parseBank({
        deck: "Hint " + randomUUID(),
        questions: [
          {
            id: "base",
            question: "Synthetic cue prompt",
            answer: "alpha",
            acceptedAnswers: ["alpha"],
            hint: "A starting point",
          },
          {
            id: "child",
            question: "Synthetic follow-up",
            answer: "beta",
            depends_on: ["base"],
          },
        ],
      }),
    ),
    id = imported.deckId,
    remote = remoteBackend(base);
  let s = await remote.createSession(id, { mode: "learn" });
  s = (
    await remote.answer(s.id, {
      version: s.version,
      revision: 1,
      response: "alpha",
    })
  ).session;
  assert.equal(s.card?.format, "written");
  const cue = await remote.hint(s.id, { version: s.version, revision: 1 });
  await assert.rejects(
    remote.hint(s.id, { version: s.version, revision: 1 }),
    /changed/,
  );
  assert.equal((await remote.getSession(s.id)).hint, "A starting point");
  const result = await remote.answer(s.id, {
    version: cue.version,
    revision: 1,
    response: "alpha",
  });
  assert.equal(result.feedback?.hintUsed, true);
  let item = await remote.question(id, "base");
  assert.equal(item.progress.recalls, 0);
  assert.equal(item.progress.mastered, false);
  const before = item.progress;
  await remote.editQuestion(
    id,
    "base",
    { ...item.question, hint: "Revised cue" },
    item.revision,
  );
  item = await remote.question(id, "base");
  assert.equal(item.revision, 1);
  assert.deepEqual(item.progress, before);
  const items = await remote.items(id),
    local = newSession(id, items, { mode: "learn" });
  requestHint(local, item, { version: local.version, revision: item.revision });
  const r = advanceSession(
    local,
    item,
    { version: local.version, revision: item.revision, response: "alpha" },
    items,
  );
  assert.equal(r.attempt.hintUsed, true);
  await syncOfflineSession(store, local);
  await syncOfflineSession(store, local);
  item = await remote.question(id, "base");
  assert.equal(item.progress.attempts, 3);
  assert.equal(item.progress.assisted, 2);
  assert.equal(item.progress.recalls, 0);
  const stripped = structuredClone(local);
  delete stripped.answers[0].hintUsed;
  await assert.rejects(
    syncOfflineSession(store, stripped),
    /cannot be rewritten/,
  );
});
test("bulk organization is atomic and flags preserve progress while controlling downstream eligibility", async () => {
  const id = await fresh(),
    remote = remoteBackend(base),
    s = await remote.createSession(id, { mode: "learn" });
  await remote.answer(s.id, {
    version: s.version,
    revision: s.card!.revision,
    response: ["A"],
  });
  const before = await remote.items(id),
    moves = before.map((i) => ({
      id: i.question.id,
      topic: "Sorted",
      fromTopic: i.question.topic,
    }));
  assert.equal((await remote.organizeQuestions(id, { moves })).dryRun, true);
  assert.deepEqual(await remote.items(id), before);
  await assert.rejects(
    remote.organizeQuestions(id, {
      moves: [...moves, { id: "missing", topic: "Sorted" }],
      apply: true,
    }),
    /not found/,
  );
  assert.deepEqual(await remote.items(id), before);
  assert.equal(
    (await remote.organizeQuestions(id, { moves, apply: true })).moved,
    5,
  );
  let after = await remote.items(id);
  assert.deepEqual(
    after.map((i) => i.progress),
    before.map((i) => i.progress),
  );
  assert.deepEqual(
    after.map((i) => i.revision),
    before.map((i) => i.revision),
  );
  const root = await remote.question(id, "q0"),
    child = await remote.question(id, "q1");
  await remote.editQuestion(
    id,
    "q1",
    { ...child.question, depends_on: ["q0"] },
    child.revision,
  );
  await remote.editQuestion(
    id,
    "q0",
    {
      ...root.question,
      flag: { note: "Needs a clearer prompt", allowDependents: false },
    },
    root.revision,
  );
  assert.ok(
    (await remote.listQuestions(id, { status: "locked" })).some(
      (i) => i.question.id === "q1",
    ),
  );
  const cram = await remote.createSession(id, {
    mode: "cram",
    ignorePrerequisites: true,
  });
  assert.ok(
    !(await store.loadSession(cram.id)).queue.some(
      (e) => e.questionId === "q0",
    ),
  );
  await remote.editQuestion(
    id,
    "q0",
    {
      ...root.question,
      flag: { note: "Needs a clearer prompt", allowDependents: true },
    },
    root.revision,
  );
  assert.ok(
    !(await remote.listQuestions(id, { status: "locked" })).some(
      (i) => i.question.id === "q1",
    ),
  );
  assert.equal(
    (await remote.listQuestions(id, { flagged: "with" }))[0].question.id,
    "q0",
  );
  const exported = await remote.exportBank(id);
  assert.equal(
    exported.questions.find((q) => q.id === "q0")!.flag?.note,
    "Needs a clearer prompt",
  );
  assert.deepEqual((await remote.question(id, "q0")).progress, root.progress);
  await assert.rejects(
    remote.organizeQuestions(id, {
      moves: [{ id: "q0", topic: "Other", fromTopic: "Old topic" }],
      apply: true,
    }),
    /Topic changed/,
  );
});
test("prerequisite graph updates are atomic, protect archives and preserve revisions", async () => {
  const id = await fresh();
  const original = await store.question(id, "q1");
  await store.editQuestion(
    id,
    "q1",
    { ...original.question, depends_on: ["q0"] },
    original.revision,
  );
  assert.equal((await store.question(id, "q1")).revision, original.revision);
  const s = await store.createSession(id, { mode: "cram", count: 20 });
  assert.ok(
    !(await store.loadSession(s.id)).queue.some((e) => e.questionId === "q1"),
  );
  await assert.rejects(store.archiveQuestion(id, "q0"), /missing or archived/);
  const root = await store.question(id, "q0");
  await assert.rejects(
    store.editQuestion(
      id,
      "q0",
      { ...root.question, depends_on: ["q1"] },
      root.revision,
    ),
    /cycle/,
  );
  assert.deepEqual(
    (await store.question(id, "q0")).question.depends_on,
    undefined,
  );
  const b = await store.exportBank(id);
  const incomplete = {
    ...b,
    questions: b.questions.filter((q) => q.id !== "q0"),
  };
  await assert.rejects(
    store.importBank(incomplete, { replace: true, dryRun: true }),
    /missing or archived/,
  );
  await assert.rejects(
    store.importBank(incomplete, { replace: true }),
    /missing or archived/,
  );
  assert.equal((await store.items(id)).length, 5);
  const status = await new Promise<number>((resolve, reject) => {
    const req = request(
      base + "/api/decks",
      { headers: { host: "attacker.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
});
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
test(
  "idle PostgreSQL disconnects are handled and the pool reconnects",
  { timeout: 5000 },
  async (t) => {
    t.mock.method(console, "error", () => {});
    const recovery = createPool(testUrl.toString());
    try {
      const pid = (await recovery.query("SELECT pg_backend_pid() AS pid"))
        .rows[0].pid;
      const disconnected = new Promise<void>((resolve) =>
        recovery.once("error", () => resolve()),
      );
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
      await disconnected;
      assert.equal(
        (await recovery.query("SELECT 1 AS value")).rows[0].value,
        1,
      );
    } finally {
      await recovery.end();
    }
  },
);
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
  await r.json();
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
  await r.json();
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
          env: {
            ...process.env,
            DATABASE_URL: testUrl.toString(),
            RECALL_SERVER_URL: "",
          },
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
    assert.equal(
      cli(["organize", title, "--ids", "q0,q1", "--to", "Sorted"]).dryRun,
      true,
    );
    assert.equal(cli(["question", title, "q0"]).question.topic, "MAC");
    assert.equal(
      cli(["organize", title, "--ids", "q0,q1", "--to", "Sorted", "--apply"])
        .moved,
      2,
    );
    assert.equal(
      cli([
        "question-hint",
        title,
        "q0",
        "--set",
        "Think about the first concept",
      ]).question.hint,
      "Think about the first concept",
    );
    assert.equal(
      cli(["questions", title, "--hints", "with", "--json"]).length,
      1,
    );
    assert.equal(
      cli(["flag", title, "q0", "--note", "Rewrite this prompt"]).question
        .question.flag.allowDependents,
      false,
    );
    assert.equal(
      cli(["questions", title, "--flagged", "with", "--json"]).length,
      1,
    );
    assert.equal(
      cli(["flag", title, "q0", "--clear"]).question.question.flag,
      undefined,
    );
    const exported = join(dir, "out.json");
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "export", title, "-o", exported],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: testUrl.toString(),
          RECALL_SERVER_URL: "",
        },
      },
    );
    assert.equal(r.status, 0, r.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("replacement archives absent IDs, is previewable, and preserves unchanged progress", async () => {
  const id = await fresh();
  const session = await store.createSession(id, { mode: "test", count: 1 });
  await answer(session.id);
  const before = await store.question(id, session.card!.questionId);
  const bank = await store.exportBank(id);
  bank.questions = bank.questions.filter((q) => q.id === before.question.id);
  const preview = await store.importBank(bank, { replace: true, dryRun: true });
  assert.equal(preview.archived, 4);
  assert.equal((await store.items(id)).length, 5);
  const result = await store.importBank(bank, { replace: true });
  assert.equal(result.archived, 4);
  assert.equal((await store.items(id)).length, 1);
  assert.equal(
    (await store.question(id, before.question.id)).progress.attempts,
    1,
  );
  assert.equal((await store.listQuestions(id, { archived: true })).length, 5);
  await store.archiveQuestion(id, result.archiveIds[0], true);
  assert.equal((await store.items(id)).length, 2);
});
test("archived questions disappear safely from an active session", async () => {
  const id = await fresh();
  const s = await store.createSession(id, { mode: "test", count: 5 });
  await store.archiveQuestion(id, s.card!.questionId);
  const reloaded = await store.getSession(s.id);
  assert.equal(reloaded.total, 4);
  assert.notEqual(reloaded.card!.questionId, s.card!.questionId);
});
test("offline evidence is recomputed and duplicate uploads cannot inflate mastery", async () => {
  const id = await fresh(),
    items = await store.items(id);
  const s = newSession(id, items, { mode: "test", count: 2 });
  const item = items.find((i) => i.question.id === s.queue[0].questionId)!;
  const { attempt } = advanceSession(s, item, {
    version: 0,
    revision: item.revision,
    response: ["B"],
  });
  s.version++;
  attempt.correct = true;
  const first = await syncOfflineSession(store, s);
  assert.equal(first.session.answers[0].correct, false);
  await syncOfflineSession(store, s);
  assert.equal(
    (await store.question(id, item.question.id)).progress.attempts,
    1,
  );
});
test("offline answers against corrected questions are retained but excluded from progress", async () => {
  const id = await fresh(),
    items = await store.items(id);
  const s = newSession(id, items, { mode: "test", count: 1 });
  const item = items.find((i) => i.question.id === s.queue[0].questionId)!;
  advanceSession(s, item, {
    version: 0,
    revision: item.revision,
    response: ["A"],
  });
  s.version++;
  await store.editQuestion(
    id,
    item.question.id,
    { ...item.question, question: "Revised question" },
    item.revision,
  );
  const result = await syncOfflineSession(store, s);
  assert.equal(result.session.answers[0].invalidated, true);
  assert.equal(
    (await store.question(id, item.question.id)).progress.attempts,
    0,
  );
});
test("a whole downloaded learning session merges every repeated attempt exactly once", async () => {
  const id = await fresh(),
    items = await store.items(id);
  const s = newSession(id, items, { mode: "learn", count: 3 });
  for (let n = 0; !s.finished && n < 30; n++) {
    const entry = s.queue[s.cursor],
      item = items.find((i) => i.question.id === entry.questionId)!;
    const response = entry.format === "multiple_choice" ? ["A"] : "A";
    const { progress } = advanceSession(s, item, {
      version: s.version,
      revision: item.revision,
      response,
    });
    item.progress = progress;
    s.version++;
  }
  assert.equal(s.finished, true);
  await syncOfflineSession(store, s);
  await syncOfflineSession(store, s);
  for (const item of items)
    assert.equal(
      (await store.question(id, item.question.id)).progress.attempts,
      item.progress.attempts,
    );
});
test("remote CLI adapter offers the same listing, audit and replacement operations", async () => {
  const id = await fresh();
  const remote = remoteBackend(base);
  assert.equal((await remote.listQuestions(id)).length, 5);
  assert.equal((await remote.audit(id)).total, 5);
  const bank = await remote.exportBank(id);
  bank.questions = bank.questions.slice(0, 2);
  const r = await remote.importBank(bank, { replace: true });
  assert.equal(r.archived, 3);
  assert.equal((await remote.items(id)).length, 2);
  await remote.archiveQuestion(id, bank.questions[0].id);
  await remote.archiveQuestion(id, bank.questions[0].id, true);
  assert.equal((await remote.items(id)).length, 2);
});
test("private recovery CLI previews without writes and replays pending evidence exactly once", async () => {
  const id = await fresh();
  const items = await store.items(id),
    session = newSession(id, items, { mode: "learn", count: 1 });
  const item = items.find(
    (i) => i.question.id === session.queue[0].questionId,
  )!;
  advanceSession(session, item, {
    version: 0,
    revision: item.revision,
    response: ["A"],
  });
  session.version++;
  const recovery = createRecovery(
    [{ id, bank: await store.exportBank(id) }],
    [session],
  );
  const directory = await mkdtemp(join(tmpdir(), "recall-recovery-"));
  const file = join(directory, "pending.json");
  await writeFile(file, JSON.stringify(recovery));
  const run = (apply = false) => {
    const args = [
      "--import",
      "tsx",
      "src/cli.ts",
      "--server",
      base,
      "recover",
      file,
      ...(apply ? ["--apply"] : []),
    ];
    // The parent HTTP server must keep running while the child performs requests.
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        env: {
          ...process.env,
          RECALL_SERVER_URL: "",
          DATABASE_URL: testUrl.toString(),
        },
        windowsHide: true,
      });
      let output = "",
        error = "";
      child.stdout.on("data", (c) => (output += c));
      child.stderr.on("data", (c) => (error += c));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(output) : reject(new Error(error || output)),
      );
    });
  };
  try {
    assert.equal(JSON.parse(await run()).dryRun, true);
    assert.equal(
      (await store.question(id, item.question.id)).progress.attempts,
      0,
    );
    await run(true);
    await run(true);
    assert.equal(
      (await store.question(id, item.question.id)).progress.attempts,
      1,
    );
    const current = await store.question(id, item.question.id);
    await store.editQuestion(
      id,
      item.question.id,
      {
        ...current.question,
        question: current.question.question + " corrected",
      },
      current.revision,
    );
    const stale = JSON.parse(await run(true));
    assert.equal(stale.completed[0].obsolete, 1);
    assert.equal(
      (await store.question(id, item.question.id)).progress.attempts,
      0,
    );
    const before = await readFile(file, "utf8");
    assert.deepEqual(JSON.parse(before), JSON.parse(JSON.stringify(recovery)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("generated recognition and round state survive live HTTP, legacy resume and idempotent offline sync", async () => {
  const bank = parseBank({
    deck: "Recognition " + randomUUID(),
    questions: [0, 1, 2].map((n) => ({
      id: "def" + n,
      question: "Definition " + n,
      answer: "Answer " + n,
      acceptedAnswers: ["Answer " + n],
    })),
  });
  const { deckId } = await store.importBank(bank);
  let view = await store.createSession(deckId, { mode: "learn", count: 1 });
  assert.equal(view.card!.format, "multiple_choice");
  assert.equal(view.card!.options!.length, 3);
  const raw = await store.loadSession(view.id);
  delete raw.learning;
  raw.targetCount = 1; // Legacy count meant total objectives; reproduce a one-card session.
  raw.queue[0].variantId = "written";
  raw.queue[0].format = "written";
  await pool.query("UPDATE sessions SET data=$2 WHERE id=$1", [raw.id, raw]);
  view = await store.getSession(raw.id);
  assert.equal(view.card!.format, "multiple_choice");
  assert.equal(view.version, 1);
  assert.ok(
    (await store.items(deckId)).every((i) => i.progress.attempts === 0),
  );
  for (let n = 0; n < 3; n++) {
    const item = await store.question(deckId, view.card!.questionId);
    assert.equal(view.card!.format, n === 0 ? "multiple_choice" : "written");
    const result = await store.answer(view.id, {
      version: view.version,
      revision: view.card!.revision,
      response: item.question.answer,
    });
    view = result.session;
  }
  assert.equal(view.learning!.round, 2);
  assert.equal(view.card!.format, "multiple_choice");
  const other = await store.importBank({
    ...bank,
    deck: "Offline recognition " + randomUUID(),
  });
  const items = await store.items(other.deckId),
    s = newSession(other.deckId, items, { mode: "learn", count: 2 });
  while (!s.finished) {
    const item = items.find(
      (i) => i.question.id === s.queue[s.cursor].questionId,
    )!;
    const r = advanceSession(
      s,
      item,
      {
        version: s.version,
        revision: item.revision,
        response: item.question.answer,
      },
      items,
    );
    item.progress = r.progress;
    s.version++;
  }
  await syncOfflineSession(store, s);
  await syncOfflineSession(store, s);
  for (const item of items) {
    const stored = await store.question(other.deckId, item.question.id);
    assert.equal(stored.progress.attempts, 3);
    assert.equal(stored.progress.recognition, 1);
    assert.equal(stored.progress.recalls, 2);
    assert.equal(stored.progress.mastered, true);
  }
});

test("deck reset is explicit and atomic, preserves content/history, and blocks old clients and recovery replay", async () => {
  const bank = parseBank({
    deck: "Reset " + randomUUID(),
    questions: [
      { id: "base", question: "Foundation", answer: "A" },
      { id: "child", question: "Details", answer: "B", depends_on: ["base"] },
    ],
  });
  const { deckId } = await store.importBank(bank),
    other = await fresh();
  let view = await store.createSession(deckId, { mode: "learn" });
  for (let n = 0; n < 3; n++) {
    let version = view.version;
    if (view.card!.selfGrade)
      version = (
        await store.reveal(view.id, { version, revision: 1, response: "A" })
      ).version;
    view = (
      await store.answer(view.id, {
        version,
        revision: 1,
        response: "A",
        rating: view.card!.selfGrade ? "good" : undefined,
      })
    ).session;
  }
  const exam = await store.createSession(deckId, { mode: "test", count: 1 });
  await store.answer(exam.id, {
    version: exam.version,
    revision: 1,
    response: "A",
  });
  const otherSession = await store.createSession(other, { mode: "learn" });
  await store.answer(otherSession.id, {
    version: otherSession.version,
    revision: 1,
    response: ["A"],
  });
  const items = await store.items(deckId),
    offline = newSession(deckId, items, { mode: "learn" });
  const offlineItem = items.find(
    (i) => i.question.id === offline.queue[0].questionId,
  )!;
  if (offline.queue[0].format === "written")
    offline.revealed = { cursor: 0, response: offlineItem.question.answer };
  advanceSession(
    offline,
    offlineItem,
    {
      version: 0,
      revision: 1,
      response: offlineItem.question.answer,
      rating: "good",
    },
    items,
  );
  offline.version++;
  const before = await store.items(deckId),
    remote = remoteBackend(base),
    preview = await remote.resetLearning(deckId);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.mastered, 1);
  assert.deepEqual(await store.items(deckId), before);
  await assert.rejects(
    remote.resetLearning(deckId, { confirm: true, expectedEpoch: 99 }),
    /Preview/iu,
  );
  const resets = await Promise.allSettled([
    remote.resetLearning(deckId, { confirm: true, expectedEpoch: 0 }),
    remote.resetLearning(deckId, { confirm: true, expectedEpoch: 0 }),
  ]);
  assert.equal(resets.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await store.deck(deckId)).learning_epoch, 1);
  const after = await store.items(deckId);
  assert.deepEqual(
    after.map(({ progress, ...q }) => q),
    before.map(({ progress, ...q }) => q),
  );
  assert.ok(
    after.every(
      (i) =>
        i.progress.attempts === 0 &&
        !i.progress.mastered &&
        !i.progress.nextReview,
    ),
  );
  assert.equal((await store.deck(deckId)).stats.locked, 1);
  assert.equal((await store.deck(other)).stats.attempts, 1);
  const old = await store.getSession(view.id);
  assert.equal(old.finished, true);
  assert.ok(old.result!.answers.every((a) => a.outdated));
  await assert.rejects(
    store.answer(view.id, { version: old.version, revision: 1, response: "B" }),
    /reset/,
  );
  await assert.rejects(store.rateTest(exam.id, 0, "good"), /reset/);
  await assert.rejects(syncOfflineSession(store, offline), /reset/);
  assert.equal(
    (
      await pool.query("SELECT count(*) FROM sessions WHERE id=$1", [
        offline.id,
      ])
    ).rows[0].count,
    "0",
  );
  const historical = await pool.query(
    "SELECT invalidated FROM attempts WHERE deck_id=$1",
    [deckId],
  );
  assert.ok(
    historical.rows.length > 0 && historical.rows.every((r) => r.invalidated),
  );
  const next = await store.createSession(deckId, { mode: "learn" });
  assert.equal(next.card!.format, "multiple_choice");
  assert.equal(next.card!.questionId, "base");
  assert.equal((await store.loadSession(next.id)).learningEpoch, 1);
  await Promise.allSettled([
    store.answer(next.id, {
      version: next.version,
      revision: 1,
      response: "A",
    }),
    store.resetLearning(deckId, { confirm: true, expectedEpoch: 1 }),
  ]);
  assert.equal((await store.deck(deckId)).stats.attempts, 0);
  const run = (apply = false) => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli.ts",
        "reset-learning",
        deckId,
        ...(apply ? ["--apply"] : []),
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: testUrl.toString(),
          RECALL_SERVER_URL: "",
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.equal(run().dryRun, true);
  assert.equal((await store.deck(deckId)).learning_epoch, 2);
  assert.equal(run(true).dryRun, false);
  assert.equal((await store.deck(deckId)).learning_epoch, 3);
});
