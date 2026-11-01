import { z } from "zod";
import { parseBank } from "./schema.ts";
import { validatePrerequisites } from "./prerequisites.ts";
import type { Bank, Session } from "./types.ts";

export interface RecoveryFile {
  format: "recall-recovery";
  version: 1;
  exportedAt: string;
  decks: { id: string; bank: Bank }[];
  sessions: Session[];
}
const id = z.string().min(1).max(200);
const entry = z
  .object({
    questionId: id,
    variantId: id,
    format: z.enum([
      "written",
      "flashcard",
      "matching",
      "multiple_choice",
      "multiple_select",
    ]),
    retry: z.number().int().min(0).max(2000),
  })
  .passthrough();
const session = z
  .object({
    id: z.string().uuid(),
    deckId: id,
    mode: z.enum(["learn", "cram", "flashcards", "test"]),
    queue: z.array(entry).max(2000),
    answers: z.array(z.unknown()).max(2000),
    cursor: z.number().int().min(0),
    version: z.number().int().min(0),
    finished: z.boolean(),
    createdAt: z.string(),
    topic: z.string().nullable(),
    deadline: z.string().nullable(),
  })
  .passthrough();
const schema = z
  .object({
    format: z.literal("recall-recovery"),
    version: z.literal(1),
    exportedAt: z.string(),
    decks: z
      .array(z.object({ id, bank: z.unknown() }).strict())
      .min(1)
      .max(100),
    sessions: z.array(session).min(1).max(100),
  })
  .strict();
export function parseRecovery(input: unknown): RecoveryFile {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid recovery file: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  const decks = parsed.data.decks.map((d) => ({
    id: d.id,
    bank: parseBank(d.bank),
  }));
  if (new Set(decks.map((d) => d.id)).size !== decks.length)
    throw new Error("Duplicate deck in recovery file");
  if (
    new Set(parsed.data.sessions.map((s) => s.id)).size !==
    parsed.data.sessions.length
  )
    throw new Error("Duplicate session in recovery file");
  for (const deck of decks) validatePrerequisites(deck.bank.questions);
  for (const s of parsed.data.sessions) {
    const deck = decks.find((d) => d.id === s.deckId);
    if (!deck || s.cursor !== s.answers.length || s.cursor > s.queue.length)
      throw new Error(
        "Recovery session does not match its deck or answer cursor",
      );
    const ids = new Set(deck.bank.questions.map((q) => q.id));
    if (s.queue.some((e) => !ids.has(e.questionId)))
      throw new Error("Recovery queue references a missing question");
    for (let n = 0; n < s.answers.length; n++) {
      const answer = s.answers[n] as Session["answers"][number];
      if (
        !answer ||
        answer.questionId !== s.queue[n].questionId ||
        typeof answer.variantId !== "string" ||
        !answer.variantId ||
        !Number.isInteger(answer.revision) ||
        answer.revision < 1
      )
        throw new Error("Recovery evidence does not match the queue");
    }
  }
  return { ...parsed.data, decks, sessions: parsed.data.sessions as Session[] };
}
/** Export only selected pending evidence and the questions needed to review it. */
export function createRecovery(
  decks: { id: string; bank: Bank }[],
  sessions: Session[],
): RecoveryFile {
  const used = new Set(sessions.map((s) => s.deckId));
  return parseRecovery({
    format: "recall-recovery",
    version: 1,
    exportedAt: new Date().toISOString(),
    decks: decks.filter((d) => used.has(d.id)),
    sessions: structuredClone(sessions),
  });
}
