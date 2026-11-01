import { z } from "zod";
import { parseBank, semanticContent } from "./schema.ts";
import {
  prospectiveQuestions,
  validatePrerequisites,
} from "./prerequisites.ts";
import {
  emptyProgress,
  type Bank,
  type Item,
  type Progress,
  type Question,
} from "./types.ts";

const count = z.number().int().min(0).max(10000000);
const date = z
  .string()
  .refine((s) => Number.isFinite(Date.parse(s)), "Invalid date")
  .nullable();
const skill = z.object({ attempts: count, correct: count }).strict();
const progressSchema = z
  .object({
    attempts: count,
    correct: count,
    wrong: count,
    streak: count,
    recalls: count,
    recognition: count,
    selfAssessed: count,
    mastered: z.boolean(),
    lastReviewed: date,
    nextReview: date,
    skills: z
      .object({ recall: skill.optional(), application: skill.optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (p) =>
      p.correct + p.wrong === p.attempts &&
      p.streak <= p.correct &&
      p.recalls <= p.streak &&
      p.recognition <= p.correct &&
      p.selfAssessed <= p.attempts &&
      p.mastered === (p.streak >= 3 && p.recalls >= 2),
    "Inconsistent progress counters or mastery",
  );
const envelope = z
  .object({
    format: z.literal("recall"),
    version: z.literal(1),
    createdAt: z.string().optional(),
    bank: z.unknown(),
    progress: z
      .record(
        z.string(),
        z
          .object({
            hash: z.string().regex(/^[a-f0-9]{64}$/),
            progress: progressSchema,
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export interface PortableBank {
  format: "recall";
  version: 1;
  createdAt: string;
  bank: Bank;
  progress?: Record<string, { hash: string; progress: Progress }>;
}
export async function questionDigest(q: Question) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(semanticContent(q)),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function parsePortable(input: unknown): {
  bank: Bank;
  progress?: PortableBank["progress"];
} {
  if (input && typeof input === "object" && "format" in input) {
    const parsed = envelope.safeParse(input);
    if (!parsed.success)
      throw new Error(
        `Invalid Recall file: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    return {
      bank: parseBank(parsed.data.bank),
      progress: parsed.data.progress,
    };
  }
  return { bank: parseBank(input) };
}
export async function exportPortable(
  bank: Bank,
  items: Item[] = [],
  includeProgress = false,
): Promise<PortableBank> {
  validatePrerequisites(bank.questions);
  const result: PortableBank = {
    format: "recall",
    version: 1,
    createdAt: new Date().toISOString(),
    bank: parseBank(bank),
  };
  if (includeProgress) {
    result.progress = {};
    for (const q of bank.questions) {
      const item = items.find((i) => !i.archived && i.question.id === q.id);
      if (item)
        result.progress[q.id] = {
          hash: await questionDigest(q),
          progress: structuredClone(item.progress),
        };
    }
  }
  return result;
}
/** Plan on copies so a malformed file or dangling replacement cannot partly alter storage. */
export async function importPersonal(
  existing: Item[],
  input: unknown,
  options: {
    replace?: boolean;
    topic?: string;
    restoreProgress?: boolean;
  } = {},
) {
  const { bank, progress } = parsePortable(input);
  if (options.topic && bank.questions.some((q) => q.topic !== options.topic))
    throw new Error("Every imported question must match the selected topic");
  validatePrerequisites(
    prospectiveQuestions(existing, bank.questions, options),
  );
  if (options.restoreProgress && progress)
    for (const [id, evidence] of Object.entries(progress)) {
      const q = bank.questions.find((q) => q.id === id);
      if (!q || (await questionDigest(q)) !== evidence.hash)
        throw new Error(`Progress does not match question ${id}`);
    }
  const items = structuredClone(existing);
  const counts = {
    created: 0,
    updated: 0,
    unchanged: 0,
    reviewReset: 0,
    archived: 0,
    archiveIds: [] as string[],
    progressRestored: 0,
  };
  for (const q of bank.questions) {
    const old = items.find((i) => i.question.id === q.id);
    if (!old) {
      items.push({ question: q, revision: 1, progress: emptyProgress() });
      counts.created++;
    } else {
      if (!old.archived && JSON.stringify(old.question) === JSON.stringify(q))
        counts.unchanged++;
      else counts.updated++;
      if (semanticContent(old.question) !== semanticContent(q)) {
        old.revision++;
        old.progress = emptyProgress();
        counts.reviewReset++;
      }
      old.question = q;
      old.archived = false;
    }
    if (options.restoreProgress && progress?.[q.id]) {
      items.find((i) => i.question.id === q.id)!.progress = structuredClone(
        progress[q.id].progress,
      );
      counts.progressRestored++;
    }
  }
  if (options.replace)
    for (const item of items) {
      if (
        !item.archived &&
        (!options.topic || item.question.topic === options.topic) &&
        !bank.questions.some((q) => q.id === item.question.id)
      ) {
        item.archived = true;
        counts.archived++;
        counts.archiveIds.push(item.question.id);
      }
    }
  return { bank, items, counts };
}
