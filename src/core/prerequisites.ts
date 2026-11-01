import type { Item, Question } from "./types.ts";

/** Validate the complete, prospective active deck before changing it. */
export function validatePrerequisites(
  questions: Question[],
  allowMissing = false,
) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const complete = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string, path: string[]) {
    if (visiting.has(id))
      throw new Error(`Prerequisite cycle: ${[...path, id].join(" → ")}`);
    if (complete.has(id)) return;
    visiting.add(id);
    const q = byId.get(id)!;
    const parents = q.depends_on ?? [];
    if (new Set(parents).size !== parents.length)
      throw new Error(`${id}: duplicate prerequisites`);
    for (const parent of parents) {
      if (!byId.has(parent)) {
        if (!allowMissing)
          throw new Error(
            `${id}: prerequisite ${parent} is missing or archived`,
          );
      } else visit(parent, [...path, id]);
    }
    visiting.delete(id);
    complete.add(id);
  }
  for (const id of byId.keys()) visit(id, []);
}

/** Fail closed for stale downloads, missing parents or invalid graphs. */
export function prerequisiteStatus(items: Item[]) {
  const byId = new Map(
    items.filter((i) => !i.archived).map((i) => [i.question.id, i]),
  );
  const memo = new Map<string, boolean>();
  function unlocked(id: string, path = new Set<string>()): boolean {
    if (memo.has(id)) return memo.get(id)!;
    const item = byId.get(id);
    if (!item || path.has(id)) return false;
    const next = new Set(path).add(id);
    const result = (item.question.depends_on ?? []).every(
      (parent) =>
        !!byId.get(parent)?.progress.mastered && unlocked(parent, next),
    );
    memo.set(id, result);
    return result;
  }
  return items.map((i) => ({
    id: i.question.id,
    unlocked: !i.archived && unlocked(i.question.id),
    depends_on: i.question.depends_on ?? [],
    blockedBy: (i.question.depends_on ?? []).filter(
      (id) => !byId.get(id)?.progress.mastered || !unlocked(id),
    ),
  }));
}

export function prospectiveQuestions(
  existing: Item[],
  incoming: Question[],
  options: { replace?: boolean; topic?: string } = {},
) {
  const ids = new Set(incoming.map((q) => q.id));
  return [
    ...existing
      .filter(
        (i) =>
          !i.archived &&
          !ids.has(i.question.id) &&
          !(
            options.replace &&
            (!options.topic || options.topic === i.question.topic)
          ),
      )
      .map((i) => i.question),
    ...incoming,
  ];
}
