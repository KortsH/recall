import { z } from "zod";
import { parseBank } from "./schema.ts";
import { validatePrerequisites } from "./prerequisites.ts";
import type { Item, Question } from "./types.ts";

export interface QuestionVersion {
  question: Question;
  archived: boolean;
}
export interface DeckContent {
  name: string;
  description: string;
}
export interface AuthoringBatch {
  format: "recall-edits";
  version: 1;
  id: string;
  deckId: string;
  deck?: { base: DeckContent | null; value: DeckContent };
  changes: {
    id: string;
    base: QuestionVersion | null;
    value: QuestionVersion;
  }[];
}
export interface AuthoringConflict {
  reason?: "name-taken" | "graph";
  kind: "question" | "deck";
  id: string;
  base: unknown;
  local: unknown;
  server: unknown;
}
export interface AuthoringResult {
  applied: boolean;
  conflicts: AuthoringConflict[];
  items: Item[];
}
export const canonical = (value: unknown): string =>
  JSON.stringify(sort(value));
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sort(v)]),
    );
  return value;
}
export const questionVersion = (item?: Item): QuestionVersion | null =>
  item ? { question: item.question, archived: !!item.archived } : null;
const content = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20000),
  })
  .strict();
const record = z
  .object({ question: z.unknown(), archived: z.boolean() })
  .strict();
const schema = z
  .object({
    format: z.literal("recall-edits"),
    version: z.literal(1),
    id: z.uuid(),
    deckId: z.string().min(1).max(200),
    deck: z
      .object({ base: content.nullable(), value: content })
      .strict()
      .optional(),
    changes: z
      .array(
        z
          .object({
            id: z.string().min(1).max(20000),
            base: record.nullable(),
            value: record,
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export function parseAuthoring(input: unknown): AuthoringBatch {
  const parsed = schema.parse(input);
  if (!parsed.changes.length && !parsed.deck)
    throw new Error("Empty authoring batch");
  if (new Set(parsed.changes.map((c) => c.id)).size !== parsed.changes.length)
    throw new Error("Duplicate authoring question IDs");
  return {
    ...parsed,
    changes: parsed.changes.map((c) => {
      const normalize = (v: {
        question?: unknown;
        archived: boolean;
      }): QuestionVersion => ({
        question: parseBank({ deck: "edit", questions: [v.question] })
          .questions[0],
        archived: v.archived,
      });
      const value = normalize(c.value),
        base = c.base ? normalize(c.base) : null;
      if (value.question.id !== c.id || (base && base.question.id !== c.id))
        throw new Error("Authoring question IDs cannot change");
      return { id: c.id, base, value };
    }),
  };
}
export function parseEditBackup(input: unknown) {
  const parsed = z
    .object({
      format: z.literal("recall-edit-backup"),
      version: z.literal(1),
      createdAt: z.string(),
      batches: z.array(z.unknown()).max(5000),
      history: z.array(z.unknown()).optional(),
    })
    .strict()
    .parse(input);
  const batches = parsed.batches.map(parseAuthoring);
  if (new Set(batches.map((b) => b.id)).size !== batches.length)
    throw new Error("Duplicate authoring batch IDs");
  return { ...parsed, batches };
}

/** Compare all question metadata, not only the semantic grading revision. No writes. */
export function planAuthoring(
  batch: AuthoringBatch,
  items: Item[],
  deck: DeckContent | null,
) {
  const conflicts: AuthoringConflict[] = [];
  if (batch.deck) {
    if (
      canonical(deck) !== canonical(batch.deck.base) &&
      canonical(deck) !== canonical(batch.deck.value)
    )
      conflicts.push({
        kind: "deck",
        id: batch.deckId,
        base: batch.deck.base,
        local: batch.deck.value,
        server: deck,
      });
  } else if (!deck)
    conflicts.push({
      kind: "deck",
      id: batch.deckId,
      base: null,
      local: null,
      server: null,
    });
  for (const change of batch.changes) {
    const current = questionVersion(
      items.find((i) => i.question.id === change.id),
    );
    if (
      canonical(current) !== canonical(change.base) &&
      canonical(current) !== canonical(change.value)
    )
      conflicts.push({
        kind: "question",
        id: change.id,
        base: change.base,
        local: change.value,
        server: current,
      });
  }
  const next = new Map(items.map((i) => [i.question.id, questionVersion(i)!]));
  for (const change of batch.changes) next.set(change.id, change.value);
  if (!conflicts.length) {
    try {
      validatePrerequisites(
        [...next.values()].filter((v) => !v.archived).map((v) => v.question),
      );
    } catch {
      for (const change of batch.changes)
        conflicts.push({
          kind: "question",
          reason: "graph",
          id: change.id,
          base: change.base,
          local: change.value,
          server: questionVersion(
            items.find((i) => i.question.id === change.id),
          ),
        });
    }
  }
  return conflicts;
}

/** An explicit choice creates a new immutable request; the previous request stays exportable. */
export function resolveAuthoring(
  batch: AuthoringBatch,
  conflicts: AuthoringConflict[],
  choices: Record<string, "local" | "server">,
  deckName?: string,
): AuthoringBatch | null {
  const next = structuredClone(batch);
  next.id = crypto.randomUUID();
  for (const conflict of conflicts) {
    const choice = choices[`${conflict.kind}:${conflict.id}`];
    if (!choice) throw new Error("Choose a version for every conflict");
    if (conflict.kind === "deck") {
      if (
        choice === "server" &&
        (!conflict.server || conflict.reason === "name-taken")
      )
        return null;
      if (choice === "server") delete next.deck;
      else if (conflict.reason === "name-taken") {
        if (
          !next.deck ||
          !deckName?.trim() ||
          deckName.trim() === next.deck.value.name
        )
          throw new Error("Choose a new deck name");
        next.deck.base = null;
        next.deck.value.name = deckName.trim();
      } else {
        if (!next.deck)
          throw new Error("The destination deck no longer exists");
        next.deck.base = conflict.server as DeckContent | null;
      }
    } else if (choice === "server")
      next.changes = next.changes.filter((c) => c.id !== conflict.id);
    else
      next.changes.find((c) => c.id === conflict.id)!.base =
        conflict.server as QuestionVersion | null;
  }
  return next.changes.length || next.deck ? next : null;
}
