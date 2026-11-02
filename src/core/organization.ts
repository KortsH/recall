import type { Item } from "./types.ts";
import { prerequisiteStatus } from "./prerequisites.ts";

export interface QuestionFilters {
  topic?: string;
  concept?: string;
  skill?: string;
  search?: string;
  archived?: boolean;
  status?: string;
  difficulty?: string;
  hints?: string;
  sort?: string;
  flagged?: string;
}
export function filterQuestions(items: Item[], f: QuestionFilters = {}) {
  if (f.flagged && !["all", "with", "without"].includes(f.flagged))
    throw new Error("Flag filter must be with or without");
  if (
    f.status &&
    !["all", "unseen", "learning", "mastered", "locked", "available"].includes(
      f.status,
    )
  )
    throw new Error("Unknown learning status");
  if (f.difficulty && !/^[1-5]$/.test(f.difficulty))
    throw new Error("Difficulty must be 1–5");
  if (f.hints && !["all", "with", "without"].includes(f.hints))
    throw new Error("Hints filter must be with or without");
  if (f.sort && !["original", "prompt", "id", "difficulty"].includes(f.sort))
    throw new Error("Unknown question sort");
  const states = new Map(
    prerequisiteStatus(items).map((s) => [s.id, s.unlocked]),
  );
  return items
    .filter((i) => {
      const p = i.progress,
        q = i.question,
        unlocked = states.get(q.id);
      return (
        (f.archived || !i.archived) &&
        (!f.topic || q.topic === f.topic) &&
        (!f.flagged ||
          f.flagged === "all" ||
          (f.flagged === "with") === !!q.flag) &&
        (!f.concept || q.concept === f.concept) &&
        (!f.skill || q.skill === f.skill) &&
        (!f.search ||
          `${q.question} ${q.answer} ${q.concept} ${q.topic} ${q.id} ${q.tags.join(" ")} ${q.flag?.note ?? ""}`
            .toLowerCase()
            .includes(f.search.toLowerCase())) &&
        (!f.difficulty || q.difficulty === Number(f.difficulty)) &&
        (!f.hints ||
          f.hints === "all" ||
          (f.hints === "with") ===
            !!(q.hint || q.variants.some((v) => v.hint))) &&
        (!f.status ||
          f.status === "all" ||
          (f.status === "locked"
            ? !unlocked && !q.flag
            : f.status === "available"
              ? unlocked && !q.flag
              : f.status === "mastered"
                ? p.mastered
                : f.status === "unseen"
                  ? !p.attempts
                  : p.attempts > 0 && !p.mastered))
      );
    })
    .sort((a, b) =>
      f.sort === "prompt"
        ? a.question.question.localeCompare(b.question.question)
        : f.sort === "id"
          ? a.question.id.localeCompare(b.question.id)
          : f.sort === "difficulty"
            ? a.question.difficulty - b.question.difficulty
            : 0,
    );
}

export const UNASSIGNED_TOPIC = "General";
export const isUnassigned = (topic: string) => topic === UNASSIGNED_TOPIC;
export interface TopicMove {
  id: string;
  topic: string;
  fromTopic?: string;
}
export interface OrganizationInput {
  moves: TopicMove[];
  apply?: boolean;
}

/** Plan every move before any mutation. Topic changes never alter question semantics. */
export function planOrganization(items: Item[], input: OrganizationInput) {
  if (
    !input ||
    !Array.isArray(input.moves) ||
    !input.moves.length ||
    input.moves.length > 10000 ||
    (input.apply !== undefined && typeof input.apply !== "boolean")
  )
    throw new Error(
      "Supply 1–10000 question moves and an optional boolean apply",
    );
  const seen = new Set<string>();
  const byId = new Map(
    items.filter((i) => !i.archived).map((i) => [i.question.id, i]),
  );
  const changes = input.moves.flatMap((move) => {
    if (
      !move ||
      typeof move.id !== "string" ||
      typeof move.topic !== "string" ||
      !move.topic.trim() ||
      move.topic.trim().length > 100 ||
      seen.has(move.id)
    )
      throw new Error(
        "Moves need unique question IDs and topic names of 1–100 characters",
      );
    seen.add(move.id);
    const item = byId.get(move.id);
    if (!item) throw new Error(`Question not found or archived: ${move.id}`);
    if (move.fromTopic !== undefined && move.fromTopic !== item.question.topic)
      throw new Error(
        `Topic changed for ${move.id}. Reload before moving questions.`,
      );
    return item.question.topic === move.topic.trim()
      ? []
      : [
          {
            id: move.id,
            fromTopic: item.question.topic,
            topic: move.topic.trim(),
          },
        ];
  });
  return {
    dryRun: input.apply !== true,
    selected: input.moves.length,
    moved: changes.length,
    changes,
  };
}
