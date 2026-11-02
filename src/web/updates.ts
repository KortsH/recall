import { tr } from "./i18n.ts";
export type UpdateState = {
  available: boolean;
  supported: boolean;
  checking: boolean;
  error: string;
  release?: { version: string; url: string; platform: "windows" | "android" };
  installedVersion?: string;
};
let state: UpdateState = {
  available: false,
  supported: false,
  checking: false,
  error: "",
};
let registration: ServiceWorkerRegistration | undefined;
let releaseTarget:
  { version: string; platform: "windows" | "android" } | undefined;
let checking: Promise<void> | undefined;
const listeners = new Set<(state: UpdateState) => void>();
const emit = (next: Partial<UpdateState>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
};
export function subscribeUpdates(listener: (state: UpdateState) => void) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}
/** A new controller is ready, but no tab reloads until its user explicitly chooses. */
export async function startAppUpdates(
  container: ServiceWorkerContainer,
  url: string,
) {
  let controlled = !!container.controller;
  const changed = () => {
    if (controlled) emit({ available: true });
    controlled = true;
  };
  container.addEventListener("controllerchange", changed);
  try {
    registration = await container.register(url, { updateViaCache: "none" });
    emit({ supported: true });
  } catch {
    container.removeEventListener("controllerchange", changed);
  }
}
export async function checkAppUpdates() {
  if (checking) return checking;
  if (!registration && !releaseTarget) return;
  emit({ checking: true, error: "" });
  checking = (async () => {
    const results = await Promise.allSettled([
      registration?.update(),
      releaseTarget && checkRelease(releaseTarget),
    ]);
    if (results.some((result) => result.status === "rejected"))
      emit({
        error: tr("updates.could_not_check_for_an_app_update_your_current"),
      });
  })().finally(() => {
    checking = undefined;
    emit({ checking: false });
  });
  return checking;
}

const versionParts = (version: string) =>
  /^v?(\d{1,8})\.(\d{1,8})\.(\d{1,8})(?:-([0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*))?$/.exec(
    version,
  );
export function compareVersions(left: string, right: string): number {
  const a = versionParts(left),
    b = versionParts(right);
  if (!a || !b) return 0;
  for (let n = 1; n <= 3; n++) {
    const difference = Number(a[n]) - Number(b[n]);
    if (difference) return difference;
  }
  if (!a[4] || !b[4]) return a[4] ? -1 : b[4] ? 1 : 0;
  const x = a[4].split("."),
    y = b[4].split(".");
  for (let n = 0; n < Math.max(x.length, y.length); n++) {
    if (x[n] === undefined) return -1;
    if (y[n] === undefined) return 1;
    if (x[n] === y[n]) continue;
    const numericX = /^\d+$/.test(x[n]),
      numericY = /^\d+$/.test(y[n]);
    if (numericX && numericY) return Number(x[n]) - Number(y[n]);
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x[n] < y[n] ? -1 : 1;
  }
  return 0;
}
export function publishedUpdate(
  data: unknown,
  installed: string,
  platform: "windows" | "android",
): UpdateState["release"] {
  if (!Array.isArray(data) || !versionParts(installed)) return;
  const asset =
    platform === "windows" ? "Recall-Setup.exe" : "Recall-Android.apk";
  const releases = data
    .filter(
      (r) =>
        r &&
        r.draft === false &&
        typeof r.tag_name === "string" &&
        versionParts(r.tag_name) &&
        typeof r.published_at === "string" &&
        Number.isFinite(Date.parse(r.published_at)) &&
        (installed.includes("-") ||
          (!r.prerelease && !r.tag_name.includes("-"))) &&
        Array.isArray(r.assets) &&
        [asset, "SHA256SUMS"].every((name) =>
          r.assets.some(
            (a: any) =>
              a?.name === name && a.state === "uploaded" && a.size > 0,
          ),
        ) &&
        compareVersions(r.tag_name, installed) > 0,
    )
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  if (!releases.length) return;
  const version = releases[0].tag_name.replace(/^v/, "");
  // Never navigate to a URL supplied by a remote response.
  return {
    version,
    platform,
    url: `https://github.com/KortsH/recall/releases/tag/${encodeURIComponent(releases[0].tag_name)}`,
  };
}
async function checkRelease(target: NonNullable<typeof releaseTarget>) {
  const response = await fetch(
    "https://kortsh.github.io/recall/releases.json",
    {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-cache",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("Release check unavailable");
  const release = publishedUpdate(
    await response.json(),
    target.version,
    target.platform,
  );
  if (release) emit({ release });
}

/** Lifecycle checks, never interval polling. Focus/visibility bursts share one request. */
export function startUpdateEvents(options: {
  window: Window;
  document: Document;
  version: string;
  platform?: "windows" | "android";
  now?: () => number;
  check?: () => Promise<void>;
}) {
  const clock = options.now ?? Date.now,
    check = options.check ?? checkAppUpdates;
  let last = -Infinity,
    stopped = false;
  const resume = () => {
    if (
      stopped ||
      options.document.visibilityState === "hidden" ||
      options.window.navigator.onLine === false
    )
      return;
    const time = clock();
    if (time - last < 5 * 60 * 1000) return;
    last = time;
    void check().catch(() => {});
  };
  const native = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (
      detail?.platform !== "android" ||
      typeof detail.version !== "string" ||
      !versionParts(detail.version)
    )
      return;
    if (
      releaseTarget?.platform === "android" &&
      releaseTarget.version === detail.version
    )
      return;
    releaseTarget = { platform: "android", version: detail.version };
    emit({ supported: true, installedVersion: detail.version });
    // The native reply can arrive during the initial service-worker check.
    void (checking ?? Promise.resolve()).then(() => {
      last = -Infinity;
      resume();
    });
  };
  const reconnect = () => {
    last = -Infinity;
    resume();
  };
  if (options.platform) {
    releaseTarget = { platform: options.platform, version: options.version };
    emit({ supported: true, installedVersion: options.version });
  }
  options.window.addEventListener("recall-app-info", native);
  options.window.addEventListener("focus", resume);
  options.window.addEventListener("pageshow", resume);
  options.window.addEventListener("recall-app-resume", resume);
  options.window.addEventListener("online", reconnect);
  options.document.addEventListener("visibilitychange", resume);
  options.window.RecallFiles?.postMessage(
    JSON.stringify({ action: "appInfo" }),
  );
  resume();
  return () => {
    stopped = true;
    options.window.removeEventListener("recall-app-info", native);
    for (const event of ["focus", "pageshow", "recall-app-resume"])
      options.window.removeEventListener(event, resume);
    options.window.removeEventListener("online", reconnect);
    options.document.removeEventListener("visibilitychange", resume);
  };
}
