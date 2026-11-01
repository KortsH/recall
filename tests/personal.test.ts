import { test } from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { parseBank } from "../src/core/bank.ts";

test("a fresh device imports, studies, edits, exports and resumes with zero server requests", async () => {
  const values = new Map<string, string>([["recall-workspace", "personal"]]);
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
      throw new Error("Network deliberately unavailable");
    },
  });
  const { api, downloadStatus, syncDownloads, refreshDownloads } =
    await import("../src/web/cache.ts");
  assert.deepEqual(await api("/decks"), []);
  const bank = parseBank({
    deck: "From a friend",
    questions: [
      {
        id: "intro",
        question: "Definition",
        answer: "A",
        acceptedAnswers: ["A"],
      },
      {
        id: "apply",
        question: "Scenario",
        answer: "B",
        acceptedAnswers: ["B"],
        depends_on: ["intro"],
      },
    ],
  });
  const preview: any = await api("/import?dryRun=1", bank);
  assert.equal(preview.created, 2);
  assert.deepEqual(await api("/decks"), []);
  const result: any = await api("/import", bank),
    id = result.deckId;
  const summary: any = await api(`/decks/${id}`);
  assert.equal(summary.stats.locked, 1);
  const session: any = await api(`/decks/${id}/sessions`, {
    mode: "learn",
    count: 5,
  });
  assert.equal(session.card.questionId, "intro");
  await api(`/sessions/${session.id}/answer`, {
    version: session.version,
    revision: session.card.revision,
    response: "A",
  });
  let item: any = await api(`/decks/${id}/questions/intro`);
  assert.equal(item.progress.attempts, 1);
  await api(
    `/decks/${id}/questions/intro`,
    {
      question: { ...item.question, explanation: "Clarified" },
      revision: item.revision,
    },
    "PUT",
  );
  item = await api(`/decks/${id}/questions/intro`);
  assert.equal(item.progress.attempts, 1);
  const portable: any = await api(`/decks/${id}/portable?progress=1`);
  assert.equal(portable.progress.intro.progress.attempts, 1);
  await assert.rejects(
    api("/import?replace=1", {
      deck: bank.deck,
      questions: [bank.questions[1]],
    }),
    /missing/,
  );
  assert.equal((await api<any[]>(`/decks/${id}/questions`)).length, 2);
  await syncDownloads();
  await refreshDownloads();
  assert.equal(downloadStatus().pending, 0);
  const restarted = await import(
    new URL("../src/web/cache.ts?personal-restart=1", import.meta.url).href
  );
  assert.equal(
    (await restarted.api(`/decks/${id}/questions/intro`)).progress.attempts,
    1,
  );
  assert.equal(requests, 0);
});
