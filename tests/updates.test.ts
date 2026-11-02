import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import type { UpdateState } from "../src/web/updates.ts";
import {
  saveAnswerDraft,
  readAnswerDraft,
  clearAnswerDraft,
  type DraftCard,
} from "../src/web/drafts.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  } as Storage;
}
const session: DraftCard = {
  id: "session",
  deckId: "deck",
  cursor: 2,
  version: 4,
  card: { questionId: "q", revision: 3 },
};
test("asset-only changes produce a new app build without the generated worker hashing itself", async () => {
  const folder = await mkdtemp(join(tmpdir(), "recall-pwa-"));
  await writeFile(join(folder, "index.html"), "<html>Recall</html>");
  await writeFile(join(folder, "logo.svg"), "first icon");
  const generate = () =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/pwa.ts", folder],
      { windowsHide: true },
    );
  generate();
  const initial = await readFile(join(folder, "sw.js"), "utf8");
  generate();
  assert.equal(await readFile(join(folder, "sw.js"), "utf8"), initial);
  await writeFile(join(folder, "logo.svg"), "updated icon");
  generate();
  assert.notEqual(await readFile(join(folder, "sw.js"), "utf8"), initial);
});
test("update/navigation drafts preserve typed, selected and matched answers without crossing workspaces or revisions", () => {
  const s = storage(),
    value = {
      response: "An unfinished explanation",
      selected: ["B", "C"],
      pairs: { read: "up" },
      reveal: {
        version: 4,
        answer: "Model",
        explanation: "Why",
        rubric: ["Point"],
      },
    };
  saveAnswerDraft(false, session, value, s);
  assert.deepEqual(
    readAnswerDraft(false, session, s)?.response,
    value.response,
  );
  assert.deepEqual(readAnswerDraft(false, session, s)?.selected, ["B", "C"]);
  assert.deepEqual(readAnswerDraft(false, session, s)?.pairs, { read: "up" });
  assert.equal(readAnswerDraft(true, session, s), null);
  for (const changed of [
    { ...session, id: "other" },
    { ...session, cursor: 3 },
    { ...session, deckId: "other" },
    { ...session, card: { questionId: "q", revision: 4 } },
    { ...session, card: null },
  ])
    assert.equal(readAnswerDraft(false, changed, s), null);
  assert.equal(
    readAnswerDraft(false, { ...session, version: 5 }, s)?.reveal,
    undefined,
    "A stale reveal must not authorize a self-rating",
  );
  clearAnswerDraft(false, { ...session, cursor: 3 }, s);
  assert.ok(readAnswerDraft(false, session, s));
  clearAnswerDraft(false, session, s);
  assert.equal(readAnswerDraft(false, session, s), null);
  assert.throws(
    () =>
      saveAnswerDraft(false, session, value, {
        ...s,
        setItem: () => {
          throw new Error("Storage full");
        },
      }),
    /Storage full/,
    "A reload must stop if the current draft could not be saved",
  );
});
test("app updates signal readiness without reloading; an unavailable network preserves the current app", async () => {
  const updates = await import(
    new URL("../src/web/updates.ts?test", import.meta.url).href
  );
  const events = new EventTarget() as EventTarget & {
    controller: object | null;
    register: (url: string, options: unknown) => Promise<unknown>;
  };
  events.controller = {};
  let fail = false,
    checks = 0;
  const notices: any[] = [];
  events.register = async () => ({
    update: async () => {
      checks++;
      if (fail) throw new Error("Offline");
    },
  });
  const stop = updates.subscribeUpdates((s: UpdateState) =>
    notices.push({ ...s }),
  );
  await updates.startAppUpdates(
    events as unknown as ServiceWorkerContainer,
    "/sw.js",
  );
  assert.equal(notices.at(-1).supported, true);
  assert.equal(notices.at(-1).available, false);
  events.dispatchEvent(new Event("controllerchange"));
  assert.equal(notices.at(-1).available, true);
  await updates.checkAppUpdates();
  assert.equal(checks, 1);
  fail = true;
  await updates.checkAppUpdates();
  assert.match(notices.at(-1).error, /current app and learning data are kept/);
  assert.equal(notices.at(-1).available, true);
  stop();
  const fresh = await import(
    new URL("../src/web/updates.ts?first-install", import.meta.url).href
  );
  const first = new EventTarget() as any;
  first.controller = null;
  first.register = events.register;
  const initial: any[] = [];
  const end = fresh.subscribeUpdates((s: UpdateState) =>
    initial.push({ ...s }),
  );
  await fresh.startAppUpdates(first, "/sw.js");
  first.dispatchEvent(new Event("controllerchange"));
  assert.equal(
    initial.at(-1).available,
    false,
    "First installation is not an update notice",
  );
  end();
});
test("service worker serves the current shell and preserves older assets while study tabs are open", async () => {
  const code = (await readFile("public/sw.js", "utf8")).replace(
    "__BUILD__",
    "new",
  );
  const callbacks = new Map<string, (e: any) => void>(),
    current = new Map<string, Response>([["/", new Response("NEW")]]),
    old = new Map<string, Response>([
      ["/", new Response("OLD")],
      ["https://recall.example/assets/old.js", new Response("old chunk")],
    ]);
  const cache = (map: Map<string, Response>) => ({
    match: async (r: any) =>
      map.get(typeof r === "string" ? r : r.url)?.clone(),
    put: async (r: any, response: Response) => {
      map.set(typeof r === "string" ? r : r.url, response);
    },
    addAll: async () => {},
  });
  let removed = 0,
    claimed = 0;
  const globals = {
    URL,
    Response,
    fetch: async () => new Response("network"),
    caches: {
      open: async () => cache(current),
      match: async (r: any) => cache(old).match(r),
      keys: async () => ["recall-shell-old", "recall-shell-new"],
      delete: async () => {
        removed++;
      },
    },
    self: {
      registration: { scope: "https://recall.example/" },
      location: { origin: "https://recall.example" },
      clients: {
        matchAll: async () => [{}],
        claim: async () => {
          claimed++;
        },
      },
      skipWaiting: async () => {},
      addEventListener: (name: string, fn: any) => callbacks.set(name, fn),
    },
  };
  vm.runInNewContext(code, globals);
  const request = async (url: string, mode: string) => {
    let promise: Promise<Response> | undefined;
    callbacks.get("fetch")!({
      request: { url, method: "GET", mode },
      respondWith: (p: Promise<Response>) => {
        promise = p;
      },
    });
    return promise;
  };
  assert.equal(
    await (await request("https://recall.example/", "navigate"))!.text(),
    "NEW",
  );
  assert.equal(
    await (await request(
      "https://recall.example/assets/old.js",
      "cors",
    ))!.text(),
    "old chunk",
  );
  assert.equal(
    await request("https://recall.example/api/snapshot", "cors"),
    undefined,
    "Quiz API requests must not be cached",
  );
  let activation: Promise<void> | undefined;
  callbacks.get("activate")!({
    waitUntil: (p: Promise<void>) => {
      activation = p;
    },
  });
  await activation;
  assert.equal(removed, 0);
  assert.equal(claimed, 1);
});
