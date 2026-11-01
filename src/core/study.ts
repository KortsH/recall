import {
  buildQueue,
  enqueueRetry,
  grade,
  publicCard,
  updateProgress,
  learningEntry,
} from "./engine.ts";
import { resolveVariant } from "./questions.ts";
import { prerequisiteStatus } from "./prerequisites.ts";
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
  options: {
    mode?: string;
    topic?: string;
    count?: number;
    minutes?: number;
    ignorePrerequisites?: boolean;
  },
  id = crypto.randomUUID(),
): Session {
  const mode = options.mode ?? "learn",
    count = options.count ?? (mode === "learn" ? 12 : 20),
    minutes = options.minutes ?? 0;
  if (!["learn", "cram", "flashcards", "test"].includes(mode))
    throw new Error("Unknown study mode");
  if (
    options.ignorePrerequisites !== undefined &&
    typeof options.ignorePrerequisites !== "boolean"
  )
    throw new Error("ignorePrerequisites must be a boolean");
  if (options.ignorePrerequisites && !["cram", "test"].includes(mode))
    throw new Error("Prerequisite override is available only in Cram or Test");
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
    mode === "learn" ? Math.min(count, 16) : count,
    Date.now(),
    Math.random,
    items,
    !!options.ignorePrerequisites,
  );
  if (!queue.length)
    throw new Error(
      prerequisiteStatus(items).some((s) => !s.unlocked)
        ? "No unlocked questions are due in this selection. Master the prerequisites first; see the question library for the required IDs. Try another topic or Cram to practise foundations."
        : "Nothing is due in this selection. Try Cram to keep practising.",
    );
  return {
    id,
    deckId,
    mode: mode as Session["mode"],
    targetCount:
      mode === "learn"
        ? items.filter(
            (i) =>
              !i.archived &&
              (!options.topic || i.question.topic === options.topic),
          ).length
        : count,
    learning:
      mode === "learn"
        ? {
            version: 1,
            size: Math.min(count, 16),
            round: 1,
            ids: queue.map((e) => e.questionId),
          }
        : undefined,
    ignorePrerequisites: !!options.ignorePrerequisites,
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
/** Keep the same small cohort until it is learned. Introduce the next cohort only at a boundary. */
function nextLearningSet(s: Session, items: Item[]) {
  if (!s.learning || s.cursor < s.queue.length) return;
  const answered = new Set(s.answers.map((a) => a.questionId));
  const candidates = items.filter(
    (i) =>
      (!s.topic || i.question.topic === s.topic) &&
      !(i.progress.mastered && answered.has(i.question.id)),
  );
  const queue = buildQueue(
    candidates,
    "learn",
    s.learning.size,
    Date.now(),
    Math.random,
    items,
  );
  if (queue.length) {
    s.learning.round++;
    s.learning.ids = queue.map((e) => e.questionId);
    s.queue.push(...queue);
  }
  s.finished = s.cursor >= s.queue.length;
}
/** Upgrade only unanswered legacy Learn cards; saved evidence and learner progress stay intact. */
export function prepareSession(s: Session, items: Item[]) {
  if (s.finished) return;
  if (s.mode === "learn" && !s.learning) {
    const size = Math.min(s.targetCount ?? 12, 16);
    const queue = buildQueue(
      items.filter((i) => !s.topic || i.question.topic === s.topic),
      "learn",
      size,
      Date.now(),
      Math.random,
      items,
    );
    s.queue = [...s.queue.slice(0, s.cursor), ...queue];
    s.learning = {
      version: 1,
      size,
      round: 1,
      ids: queue.map((e) => e.questionId),
    };
    delete s.revealed;
  }
  pruneLocked(s, items);
  if (s.mode === "learn") {
    nextLearningSet(s, items);
    const current = s.queue[s.cursor];
    const item =
      current && items.find((i) => i.question.id === current.questionId);
    if (item && !s.finished) {
      const expected = learningEntry(item, items, current.retry);
      if (expected.variantId !== current.variantId) {
        s.queue[s.cursor] = expected;
        delete s.revealed;
      }
    }
  }
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
export function advanceSession(
  s: Session,
  item: Item,
  input: AnswerInput,
  context?: Item[],
) {
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
  if (s.mode === "learn" && s.learning && !progress.mastered) {
    s.queue.push(
      learningEntry({ ...item, progress }, context ?? [item], entry.retry + 1),
    );
  } else if (
    s.mode === "cram" &&
    entry.retry < 3 &&
    (!attempt.correct || !progress.mastered)
  )
    s.queue = enqueueRetry(s.queue, s.cursor, entry, { ...item, progress });
  s.answers.push(attempt);
  s.cursor++;
  delete s.revealed;
  if (context) {
    const updated = context.map((i) =>
      i.question.id === item.question.id ? { ...i, progress } : i,
    );
    pruneLocked(s, updated);
    if (s.mode === "learn" && s.learning) nextLearningSet(s, updated);
    if (s.mode === "cram" && s.targetCount) {
      const seen = new Set(s.queue.map((e) => e.questionId));
      const remaining = updated.filter(
        (i) =>
          !seen.has(i.question.id) &&
          (!s.topic || i.question.topic === s.topic),
      );
      s.queue.push(
        ...buildQueue(
          remaining,
          s.mode,
          Math.max(0, s.targetCount - seen.size),
          Date.now(),
          Math.random,
          updated,
          !!s.ignorePrerequisites,
        ),
      );
    }
  }
  if (!context && s.mode === "learn" && s.learning)
    nextLearningSet(s, [{ ...item, progress }]);
  s.finished = s.cursor >= s.queue.length;
  return { attempt, progress };
}
export function pruneLocked(s: Session, items: Item[]) {
  if (s.finished) return;
  const override = s.ignorePrerequisites && ["cram", "test"].includes(s.mode);
  const active = new Set(
    items.filter((i) => !i.archived).map((i) => i.question.id),
  );
  const unlocked = new Set(
    prerequisiteStatus(items)
      .filter(
        (status) => active.has(status.id) && (override || status.unlocked),
      )
      .map((s) => s.id),
  );
  const queue = [
    ...s.queue.slice(0, s.cursor),
    ...s.queue.slice(s.cursor).filter((e) => unlocked.has(e.questionId)),
  ];
  if (queue.length !== s.queue.length) {
    s.queue = queue;
    delete s.revealed;
  }
  s.finished = s.cursor >= s.queue.length;
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
      !!s.learningReset ||
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
    ignorePrerequisites: !!s.ignorePrerequisites,
    topic: s.topic,
    cursor: s.cursor,
    total: s.queue.length,
    finished: s.finished,
    version: s.version,
    deadline: s.deadline,
    card,
    learning: s.learning
      ? {
          round: s.learning.round,
          size: s.learning.size,
          total: s.learning.ids.length,
          mastered: s.learning.ids.filter(
            (id) => items.find((i) => i.question.id === id)?.progress.mastered,
          ).length,
          deckMastered: items.filter(
            (i) =>
              !i.archived &&
              (!s.topic || i.question.topic === s.topic) &&
              i.progress.mastered,
          ).length,
          deckTotal: items.filter(
            (i) => !i.archived && (!s.topic || i.question.topic === s.topic),
          ).length,
        }
      : undefined,
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
