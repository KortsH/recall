import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import type { UpdateState } from "../src/web/updates.ts";
import {
  compareVersions,
  publishedUpdate,
  startUpdateEvents,
} from "../src/web/updates.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UpdateNotice } from "../src/web/update-notice.tsx";
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
const published = (tag: string, changes: Record<string, unknown> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: tag.includes("-"),
  published_at: "2026-11-02T18:00:00Z",
  html_url: "https://untrusted.example/",
  assets: ["Recall-Setup.exe", "Recall-Android.apk", "SHA256SUMS"].map(
    (name) => ({ name, state: "uploaded", size: 100 }),
  ),
  ...changes,
});
test("release notices respect semantic versions, preview channels and complete platform downloads", () => {
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.ok(compareVersions("1.0.0-preview.10", "1.0.0-preview.2") > 0);
  assert.ok(compareVersions("1.0.0", "1.0.0-preview.10") > 0);
  assert.equal(
    publishedUpdate(
      [published("v0.8.0-preview.1")],
      "0.8.0-preview.1",
      "windows",
    ),
    undefined,
  );
  assert.equal(
    publishedUpdate([published("v2.0.0-preview.1")], "1.0.0", "android"),
    undefined,
  );
  assert.equal(
    publishedUpdate(
      [published("v2.0.0", { prerelease: true })],
      "1.0.0",
      "android",
    ),
    undefined,
  );
  assert.equal(
    publishedUpdate(
      [
        published("v3.0.0", { draft: true }),
        published("v2.0.0", { assets: [] }),
      ],
      "1.0.0",
      "windows",
    ),
    undefined,
  );
  assert.equal(
    publishedUpdate(
      [published("v1.0.0/../../bad")],
      "0.8.0-preview.1",
      "windows",
    ),
    undefined,
  );
  const result = publishedUpdate(
    [published("v0.9.0-preview.2"), published("v0.9.0-preview.10")],
    "0.8.0-preview.1",
    "android",
  )!;
  assert.equal(result.version, "0.9.0-preview.10");
  assert.equal(
    result.url,
    "https://github.com/KortsH/recall/releases/tag/v0.9.0-preview.10",
  );
});
test("update detection runs on lifecycle events, coalesces bursts and never checks merely because time passes", async () => {
  const browser = Object.assign(new EventTarget(), {
    navigator: { onLine: true },
  });
  const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let time = 0,
    checks = 0;
  const stop = startUpdateEvents({
    window: browser as unknown as Window,
    document: page as unknown as Document,
    version: "0.8.0-preview.1",
    now: () => time,
    check: async () => {
      checks++;
    },
  });
  assert.equal(checks, 1);
  for (let n = 0; n < 20; n++) {
    browser.dispatchEvent(new Event("focus"));
    page.dispatchEvent(new Event("visibilitychange"));
  }
  assert.equal(checks, 1);
  time += 20 * 60 * 1000;
  await Promise.resolve();
  assert.equal(checks, 1, "Idle time alone cannot trigger a request");
  page.visibilityState = "hidden";
  browser.dispatchEvent(new Event("focus"));
  assert.equal(checks, 1);
  page.visibilityState = "visible";
  page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(checks, 2);
  browser.navigator.onLine = false;
  browser.dispatchEvent(new Event("online"));
  assert.equal(checks, 2);
  browser.navigator.onLine = true;
  browser.dispatchEvent(new Event("online"));
  assert.equal(checks, 3);
  stop();
  time += 20 * 60 * 1000;
  browser.dispatchEvent(new Event("focus"));
  assert.equal(checks, 3);
});
test("bundled app release checks omit credentials and preserve existing notices when offline", async () => {
  const updates = await import(
    new URL("../src/web/updates.ts?release-check", import.meta.url).href
  );
  const oldFetch = globalThis.fetch;
  let fail = false,
    requests = 0;
  globalThis.fetch = async (input, options) => {
    requests++;
    assert.equal(input, "https://kortsh.github.io/recall/releases.json");
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.referrerPolicy, "no-referrer");
    if (fail) throw new Error("Offline");
    return Response.json([published("v0.9.0-preview.1")]);
  };
  const snapshots: UpdateState[] = [];
  const unsubscribe = updates.subscribeUpdates((state: UpdateState) =>
    snapshots.push({ ...state }),
  );
  const browser = Object.assign(new EventTarget(), {
    navigator: { onLine: true },
  });
  const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const stop = updates.startUpdateEvents({
    window: browser as unknown as Window,
    document: page as unknown as Document,
    version: "0.8.0-preview.1",
    platform: "windows",
  });
  try {
    await updates.checkAppUpdates();
    assert.equal(requests, 1, "Concurrent checks share a request");
    assert.equal(snapshots.at(-1)?.release?.version, "0.9.0-preview.1");
    fail = true;
    await updates.checkAppUpdates();
    assert.equal(snapshots.at(-1)?.release?.version, "0.9.0-preview.1");
    assert.match(
      snapshots.at(-1)!.error,
      /current app and learning data are kept/,
    );
  } finally {
    stop();
    unsubscribe();
    globalThis.fetch = oldFetch;
  }
});
test("the release feed publishes only public download metadata and never a CI credential or draft", async () => {
  const folder = await mkdtemp(join(tmpdir(), "recall-release-feed-"));
  const destination = join(folder, "releases.json"),
    oldFetch = globalThis.fetch,
    oldToken = process.env.GITHUB_TOKEN,
    oldArg = process.argv[2];
  process.env.GITHUB_TOKEN = "synthetic-ci-token";
  process.argv[2] = destination;
  globalThis.fetch = async (input, options) => {
    assert.equal(
      input,
      "https://api.github.com/repos/KortsH/recall/releases?per_page=10",
    );
    assert.equal(
      (options?.headers as Record<string, string>).Authorization,
      "Bearer synthetic-ci-token",
    );
    return Response.json([
      published("v1.0.0", {
        body: "release body is not needed",
        private_field: "excluded",
      }),
      published("v2.0.0", { draft: true }),
    ]);
  };
  try {
    await import(
      new URL("../scripts/release-feed.ts?feed-test", import.meta.url).href
    );
    const raw = await readFile(destination, "utf8"),
      feed = JSON.parse(raw);
    assert.equal(feed.length, 1);
    assert.equal(feed[0].tag_name, "v1.0.0");
    assert.deepEqual(Object.keys(feed[0]).sort(), [
      "assets",
      "draft",
      "prerelease",
      "published_at",
      "tag_name",
    ]);
    assert.doesNotMatch(raw, /synthetic-ci-token|private_field|release body/);
    assert.equal(
      publishedUpdate(feed, "0.8.0-preview.1", "windows")?.version,
      "1.0.0",
    );
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = oldToken;
    if (oldArg === undefined) delete process.argv[2];
    else process.argv[2] = oldArg;
  }
});

test("Android reports its installed version independently of a newer server UI, even during a worker check", async () => {
  const updates = await import(
    new URL("../src/web/updates.ts?native-version", import.meta.url).href
  );
  const originalFetch = globalThis.fetch;
  let releaseChecks = 0,
    complete!: () => void;
  const waiting = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const worker = Object.assign(new EventTarget(), {
    controller: {},
    register: async () => ({ update: () => waiting }),
  });
  await updates.startAppUpdates(
    worker as unknown as ServiceWorkerContainer,
    "/sw.js",
  );
  globalThis.fetch = async () => {
    releaseChecks++;
    return Response.json([published("v1.5.0")]);
  };
  const messages: string[] = [];
  const browser = Object.assign(new EventTarget(), {
    navigator: { onLine: true },
    RecallFiles: { postMessage: (message: string) => messages.push(message) },
  });
  const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const states: UpdateState[] = [];
  const unsubscribe = updates.subscribeUpdates((state: UpdateState) =>
    states.push({ ...state }),
  );
  const stop = updates.startUpdateEvents({
    window: browser as unknown as Window,
    document: page as unknown as Document,
    version: "2.0.0",
  });
  try {
    assert.deepEqual(JSON.parse(messages[0]), { action: "appInfo" });
    browser.dispatchEvent(
      Object.assign(new Event("recall-app-info"), {
        detail: { platform: "android", version: "1.0.0" },
      }),
    );
    complete();
    await new Promise(setImmediate);
    assert.equal(states.at(-1)?.installedVersion, "1.0.0");
    assert.equal(states.at(-1)?.release?.version, "1.5.0");
    assert.equal(releaseChecks, 1);
    browser.dispatchEvent(
      Object.assign(new Event("recall-app-info"), {
        detail: { platform: "android", version: "1.0.0" },
      }),
    );
    assert.equal(
      releaseChecks,
      1,
      "Repeated native replies cannot cause a request burst",
    );
  } finally {
    stop();
    unsubscribe();
    globalThis.fetch = originalFetch;
  }
});

test("update banners distinguish reload from installer downloads and keep a quiet reminder after Later", () => {
  const props = {
    state: {
      available: false,
      supported: true,
      checking: false,
      error: "",
      release: {
        version: "0.9.0-preview.1",
        platform: "android" as const,
        url: "https://github.com/KortsH/recall/releases/tag/v0.9.0-preview.1",
      },
    },
    deferred: false,
    busy: false,
    onLater: () => {},
    onShow: () => {},
    onReload: () => {},
    onDownload: () => true,
  };
  const installer = renderToStaticMarkup(
    React.createElement(UpdateNotice, props),
  );
  assert.match(installer, /Recall 0.9.0-preview.1 is available/);
  assert.match(installer, /View download/);
  assert.doesNotMatch(installer, /Save &amp; reload/);
  const reminder = renderToStaticMarkup(
    React.createElement(UpdateNotice, { ...props, deferred: true }),
  );
  assert.match(reminder, /View update/);
  assert.doesNotMatch(reminder, /View download/);
  const web = renderToStaticMarkup(
    React.createElement(UpdateNotice, {
      ...props,
      state: { ...props.state, available: true, release: undefined },
    }),
  );
  assert.match(web, /Save &amp; reload/);
  assert.doesNotMatch(web, /View download/);
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
