import type { DeckSummary } from "../server/store.ts";
import type { Item, Session } from "../core/types.ts";
import { emptyProgress } from "../core/types.ts";
import { newSession, advanceSession, sessionView } from "../core/study.ts";
import { resolveVariant } from "../core/questions.ts";
import { updateProgress } from "../core/engine.ts";
import { auditQuestions } from "../core/audit.ts";

interface Snapshot {
  downloadedAt: string;
  decks: DeckSummary[];
  items: Record<string, Item[]>;
  recent: Record<string, any[]>;
  sessions: Record<string, Session>;
}
interface State extends Snapshot {
  dirty: Record<string, boolean>;
}
let state: State | undefined;
let chain: Promise<unknown> = Promise.resolve();
let lastError = "";
const serial = <T>(fn: () => Promise<T>) => {
  const promise = chain.then(fn);
  chain = promise.catch(() => {});
  return promise;
};
export const downloadedMode = () =>
  localStorage.getItem("recall-storage") !== "live";
export function setDownloadedMode(enabled: boolean) {
  localStorage.setItem("recall-storage", enabled ? "downloaded" : "live");
  window.dispatchEvent(new Event("recall-cache"));
}
export const downloadStatus = () => ({
  enabled: downloadedMode(),
  downloadedAt: state?.downloadedAt,
  pending: state ? Object.keys(state.dirty).length : 0,
  error: lastError,
});
export async function serverApi<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Server request failed");
  return data;
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("recall-study", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(
        new Error(
          "Device storage is unavailable. Select live-server mode in Settings.",
        ),
      );
  });
}
async function persist() {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("state", "readwrite");
      t.objectStore("state").put(state, "workspace");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
  window.dispatchEvent(new Event("recall-cache"));
}
async function load() {
  if (state) return state;
  const db = await database();
  try {
    state = await new Promise<State | undefined>((resolve, reject) => {
      const r = db.transaction("state").objectStore("state").get("workspace");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
  if (!state) {
    const snapshot = await serverApi<Snapshot>("/snapshot");
    state = { ...snapshot, dirty: {} };
    await persist();
  }
  return state;
}
function stats(items: Item[]): DeckSummary["stats"] {
  const total = items.length,
    mastered = items.filter((i) => i.progress.mastered).length,
    unseen = items.filter((i) => !i.progress.attempts).length;
  const topics = [...new Set(items.map((i) => i.question.topic))].map(
    (topic) => {
      const qs = items.filter((i) => i.question.topic === topic),
        attempts = qs.reduce((n, i) => n + i.progress.attempts, 0),
        correct = qs.reduce((n, i) => n + i.progress.correct, 0);
      return {
        topic,
        total: qs.length,
        mastered: qs.filter((i) => i.progress.mastered).length,
        attempts,
        accuracy: attempts ? Math.round((correct / attempts) * 100) : null,
      };
    },
  );
  return {
    total,
    mastered,
    unseen,
    learning: total - mastered - unseen,
    due: items.filter(
      (i) =>
        i.progress.nextReview &&
        Date.parse(i.progress.nextReview) <= Date.now(),
    ).length,
    attempts: items.reduce((n, i) => n + i.progress.attempts, 0),
    topics,
    concepts: auditQuestions(items.map((i) => i.question)).concepts.map(
      (c) => ({
        ...c,
        recallMastered: items.filter(
          (i) =>
            i.question.concept === c.concept &&
            (i.question.skill ?? "recall") === "recall" &&
            i.progress.mastered,
        ).length,
        applicationMastered: items.filter(
          (i) =>
            i.question.concept === c.concept &&
            i.question.skill === "application" &&
            i.progress.mastered,
        ).length,
      }),
    ),
    weak: items
      .filter((i) => i.progress.wrong > 0)
      .sort((a, b) => b.progress.wrong - a.progress.wrong)
      .slice(0, 10)
      .map((i) => ({
        id: i.question.id,
        question: i.question.question,
        topic: i.question.topic,
        wrong: i.progress.wrong,
      })),
  };
}
function decks(s: State) {
  return s.decks.map((d) => ({ ...d, stats: stats(s.items[d.id] ?? []) }));
}
function view(s: State, session: Session) {
  const items = s.items[session.deckId] ?? [];
  if (!session.finished) {
    session.queue = [
      ...session.queue.slice(0, session.cursor),
      ...session.queue
        .slice(session.cursor)
        .filter((e) => items.some((i) => i.question.id === e.questionId)),
    ];
    if (session.cursor >= session.queue.length) session.finished = true;
    if (session.deadline && Date.parse(session.deadline) <= Date.now())
      session.finished = true;
  }
  return sessionView(session, items);
}
async function syncInternal(s: State) {
  for (const id of Object.keys(s.dirty)) {
    const current = s.sessions[id];
    const result = await serverApi<{
      session: Session;
      rejected: string[];
      progress: Record<
        string,
        { revision: number; progress: Item["progress"] }
      >;
    }>("/sync", current);
    s.sessions[id] = result.session;
    delete s.dirty[id];
    // The server merges evidence from all devices. Replay still-pending local evidence below.
    if (
      !Object.keys(s.dirty).some(
        (id) => s.sessions[id].deckId === current.deckId,
      )
    )
      for (const item of s.items[current.deckId] ?? []) {
        const p = result.progress[item.question.id];
        if (p)
          item.progress =
            p.revision === item.revision ? p.progress : emptyProgress();
      }
    if (result.rejected.length)
      lastError =
        "Some questions changed on the server. Refresh downloaded quizzes to update them.";
    await persist();
  }
}
export const syncDownloads = () =>
  serial(async () => {
    try {
      const s = await load();
      await syncInternal(s);
      if (
        !Object.keys(s.dirty).length &&
        !lastError.includes("questions changed")
      )
        lastError = "";
      await persist();
    } catch (e) {
      lastError = `Progress is saved on this device. Sync pending: ${(e as Error).message}`;
      window.dispatchEvent(new Event("recall-cache"));
      throw e;
    }
  });
export const refreshDownloads = () =>
  serial(async () => {
    const s = await load();
    await syncInternal(s);
    const snapshot = await serverApi<Snapshot>("/snapshot");
    state = {
      ...snapshot,
      sessions: { ...snapshot.sessions, ...s.sessions },
      dirty: {},
    };
    lastError = "";
    await persist();
  });
export async function api<T>(
  path: string,
  body?: any,
  method?: string,
): Promise<T> {
  if (!downloadedMode()) return serverApi(path, body, method);
  return serial(async () => {
    const s = await load();
    const url = new URL(path, "http://local");
    const p = url.pathname;
    const verb = method ?? (body ? "POST" : "GET");
    let result: any;
    if (p === "/decks" && verb === "GET") return decks(s) as T;
    const d = p.match(/^\/decks\/([^/]+)(?:\/(.*))?$/);
    if (d) {
      const id = decodeURIComponent(d[1]),
        rest = d[2] ?? "";
      const deck = decks(s).find((d) => d.id === id);
      if (!deck) throw new Error("Deck not downloaded. Refresh quizzes.");
      if (!rest && verb === "GET") return deck as T;
      if (rest === "questions" && verb === "GET")
        return (s.items[id] ?? []) as T;
      if (rest === "export" && verb === "GET")
        return {
          schemaVersion: 1,
          deck: deck.name,
          description: deck.description,
          questions: s.items[id].map((i) => i.question),
        } as T;
      if (rest === "sessions" && verb === "GET")
        return Object.values(s.sessions)
          .filter((x) => x.deckId === id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 10)
          .map((x) => ({
            id: x.id,
            mode: x.mode,
            cursor: x.cursor,
            total: x.queue.length,
            finished: x.finished,
            createdAt: x.createdAt,
          })) as T;
      if (rest === "sessions" && verb === "POST") {
        const session = newSession(id, s.items[id], body);
        s.sessions[session.id] = session;
        s.dirty[session.id] = true;
        await persist();
        return view(s, session) as T;
      }
      const q = rest.match(/^questions\/([^/]+)$/);
      if (q) {
        const item = s.items[id].find(
          (i) => i.question.id === decodeURIComponent(q[1]),
        );
        if (!item) throw new Error("Question not downloaded");
        if (verb === "GET") return structuredClone(item) as T;
        if (verb === "PUT") {
          await syncInternal(s);
          result = await serverApi(path, body, verb);
          const updated = await serverApi<Item>(
            `/decks/${id}/questions/${encodeURIComponent(item.question.id)}`,
          );
          Object.assign(item, updated);
          await persist();
          return result;
        }
      }
    }
    const m = p.match(/^\/sessions\/([^/]+)(?:\/(.*))?$/);
    if (m) {
      const session = s.sessions[m[1]];
      if (!session)
        throw new Error("Session is not downloaded. Refresh quizzes first.");
      const rest = m[2] ?? "";
      const items = s.items[session.deckId] ?? [];
      if (!rest && verb === "GET") {
        result = view(s, session);
        await persist();
        return result;
      }
      if (rest === "reveal") {
        if (session.mode === "test")
          throw new Error("Answers are revealed after the test");
        const entry = session.queue[session.cursor],
          item = items.find((i) => i.question.id === entry.questionId)!;
        if (session.version !== body.version || item.revision !== body.revision)
          throw new Error("Session changed. Reload to continue.");
        const v = resolveVariant(item.question, entry.variantId);
        session.revealed = { cursor: session.cursor, response: body.response };
        session.version++;
        await persist();
        return {
          version: session.version,
          answer: v.answer,
          explanation: v.explanation ?? item.question.explanation,
          rubric: v.rubric ?? item.question.rubric ?? [],
        } as T;
      }
      if (rest === "answer") {
        if (session.deadline && Date.parse(session.deadline) <= Date.now()) {
          session.finished = true;
          session.version++;
          result = { session: view(s, session), feedback: null };
        } else {
          const entry = session.queue[session.cursor],
            item = items.find((i) => i.question.id === entry.questionId);
          if (!item)
            throw new Error("Question was removed. Refresh this session.");
          const { attempt, progress } = advanceSession(session, item, body);
          item.progress = progress;
          session.version++;
          result = {
            session: view(s, session),
            feedback:
              session.mode === "test"
                ? null
                : { ...attempt, rubric: attempt.rubric ?? [] },
          };
        }
      } else if (rest === "finish") {
        if (session.version !== body.version)
          throw new Error("Session changed");
        session.finished = true;
        session.version++;
        result = view(s, session);
      } else if (rest === "rate") {
        const a = session.answers[body.index];
        if (
          !session.finished ||
          session.mode !== "test" ||
          !a ||
          a.correct !== null
        )
          throw new Error("This answer cannot be self-assessed");
        if (!["again", "hard", "good", "easy"].includes(body.rating))
          throw new Error("Unknown rating");
        const item = items.find((i) => i.question.id === a.questionId);
        if (!item || item.revision !== a.revision)
          throw new Error("Question changed");
        a.correct = body.rating !== "again";
        a.rating = body.rating;
        item.progress = updateProgress(
          item.progress,
          a.correct!,
          a.format,
          true,
          new Date(),
          body.rating,
          a.skill,
        );
        session.version++;
        result = view(s, session);
      } else throw new Error("Unsupported downloaded-session action");
      s.dirty[session.id] = true;
      await persist();
      if (session.finished)
        setTimeout(() => void syncDownloads().catch(() => {}), 0);
      return result as T;
    }
    // Bank management is an explicit online action; ordinary studying never enters this path.
    await syncInternal(s);
    result = await serverApi(path, body, method);
    const snapshot = await serverApi<Snapshot>("/snapshot");
    state = {
      ...snapshot,
      sessions: { ...snapshot.sessions, ...s.sessions },
      dirty: {},
    };
    await persist();
    return result as T;
  });
}
