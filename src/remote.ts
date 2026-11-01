import type { Store } from "./server/store.ts";
export type Backend = Pick<
  Store,
  | "decks"
  | "deck"
  | "items"
  | "question"
  | "editQuestion"
  | "exportBank"
  | "importBank"
  | "createSession"
  | "getSession"
  | "recentSessions"
  | "answer"
  | "reveal"
  | "finish"
  | "rateTest"
  | "listQuestions"
  | "audit"
  | "archiveQuestion"
  | "updateDeck"
  | "recoverSession"
  | "resetLearning"
>;
export function remoteBackend(base: string): Backend {
  const root = new URL(base);
  if (!["http:", "https:"].includes(root.protocol))
    throw new Error("Server must be an HTTP(S) URL");
  const call = async (path: string, body?: unknown, method?: string) => {
    const verb = method ?? (body ? "POST" : "GET");
    const r = await fetch(new URL("/api" + path, root), {
      method: verb,
      headers:
        verb !== "GET" ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error ?? `Server returned ${r.status}`);
    return result;
  };
  const enc = encodeURIComponent;
  return {
    resetLearning: (id, input) =>
      call(`/decks/${enc(id)}/reset-learning`, input ?? {}),
    recoverSession: (session) => call("/sync", session),
    decks: () => call("/decks"),
    deck: (id) => call("/decks/" + enc(id)),
    items: (id) => call(`/decks/${enc(id)}/questions`),
    question: (id, q) => call(`/decks/${enc(id)}/questions/${enc(q)}`),
    editQuestion: (id, q, question, revision) =>
      call(
        `/decks/${enc(id)}/questions/${enc(q)}`,
        { question, revision },
        "PUT",
      ),
    exportBank: (id) => call(`/decks/${enc(id)}/export`),
    importBank: (bank, options = {}) =>
      call(
        "/import?" +
          new URLSearchParams({
            replace: options.replace ? "1" : "0",
            dryRun: options.dryRun ? "1" : "0",
            ...(options.topic ? { topic: options.topic } : {}),
          }),
        bank,
      ),
    createSession: (id, options) => call(`/decks/${enc(id)}/sessions`, options),
    getSession: (id) => call(`/sessions/${enc(id)}`),
    recentSessions: (id) => call(`/decks/${enc(id)}/sessions`),
    answer: (id, input) => call(`/sessions/${enc(id)}/answer`, input),
    reveal: (id, input) => call(`/sessions/${enc(id)}/reveal`, input),
    finish: (id, version) => call(`/sessions/${enc(id)}/finish`, { version }),
    rateTest: (id, index, rating) =>
      call(`/sessions/${enc(id)}/rate`, { index, rating }),
    listQuestions: (id, filters = {}) =>
      call(
        `/decks/${enc(id)}/questions?` +
          new URLSearchParams(
            Object.entries(filters)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [
                k,
                typeof v === "boolean" ? (v ? "1" : "0") : v,
              ]),
          ),
      ),
    audit: (id) => call(`/decks/${enc(id)}/audit`),
    archiveQuestion: (id, q, restore) =>
      call(
        `/decks/${enc(id)}/questions/${enc(q)}`,
        undefined,
        restore ? "POST" : "DELETE",
      ),
    updateDeck: (id, input) => call(`/decks/${enc(id)}`, input, "PATCH"),
  };
}
