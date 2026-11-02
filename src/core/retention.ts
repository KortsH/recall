import type { Item, Session } from "./types.ts";
import { learningEntry } from "./engine.ts";
import { prerequisiteStatus } from "./prerequisites.ts";

/** Extra spot checks within Learn; due dates and mastery remain separate. */
export function retentionBudget(size: number, misses = 0) {
  const base = Math.max(1, Math.round(size * (size <= 40 ? 1 / 6 : 0.2)));
  return Math.min(40, Math.ceil(size * 0.35), base + misses * 2);
}
export const retentionGap = (size: number) =>
  Math.max(6, Math.min(16, Math.round(size * 0.1)));
export function insertRetentionCheck(
  s: Session,
  items: Item[],
  rng = Math.random,
) {
  if (s.mode !== "learn" || !s.learning || s.queue.length >= 1800) return;
  const selection = items.filter(
    (i) =>
      !i.archived &&
      !i.question.flag &&
      (!s.topic || i.question.topic === s.topic),
  );
  const gap = retentionGap(selection.length);
  const state = (s.retention ??= {
    version: 1,
    used: 0,
    misses: 0,
    nextAt: Math.max(8, gap),
    seen: [],
  });
  if (
    s.cursor < state.nextAt ||
    state.used >= retentionBudget(selection.length, state.misses)
  )
    return;
  const pending = new Set(s.queue.slice(s.cursor).map((e) => e.questionId));
  if (pending.size >= 16) return;
  const recent = new Set(s.answers.slice(-gap).map((a) => a.questionId));
  const concepts = new Set(
    s.answers
      .slice(-2)
      .map(
        (a) =>
          items.find((i) => i.question.id === a.questionId)?.question.concept,
      ),
  );
  const unlocked = new Set(
    prerequisiteStatus(items)
      .filter((p) => p.unlocked)
      .map((p) => p.id),
  );
  const pool = selection.filter(
    (i) =>
      i.progress.mastered &&
      !s.learning!.ids.includes(i.question.id) &&
      !pending.has(i.question.id) &&
      !recent.has(i.question.id) &&
      !concepts.has(i.question.concept) &&
      !state.seen.includes(i.question.id) &&
      unlocked.has(i.question.id),
  );
  if (!pool.length) return;
  const item = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const entry = { ...learningEntry(item, items), retentionCheck: true };
  if (entry.format !== "written" && entry.format !== "flashcard") {
    entry.variantId = "written";
    entry.format = "written";
  }
  s.queue.splice(Math.min(s.queue.length, s.cursor + 1), 0, entry);
  state.used++;
  state.seen.push(item.question.id);
  state.nextAt = s.cursor + (state.misses ? 4 : 8) + Math.floor(rng() * 4);
  s.finished = false;
}
