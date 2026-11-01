import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { parseBank } from "../src/core/bank.ts";
import { emptyProgress } from "../src/core/types.ts";
const bank = parseBank({
  deck: "Reset fixture",
  questions: [
    { id: "base", question: "Foundation", answer: "A", acceptedAnswers: ["A"] },
    {
      id: "child",
      question: "Detail",
      answer: "B",
      acceptedAnswers: ["B"],
      depends_on: ["base"],
    },
  ],
});
function setup(personal: boolean) {
  const values = new Map([
    ["recall-workspace", personal ? "personal" : "server"],
  ]);
  Object.assign(globalThis, {
    indexedDB: new IDBFactory(),
    window: new EventTarget(),
    localStorage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    },
  });
}

test("personal reset previews without writes, preserves questions/other decks, relocks and starts with choices offline", async (t) => {
  setup(true);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("offline");
  });
  const cache: typeof import("../src/web/cache.ts") = await import(
    new URL("../src/web/cache.ts?reset-personal", import.meta.url).href
  );
  const api = cache.api;
  const { deckId } = await api<any>("/import", bank),
    other = await api<any>("/import", { ...bank, deck: "Other deck" });
  let view = await api<any>(`/decks/${deckId}/sessions`, { mode: "learn" });
  for (let n = 0; n < 3; n++)
    view = (
      await api<any>(`/sessions/${view.id}/answer`, {
        version: view.version,
        revision: 1,
        response: "A",
      })
    ).session;
  const otherView = await api<any>(`/decks/${other.deckId}/sessions`, {
    mode: "learn",
  });
  await api(`/sessions/${otherView.id}/answer`, {
    version: otherView.version,
    revision: 1,
    response: "A",
  });
  const before = await api<any[]>(`/decks/${deckId}/questions`),
    backup = await api<any>(`/decks/${deckId}/portable?progress=1`);
  assert.equal(backup.progress.base.progress.mastered, true);
  const preview = await api<any>(`/decks/${deckId}/reset-learning`, {});
  assert.equal(preview.dryRun, true);
  assert.equal(preview.mastered, 1);
  assert.deepEqual(await api(`/decks/${deckId}/questions`), before);
  await assert.rejects(
    api(`/decks/${deckId}/reset-learning`, {
      confirm: true,
      expectedEpoch: 99,
    }),
    /Preview/iu,
  );
  await api(`/decks/${deckId}/reset-learning`, {
    confirm: true,
    expectedEpoch: preview.expectedEpoch,
  });
  const after = await api<any[]>(`/decks/${deckId}/questions`);
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
  assert.equal(
    (await api<any>(`/decks/${other.deckId}/questions/base`)).progress.attempts,
    1,
  );
  const old = await api<any>(`/sessions/${view.id}`);
  assert.equal(old.finished, true);
  assert.ok(old.result.answers.every((a: any) => a.outdated));
  await assert.rejects(
    api(`/sessions/${view.id}/answer`, {
      version: old.version,
      revision: 1,
      response: "B",
    }),
    /reset/,
  );
  const next = await api<any>(`/decks/${deckId}/sessions`, { mode: "learn" });
  assert.equal(next.card.format, "multiple_choice");
  assert.equal(next.card.questionId, "base");
  assert.equal(next.learning.deckMastered, 0);
  assert.equal((await api<any>(`/decks/${deckId}`)).stats.locked, 1);
  assert.equal(requests, 0);
});

test("stale downloaded evidence stays exportable until explicit discard, without losing another deck outbox", async (t) => {
  setup(false);
  let epoch = 0,
    unavailable = false;
  const snapshot = () => ({
    downloadedAt: new Date().toISOString(),
    decks: ["a", "b"].map((id) => ({
      id,
      name: id,
      description: "",
      created_at: new Date().toISOString(),
      learning_epoch: id === "a" ? epoch : 0,
    })),
    items: Object.fromEntries(
      ["a", "b"].map((id) => [
        id,
        bank.questions.map((question) => ({
          question,
          revision: 1,
          progress: emptyProgress(),
        })),
      ]),
    ),
    sessions: {},
    recent: { a: [], b: [] },
  });
  t.mock.method(globalThis, "fetch", async (url: any, options: any) => {
    if (url === "/api/snapshot") {
      if (unavailable) throw Error("Unavailable");
      return Response.json(snapshot());
    }
    if (url === "/api/sync") {
      const s = JSON.parse(options.body);
      if ((s.learningEpoch ?? 0) !== (s.deckId === "a" ? epoch : 0))
        return Response.json(
          { error: "Learning was reset", code: "LEARNING_RESET" },
          { status: 409 },
        );
      return Response.json({ session: s, rejected: [], progress: {} });
    }
    throw Error("Unexpected request " + url);
  });
  const cache: typeof import("../src/web/cache.ts") = await import(
      new URL("../src/web/cache.ts?reset-server", import.meta.url).href
    ),
    api = cache.api;
  const sessions = [];
  for (const id of ["a", "b"]) {
    const s = await api<any>(`/decks/${id}/sessions`, { mode: "learn" });
    await api(`/sessions/${s.id}/answer`, {
      version: s.version,
      revision: 1,
      response: "A",
    });
    sessions.push(s);
  }
  epoch = 1;
  await assert.rejects(cache.syncDownloads(), /reset/);
  assert.equal(cache.downloadStatus().pending, 2);
  assert.deepEqual(cache.downloadStatus().resetConflicts, ["a"]);
  assert.equal((await cache.exportPendingRecovery()).sessions.length, 2);
  unavailable = true;
  await assert.rejects(cache.discardResetEvidence(), /Unavailable/);
  assert.equal(cache.downloadStatus().pending, 2);
  unavailable = false;
  await cache.discardResetEvidence();
  assert.equal(cache.downloadStatus().pending, 1);
  assert.equal(
    (await api<any>("/decks/a/questions/base")).progress.attempts,
    0,
  );
  assert.equal(
    (await api<any>("/decks/b/questions/base")).progress.attempts,
    1,
  );
  await assert.rejects(api(`/sessions/${sessions[0].id}`), /not downloaded/);
  const next = await api<any>("/decks/a/sessions", { mode: "learn" });
  assert.equal(next.card.format, "multiple_choice");
  await cache.syncDownloads();
  assert.equal(cache.downloadStatus().pending, 0);
});
