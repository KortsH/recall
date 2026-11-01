import { variants, resolveVariant } from "./questions.ts";
import { prerequisiteStatus } from "./prerequisites.ts";
import type {
  Item,
  Progress,
  QueueEntry,
  Variant,
  PublicCard,
} from "./types.ts";

export const normalise = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,!?\u0022\u0027“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function grade(v: Variant, response: unknown): boolean | null {
  if (v.type === "flashcard") return null;
  if (v.type === "matching") {
    if (!response || typeof response !== "object" || Array.isArray(response))
      return false;
    const pairs = v.pairs ?? [];
    const r = response as Record<string, string>;
    return (
      Object.keys(r).length === pairs.length &&
      pairs.every((p) => r[p.left] === p.right)
    );
  }
  if (v.type === "multiple_choice" || v.type === "multiple_select") {
    const got = Array.isArray(response)
      ? response
      : typeof response === "string"
        ? [response]
        : [];
    const expected = v.correct ?? [v.answer];
    return (
      new Set(got).size === got.length &&
      got.length === expected.length &&
      expected.every((x) => got.includes(x))
    );
  }
  if (typeof response !== "string") return false;
  if (v.requiredParts) {
    const parts = response
      .split(/[;\n]+/)
      .map(normalise)
      .filter(Boolean);
    // Deliberately require distinct, complete parts; negation or extra claims must not slip through.
    if (parts.length !== v.requiredParts.length) return false;
    const used = new Set<number>();
    return v.requiredParts.every((aliases) => {
      const i = parts.findIndex(
        (p, i) => !used.has(i) && aliases.some((a) => normalise(a) === p),
      );
      if (i < 0) return false;
      used.add(i);
      return true;
    });
  }
  if (v.acceptedAnswers)
    return v.acceptedAnswers.some((a) => normalise(a) === normalise(response));
  return null;
}
export function updateProgress(
  p: Progress,
  correct: boolean,
  format: string,
  selfAssessed: boolean,
  now = new Date(),
  rating?: string,
  skill: "recall" | "application" = "recall",
): Progress {
  const active = format === "written" || format === "flashcard";
  const streak = correct ? p.streak + 1 : 0;
  const recalls = correct ? p.recalls + (active ? 1 : 0) : 0;
  const mastered = correct && streak >= 3 && recalls >= 2;
  const interval = correct
    ? rating === "hard"
      ? 10
      : mastered
        ? rating === "easy"
          ? 3 * 24 * 60
          : 24 * 60
        : active
          ? 60
          : 10
    : 2;
  return {
    skills: {
      ...p.skills,
      [skill]: {
        attempts: (p.skills?.[skill]?.attempts ?? 0) + 1,
        correct: (p.skills?.[skill]?.correct ?? 0) + Number(correct),
      },
    },
    attempts: p.attempts + 1,
    correct: p.correct + Number(correct),
    wrong: p.wrong + Number(!correct),
    streak,
    recalls,
    recognition: p.recognition + Number(correct && !active),
    selfAssessed: p.selfAssessed + Number(selfAssessed),
    mastered,
    lastReviewed: now.toISOString(),
    nextReview: new Date(now.getTime() + interval * 60000).toISOString(),
  };
}
export function chooseVariant(item: Item, mode: string, offset = 0): Variant {
  const all = variants(item.question);
  if (mode === "flashcards") {
    const cards = all.filter((v) => v.type === "flashcard");
    return cards[item.progress.attempts % cards.length];
  }
  const candidates = all.filter((v) => v.type !== "flashcard");
  if (mode === "test") return candidates[offset % candidates.length];
  if (item.progress.streak === 0 && offset === 0)
    return (
      candidates.find(
        (v) => v.type === "multiple_choice" || v.type === "multiple_select",
      ) ?? candidates[0]
    );
  const recalls = candidates.filter(
    (v) => v.type !== "multiple_choice" && v.type !== "multiple_select",
  );
  return recalls[item.progress.attempts % recalls.length] ?? candidates[0];
}
export function buildQueue(
  items: Item[],
  mode: string,
  count: number,
  now = Date.now(),
  rng = Math.random,
  context = items,
  ignorePrerequisites = false,
): QueueEntry[] {
  const unlocked = new Set(
    prerequisiteStatus(context)
      .filter((s) => s.unlocked)
      .map((s) => s.id),
  );
  const eligible = items.filter(
    (i) =>
      !i.archived &&
      ((ignorePrerequisites && ["test", "cram"].includes(mode)) ||
        unlocked.has(i.question.id)) &&
      (mode !== "learn" ||
        !i.progress.mastered ||
        !i.progress.nextReview ||
        Date.parse(i.progress.nextReview) <= now),
  );
  const score = (i: Item) =>
    !i.progress.attempts
      ? 200
      : (!i.progress.mastered ? 100 : 0) +
        Math.min(50, i.progress.wrong * 5) +
        (i.progress.nextReview && Date.parse(i.progress.nextReview) <= now
          ? 30
          : 0);
  const ranked = eligible
    .map((i) => ({ i, tie: rng() }))
    .sort((a, b) =>
      mode === "test"
        ? a.tie - b.tie
        : score(b.i) - score(a.i) || a.tie - b.tie,
    )
    .map((x) => x.i);
  // Round-robin across topics, with weaker objectives first within each topic.
  const groups = new Map<string, Item[]>();
  for (const i of ranked)
    groups.set(i.question.topic, [...(groups.get(i.question.topic) ?? []), i]);
  const mixed: Item[] = [];
  if (mode === "test") mixed.push(...ranked);
  else
    while ([...groups.values()].some((g) => g.length))
      for (const group of groups.values()) {
        const i = group.shift();
        if (i) mixed.push(i);
      }
  // Separate related concepts without discarding useful recall/application pairs.
  if (mode !== "test")
    for (let n = 1; n < mixed.length; n++) {
      const recent = new Set(
        mixed.slice(Math.max(0, n - 2), n).map((i) => i.question.concept),
      );
      if (recent.has(mixed[n].question.concept)) {
        const at = mixed.findIndex(
          (i, j) => j > n && !recent.has(i.question.concept),
        );
        if (at >= 0) [mixed[n], mixed[at]] = [mixed[at], mixed[n]];
      }
    }
  return mixed.slice(0, count).map((i, n) => {
    const v = chooseVariant(i, mode, mode === "test" ? n : 0);
    return {
      questionId: i.question.id,
      concept: i.question.concept,
      variantId: v.id,
      format: v.type,
      retry: 0,
    };
  });
}
export function enqueueRetry(
  queue: QueueEntry[],
  cursor: number,
  entry: QueueEntry,
  item: Item,
): QueueEntry[] {
  const out = [...queue];
  const v = chooseVariant(item, "learn", entry.retry + 1);
  const concept = entry.concept ?? item.question.concept;
  const group = (e: QueueEntry | undefined) =>
    e ? (e.concept ?? e.questionId) : undefined;
  if (out.length === cursor + 1) {
    const other =
      out.find(
        (e) => group(e) !== concept && e.questionId !== entry.questionId,
      ) ?? out.find((e) => e.questionId !== entry.questionId);
    // A single-objective deck ends rather than immediately revealing the same question again.
    if (!other) return out;
    out.push({ ...other, retry: 3 });
  }
  // At least two intervening cards whenever available. A tiny deck may have fewer.
  let at = Math.min(out.length, cursor + 3);
  for (let candidate = at; candidate <= out.length; candidate++)
    if (
      group(out[candidate - 1]) !== concept &&
      group(out[candidate]) !== concept
    ) {
      at = candidate;
      break;
    }
  out.splice(at, 0, {
    questionId: entry.questionId,
    concept,
    variantId: v.id,
    format: v.type,
    retry: entry.retry + 1,
  });
  return out;
}
export function publicCard(
  item: Item,
  entry: QueueEntry,
  rng = Math.random,
): PublicCard {
  const v = resolveVariant(item.question, entry.variantId);
  const shuffle = <T>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return {
    questionId: item.question.id,
    variantId: v.id,
    revision: item.revision,
    format: v.type,
    topic: item.question.topic,
    concept: item.question.concept,
    question: v.question,
    options: v.options ? shuffle(v.options) : undefined,
    left: v.pairs?.map((p) => p.left),
    right: v.pairs ? shuffle(v.pairs.map((p) => p.right)) : undefined,
    selfGrade:
      v.type === "flashcard" ||
      (v.type === "written" && !v.acceptedAnswers && !v.requiredParts),
  };
}
