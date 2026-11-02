import { test } from "node:test";
import assert from "node:assert/strict";
import { indexedDB, IDBFactory } from "fake-indexeddb";
import { parseBank } from "../src/core/bank.ts";
import { emptyProgress } from "../src/core/types.ts";

test("downloaded study makes no per-answer requests and survives a module restart", async (t) => {
  const values = new Map<string, string>();
  Object.assign(globalThis, {
    indexedDB,
    window: new EventTarget(),
    localStorage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    },
  });
  const questions = parseBank({
    deck: "Cached",
    questions: [0, 1, 2].map((i) => ({
      id: "q" + i,
      question: "Question " + i,
      answer: "A",
      acceptedAnswers: ["A"],
    })),
  }).questions;
  const snapshot = {
    downloadedAt: new Date().toISOString(),
    decks: [
      {
        id: "cached",
        name: "Cached",
        description: "",
        created_at: new Date().toISOString(),
      },
    ],
    items: {
      cached: questions.map((question) => ({
        question,
        progress: emptyProgress(),
        revision: 1,
      })),
    },
    sessions: {},
    recent: { cached: [] },
  };
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: any, options: any) => {
    requests.push(String(url));
    if (String(url) === "/api/snapshot") return Response.json(snapshot);
    if (String(url) === "/api/sync") {
      if (unavailable) throw new Error("Deliberate server outage");
      const session = JSON.parse(options.body);
      return Response.json({ session, rejected: [], progress: {} });
    }
    throw new Error("Unexpected network request " + url);
  });
  let unavailable = false;
  const cache = await import("../src/web/cache.ts");
  await cache.api("/decks");
  const session: any = await cache.api("/decks/cached/sessions", {
    mode: "learn",
    count: 3,
  });
  const result: any = await cache.api(`/sessions/${session.id}/answer`, {
    version: session.version,
    revision: session.card.revision,
    response: "A",
  });
  const savedState = await cache.flushDeviceState();
  assert.equal(savedState.pending, 1);
  assert.equal(result.feedback.correct, true);
  assert.deepEqual(requests, ["/api/snapshot"]);
  unavailable = true;
  await assert.rejects(cache.syncDownloads(), /Deliberate server outage/);
  const beforeExport = [...requests];
  const recovery = await cache.exportPendingRecovery();
  assert.equal(recovery.sessions.length, 1);
  assert.equal(recovery.sessions[0].answers[0].response, "A");
  assert.deepEqual(
    requests,
    beforeExport,
    "Recovery export must not contact the unavailable server",
  );
  assert.equal(
    cache.downloadStatus().pending,
    1,
    "Export must preserve the outbox",
  );
  unavailable = false;
  requests.pop(); // Ignore the single deliberate failed sync for the existing no-per-answer assertions.
  const restarted = await import(
    new URL("../src/web/cache.ts?restart=1", import.meta.url).href
  );
  const resumed = await restarted.api(`/sessions/${session.id}`);
  assert.equal(resumed.cursor, 1);
  assert.deepEqual(requests, ["/api/snapshot"]);
  await restarted.syncDownloads();
  assert.deepEqual(requests, ["/api/snapshot", "/api/sync"]);
  assert.equal(restarted.downloadStatus().pending, 0);
  Object.assign(globalThis, { indexedDB: new IDBFactory() });
  const cold = await import(
    new URL("../src/web/cache.ts?cold-native-leave=1", import.meta.url).href
  );
  const beforeColdLeave = [...requests];
  assert.equal((await cold.flushDeviceState()).pending, 0);
  assert.deepEqual(
    requests,
    beforeColdLeave,
    "Leaving a never-downloaded workspace must not fetch a server",
  );
});
