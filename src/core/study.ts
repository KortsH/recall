import {
  buildQueue,
  enqueueRetry,
  grade,
  publicCard,
  updateProgress,
} from "./engine.ts";
import { resolveVariant } from "./questions.ts";
import type { Item, Session, Attempt } from "./types.ts";

export interface AnswerInput {
  version: number;
  revision: number;
  response: unknown;
  rating?: string;
}
export function newSession(
  deckId: string,
  items: Item[],
  options: { mode?: string; topic?: string; count?: number; minutes?: number },
  id = crypto.randomUUID(),
): Session {
  const mode = options.mode ?? "learn",
    count = options.count ?? 20,
    minutes = options.minutes ?? 0;
  if (!["learn", "cram", "flashcards", "test"].includes(mode))
    throw new Error("Unknown study mode");
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new Error("Choose 1–200 questions");
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 240)
    throw new Error("Time limit must be 0–240 minutes");
  const queue = buildQueue(
    items.filter(
      (i) =>
        !i.archived && (!options.topic || i.question.topic === options.topic),
    ),
    mode,
    count,
  );
  if (!queue.length)
    throw new Error(
      "Nothing is due in this selection. Try Cram to keep practising.",
    );
  return {
    id,
    deckId,
    mode: mode as Session["mode"],
    topic: options.topic ?? null,
    queue,
    cursor: 0,
    answers: [],
    createdAt: new Date().toISOString(),
    deadline:
      mode === "test" && minutes
        ? new Date(Date.now() + minutes * 60000).toISOString()
        : null,
    finished: false,
    version: 0,
  };
}
export function evaluateAttempt(
  item: Item,
  variantId: string,
  response: unknown,
  rating: string | undefined,
  test: boolean,
  at = new Date().toISOString(),
): Attempt {
  const v = resolveVariant(item.question, variantId);
  let correct = grade(v, response);
  const selfAssessed = correct === null;
  if (selfAssessed && (!test || rating !== undefined)) {
    if (!["again", "hard", "good", "easy"].includes(rating ?? ""))
      throw new Error("Choose Again, Hard, Good or Easy");
    correct = rating !== "again";
  }
  return {
    questionId: item.question.id,
    variantId: v.id,
    format: v.type,
    response,
    correct,
    selfAssessed,
    rating,
    revision: item.revision,
    question: v.question,
    answer: v.answer,
    explanation: v.explanation ?? item.question.explanation,
    rubric: v.rubric ?? item.question.rubric,
    topic: item.question.topic,
    skill: v.skill ?? item.question.skill ?? "recall",
    at,
  };
}
/** Shared session transition; adapters handle durability and optimistic concurrency. */
export function advanceSession(s: Session, item: Item, input: AnswerInput) {
  if (s.finished || s.version !== input.version)
    throw new Error("Session changed. Reload to continue.");
  if (item.archived || item.revision !== input.revision)
    throw new Error("Question changed. Refresh this deck.");
  const entry = s.queue[s.cursor];
  if (!entry || entry.questionId !== item.question.id)
    throw new Error("Question does not match the current card");
  const v = resolveVariant(item.question, entry.variantId);
  const needsSelf = grade(v, input.response) === null;
  if (needsSelf && s.mode !== "test" && s.revealed?.cursor !== s.cursor)
    throw new Error("Reveal the model answer before self-assessing");
  const response =
    needsSelf && s.mode !== "test" ? s.revealed!.response : input.response;
  const attempt = evaluateAttempt(
    item,
    v.id,
    response,
    input.rating,
    s.mode === "test",
  );
  const progress =
    attempt.correct === null
      ? item.progress
      : updateProgress(
          item.progress,
          attempt.correct,
          v.type,
          attempt.selfAssessed,
          new Date(attempt.at),
          input.rating,
          attempt.skill,
        );
  if (
    (s.mode === "learn" || s.mode === "cram") &&
    entry.retry < 3 &&
    (!attempt.correct || !progress.mastered)
  )
    s.queue = enqueueRetry(s.queue, s.cursor, entry, { ...item, progress });
  s.answers.push(attempt);
  s.cursor++;
  delete s.revealed;
  s.finished = s.cursor >= s.queue.length;
  return { attempt, progress };
}
export function sessionView(s: Session, items: Item[]) {
  const current = s.queue[s.cursor];
  const item = current
    ? items.find((i) => !i.archived && i.question.id === current.questionId)
    : null;
  let seed = 2166136261;
  for (const c of `${s.id}:${s.cursor}`)
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const card =
    current && item && !s.finished
      ? publicCard(
          item,
          current,
          () =>
            (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296,
        )
      : null;
  const valid = s.answers.map((a, index) => ({
    ...a,
    index,
    outdated:
      !!a.invalidated ||
      items.find((i) => !i.archived && i.question.id === a.questionId)
        ?.revision !== a.revision,
  }));
  const graded = valid.filter((a) => !a.outdated && a.correct !== null);
  const topics = [...new Set(valid.map((a) => a.topic))].map((topic) => {
    const group = graded.filter((a) => a.topic === topic);
    return {
      topic,
      correct: group.filter((a) => a.correct).length,
      total: group.length,
    };
  });
  return {
    id: s.id,
    deckId: s.deckId,
    mode: s.mode,
    topic: s.topic,
    cursor: s.cursor,
    total: s.queue.length,
    finished: s.finished,
    version: s.version,
    deadline: s.deadline,
    card,
    revealed: s.revealed?.cursor === s.cursor ? s.revealed : undefined,
    result: s.finished
      ? {
          answers: valid,
          correct: graded.filter((a) => a.correct).length,
          graded: graded.length,
          total: s.queue.length,
          pending: valid.filter((a) => a.correct === null && !a.outdated)
            .length,
          unanswered: s.queue.length - s.answers.length,
          topics,
        }
      : null,
  };
}
