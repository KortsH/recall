import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { parseBank, semanticContent } from "../src/core/schema.ts";
import {
  canonical,
  parseAuthoring,
  parseEditBackup,
  planAuthoring,
  questionVersion,
  resolveAuthoring,
  type AuthoringBatch,
} from "../src/core/authoring.ts";
import { importPersonal } from "../src/core/portable.ts";
import { emptyProgress, type Item, type Question } from "../src/core/types.ts";
import { newSession, advanceSession } from "../src/core/study.ts";

const bank = () =>
  parseBank({
    deck: "Shared",
    questions: [
      {
        id: "root",
        topic: "Basics",
        question: "Define a queue",
        answer: "First in, first out",
      },
      {
        id: "child",
        topic: "Basics",
        question: "Apply a queue",
        answer: "A",
        depends_on: ["root"],
      },
      {
        id: "other",
        topic: "Other",
        question: "Define a stack",
        answer: "Last in, first out",
      },
    ],
  });
const items = () =>
  bank().questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
    archived: false,
  }));
const batch = (
  current: Item[],
  question: Question = {
    ...current[0].question,
    hint: "Think about arrival order",
  },
): AuthoringBatch => ({
  format: "recall-edits",
  version: 1,
  id: crypto.randomUUID(),
  deckId: "shared",
  changes: [
    {
      id: question.id,
      base: questionVersion(current[0]),
      value: { question, archived: false },
    },
  ],
});

test("authoring compares complete metadata, supports explicit three-way resolution and detects graph conflicts", () => {
  const original = items(),
    edit = parseAuthoring(batch(original));
  assert.deepEqual(
    planAuthoring(edit, original, { name: "Shared", description: "" }),
    [],
  );
  const remote = structuredClone(original);
  remote[0].question.hint = "An independently edited hint";
  const conflicts = planAuthoring(edit, remote, {
    name: "Shared",
    description: "",
  });
  assert.equal(
    conflicts.length,
    1,
    "same semantic revision must not hide metadata conflicts",
  );
  assert.equal(remote[0].revision, 1);
  assert.throws(() => resolveAuthoring(edit, conflicts, {}), /every conflict/);
  const mine = resolveAuthoring(edit, conflicts, { "question:root": "local" })!;
  assert.notEqual(mine.id, edit.id);
  assert.deepEqual(
    planAuthoring(mine, remote, { name: "Shared", description: "" }),
    [],
  );
  assert.equal(
    resolveAuthoring(edit, conflicts, { "question:root": "server" }),
    null,
  );
  assert.equal(original[0].question.hint, undefined);
  const cyclic = batch(original, {
    ...original[0].question,
    depends_on: ["child"],
  });
  assert.equal(
    planAuthoring(cyclic, original, { name: "Shared", description: "" })[0]
      .reason,
    "graph",
  );
  const dangling = batch(original, {
    ...original[0].question,
    depends_on: ["missing"],
  });
  assert.equal(
    planAuthoring(dangling, original, { name: "Shared", description: "" })[0]
      .reason,
    "graph",
  );
  assert.throws(() =>
    parseAuthoring({ ...edit, server: "https://injected.example" }),
  );
  assert.throws(() =>
    parseAuthoring({ ...edit, changes: [...edit.changes, ...edit.changes] }),
  );
  assert.throws(() =>
    parseEditBackup({
      format: "recall-edit-backup",
      version: 1,
      createdAt: "now",
      batches: [edit, edit],
    }),
  );
});

test("downloaded edits persist offline, require review, retry lost acknowledgements once and exclude unpublished grading content", async (t) => {
  const storage = new Map<string, string>();
  Object.assign(globalThis, {
    indexedDB: new IDBFactory(),
    window: new EventTarget(),
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
  });
  let remote = items(),
    disconnected = false,
    loseAcknowledgement = false;
  const requests: string[] = [],
    receipts = new Map<string, any>();
  const snapshot = () => ({
    downloadedAt: new Date().toISOString(),
    decks: [
      {
        id: "shared",
        name: "Shared",
        description: "",
        created_at: new Date().toISOString(),
      },
    ],
    items: { shared: remote },
    sessions: {},
    recent: { shared: [] },
  });
  t.mock.method(globalThis, "fetch", async (url: any, options: any) => {
    requests.push(String(url));
    if (disconnected) throw Error("Offline test");
    if (url === "/api/snapshot") return Response.json(snapshot());
    if (url === "/api/authoring") {
      const request = parseAuthoring(JSON.parse(options.body));
      if (receipts.has(request.id))
        return Response.json(receipts.get(request.id));
      const conflicts = planAuthoring(request, remote, {
        name: "Shared",
        description: "",
      });
      if (conflicts.length)
        return Response.json({ applied: false, conflicts, items: remote });
      for (const change of request.changes) {
        const result = await importPersonal(remote, {
          deck: "Shared",
          questions: [change.value.question],
        });
        remote = result.items.map((i) => ({
          ...i,
          archived:
            i.question.id === change.id ? change.value.archived : !!i.archived,
        }));
      }
      const result = { applied: true, conflicts: [], items: remote };
      receipts.set(request.id, structuredClone(result));
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw Error("Connection lost after commit");
      }
      return Response.json(result);
    }
    if (url === "/api/sync")
      return Response.json({
        session: JSON.parse(options.body),
        rejected: [],
        progress: {},
      });
    throw Error("Unexpected request " + url);
  });
  let cache = await import(
    new URL("../src/web/cache.ts?authoring1", import.meta.url).href
  );
  await cache.api("/decks");
  disconnected = true;
  const root: Item = await cache.api("/decks/shared/questions/root");
  await cache.api(
    "/decks/shared/questions/root",
    {
      question: { ...root.question, hint: "Local hint" },
      revision: root.revision,
    },
    "PUT",
  );
  await cache.api("/decks/shared/organize", {
    moves: [{ id: "other", topic: "Moved" }],
    apply: true,
  });
  const corrected = {
    ...root.question,
    question: "Explain a FIFO queue",
    hint: "Local hint",
  };
  await cache.api(
    "/decks/shared/questions/root",
    { question: corrected, revision: 1 },
    "PUT",
  );
  await cache.api("/import", {
    deck: "Shared",
    questions: [
      { id: "fresh", question: "New unpublished objective", answer: "new" },
    ],
  });
  assert.deepEqual(
    requests,
    ["/api/snapshot"],
    "edits and import must not fetch or attempt sync",
  );
  assert.equal(cache.downloadStatus().pendingEdits, 4);
  const local: Item[] = await cache.api("/decks/shared/questions");
  assert.ok(local.find((i) => i.question.id === "root")!.revision < 0);
  assert.ok(local.find((i) => i.question.id === "fresh")!.revision < 0);
  const session: any = await cache.api("/decks/shared/sessions", {
    mode: "test",
    count: 20,
    ignorePrerequisites: true,
  });
  assert.ok(
    session.total === 2 && !["root", "fresh"].includes(session.card.questionId),
    "even explicit Test bypass cannot grade an unpublished revision",
  );
  const backup = await cache.exportPendingEdits();
  assert.equal(parseEditBackup(backup).batches.length, 4);
  await assert.rejects(cache.syncDownloads(), /Offline test/);
  cache = await import(
    new URL("../src/web/cache.ts?authoringRestart", import.meta.url).href
  );
  await cache.api("/decks");
  assert.equal(cache.downloadStatus().pendingEdits, 4);
  disconnected = false;
  remote[0].question.hint = "Remote hint";
  await assert.rejects(cache.syncDownloads(), /conflict/);
  const conflict = cache.downloadStatus().editConflict!;
  const calls = requests.length;
  await cache.resolveEditConflict(conflict.batchId, {
    "question:root": "local",
  });
  assert.equal(
    requests.length,
    calls,
    "choosing a version must not upload implicitly",
  );
  assert.equal((await cache.exportPendingEdits()).history.length, 1);
  loseAcknowledgement = true;
  await assert.rejects(cache.syncDownloads(), /Connection lost after commit/);
  assert.equal(cache.downloadStatus().pendingEdits, 4);
  await cache.refreshDownloads();
  assert.equal(cache.downloadStatus().pendingEdits, 0);
  assert.equal(
    receipts.size,
    4,
    "replaying the committed batch must use its receipt",
  );
  const published: Item = await cache.api("/decks/shared/questions/root");
  assert.equal(
    published.revision,
    2,
    "correction increments the server revision only once",
  );
  assert.equal(published.question.question, corrected.question);
  assert.equal(published.question.hint, "Local hint");
  assert.equal(
    (await cache.api("/decks/shared/questions/other")).question.topic,
    "Moved",
  );
  assert.equal((await cache.api("/decks/shared/questions/fresh")).revision, 1);
  const after: any = await cache.api("/decks/shared/sessions", {
    mode: "test",
    count: 20,
    ignorePrerequisites: true,
  });
  assert.equal(after.total, 4);
  assert.equal(semanticContent(published.question), semanticContent(corrected));
});

test("a stale tab cannot overwrite another tab's persisted edit queue", async (t) => {
  const remote = items();
  Object.assign(globalThis, {
    indexedDB: new IDBFactory(),
    window: new EventTarget(),
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      downloadedAt: "now",
      decks: [{ id: "shared", name: "Shared", description: "" }],
      items: { shared: remote },
      sessions: {},
      recent: {},
    }),
  );
  const a = await import(
      new URL("../src/web/cache.ts?tabA", import.meta.url).href
    ),
    b = await import(new URL("../src/web/cache.ts?tabB", import.meta.url).href);
  await a.api("/decks");
  await b.api("/decks");
  await a.api(
    "/decks/shared/questions/root",
    { question: { ...remote[0].question, hint: "Tab A" }, revision: 1 },
    "PUT",
  );
  await assert.rejects(
    b.api(
      "/decks/shared/questions/root",
      { question: { ...remote[0].question, hint: "Tab B" }, revision: 1 },
      "PUT",
    ),
    /Another Recall tab/,
  );
  assert.equal(
    (await b.api("/decks/shared/questions/root")).question.hint,
    "Tab A",
  );
  assert.equal(b.downloadStatus().pendingEdits, 1);
  assert.equal(
    canonical((await b.exportPendingEdits()).batches),
    canonical((await a.exportPendingEdits()).batches),
  );
});

test("workspace upgrade preserves pending answers and isolates the edit outbox from older app tabs", async (t) => {
  const factory = new IDBFactory();
  Object.assign(globalThis, {
    indexedDB: factory,
    window: new EventTarget(),
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  const oldItems = items(),
    pending = newSession("shared", oldItems, {
      mode: "test",
      count: 1,
      ignorePrerequisites: true,
    });
  const current = oldItems.find(
    (i) => i.question.id === pending.queue[0].questionId,
  )!;
  advanceSession(
    pending,
    current,
    {
      version: pending.version,
      revision: current.revision,
      response: "Private typed answer",
    },
    oldItems,
  );
  const legacy = {
    downloadedAt: "before-upgrade",
    decks: [{ id: "shared", name: "Shared", description: "" }],
    items: { shared: oldItems },
    sessions: { [pending.id]: pending },
    recent: {},
    dirty: { [pending.id]: true },
  };
  async function writeLegacy() {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open("recall-study", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("state");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(legacy, "workspace");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  await writeLegacy();
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("Upgrade must not need a connection");
  });
  const upgraded = await import(
    new URL("../src/web/cache.ts?upgrade-authoring", import.meta.url).href
  );
  assert.equal((await upgraded.api("/decks")).length, 1);
  await upgraded.api(
    "/decks/shared/questions/root",
    {
      question: { ...oldItems[0].question, hint: "New app edit" },
      revision: 1,
    },
    "PUT",
  );
  await writeLegacy(); // A still-open old app cannot understand or retain an authoring outbox.
  const restarted = await import(
    new URL("../src/web/cache.ts?upgrade-authoring-restart", import.meta.url)
      .href
  );
  assert.equal(
    (await restarted.api("/decks/shared/questions/root")).question.hint,
    "New app edit",
  );
  assert.equal(restarted.downloadStatus().pendingEdits, 1);
  assert.equal(
    (await restarted.exportPendingRecovery()).sessions[0].answers[0].response,
    "Private typed answer",
  );
  assert.equal(requests, 0);
});
