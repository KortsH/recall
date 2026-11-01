import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { Bank, Question, Variant } from "./types.ts";
export { variants, resolveVariant } from "./questions.ts";

const text = z.string().trim().min(1).max(20000);
const grading = {
  options: z.array(text).min(2).max(12).optional(),
  correct: z.array(text).min(1).optional(),
  acceptedAnswers: z.array(text).min(1).optional(),
  requiredParts: z.array(z.array(text).min(1)).min(1).optional(),
  rubric: z.array(text).optional(),
};
const variantSchema = z
  .object({
    id: text,
    skill: z.enum(["recall", "application"]).optional(),
    type: z.enum([
      "multiple_choice",
      "multiple_select",
      "written",
      "flashcard",
      "matching",
    ]),
    question: text,
    answer: text,
    ...grading,
    pairs: z
      .array(z.object({ left: text, right: text }).strict())
      .min(2)
      .max(12)
      .optional(),
    explanation: z.string().max(20000).optional(),
  })
  .strict();
const questionSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/),
    topic: text.default("General"),
    concept: text.optional(),
    skill: z.enum(["recall", "application"]).default("recall"),
    question: text,
    answer: text,
    explanation: z.string().max(20000).default(""),
    difficulty: z.number().int().min(1).max(5).default(1),
    tags: z.array(text).default([]),
    type: z
      .enum(["multiple_choice", "multiple_select", "written", "flashcard"])
      .optional(),
    ...grading,
    variants: z.array(variantSchema).default([]),
  })
  .strict();
export const bankSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    deck: text,
    description: z.string().max(20000).default(""),
    questions: z.array(questionSchema).min(1).max(10000),
  })
  .strict();

function validateChoices(
  value: { options?: string[]; correct?: string[]; answer: string },
  path: string,
  multi = false,
) {
  if (!value.options) {
    if (value.correct) throw new Error(`${path}: correct requires options`);
    return;
  }
  if (new Set(value.options).size !== value.options.length)
    throw new Error(`${path}: options must be unique`);
  const correct = value.correct ?? [value.answer];
  if (
    correct.some((a) => !value.options!.includes(a)) ||
    new Set(correct).size !== correct.length
  )
    throw new Error(`${path}: correct answers must be unique options`);
  if (!multi && correct.length !== 1)
    throw new Error(`${path}: multiple_choice needs one correct option`);
}
export function parseBank(input: unknown, deckOverride?: string): Bank {
  const source = typeof input === "object" && input ? input : {};
  const result = bankSchema.safeParse(
    deckOverride ? { ...source, deck: deckOverride } : source,
  );
  if (!result.success)
    throw new Error(
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n"),
    );
  const ids = new Set<string>();
  const questions: Question[] = result.data.questions.map((q, index) => {
    if (ids.has(q.id))
      throw new Error(`questions.${index}.id: duplicate ID ${q.id}`);
    ids.add(q.id);
    validateChoices(
      q,
      q.id,
      (q.correct?.length ?? 0) > 1 || q.type === "multiple_select",
    );
    const variantIds = new Set(["choice", "written", "flashcard"]);
    for (const v of q.variants) {
      if (variantIds.has(v.id))
        throw new Error(`${q.id}: duplicate or reserved variant ID ${v.id}`);
      variantIds.add(v.id);
      validateChoices(v, `${q.id}.${v.id}`, v.type === "multiple_select");
      if (["multiple_choice", "multiple_select"].includes(v.type) && !v.options)
        throw new Error(`${q.id}.${v.id}: choices require options`);
      if (
        v.type === "matching" &&
        (!v.pairs ||
          new Set(v.pairs.map((p) => p.left)).size !== v.pairs.length ||
          new Set(v.pairs.map((p) => p.right)).size !== v.pairs.length)
      )
        throw new Error(`${q.id}.${v.id}: matching requires unique pairs`);
    }
    const { type, ...rest } = q;
    return { ...rest, concept: q.concept ?? q.question };
  });
  return { ...result.data, questions };
}
export async function readBank(path: string, deck?: string): Promise<Bank> {
  const data = await readFile(path, "utf8");
  if (extname(path).toLowerCase() === ".json")
    return parseBank(JSON.parse(data), deck);
  if (![".csv", ".tsv"].includes(extname(path).toLowerCase()))
    throw new Error("Use a .json, .csv or .tsv file");
  const rows = parse(data, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    delimiter: extname(path).toLowerCase() === ".tsv" ? "\t" : ",",
  }) as Record<string, string>[];
  if (!deck) throw new Error("CSV/TSV import requires --deck");
  return parseBank({
    deck,
    questions: rows.map((r: Record<string, string>) => ({
      ...r,
      difficulty: r.difficulty ? Number(r.difficulty) : undefined,
      tags: r.tags ? r.tags.split("|") : undefined,
    })),
  });
}
export function contentHash(q: Question): string {
  const { explanation, tags, topic, concept, difficulty, ...content } = q;
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([k, v]) => k !== "explanation" && v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  return createHash("sha256")
    .update(JSON.stringify(canonical(content)))
    .digest("hex");
}
