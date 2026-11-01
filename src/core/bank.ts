import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse } from "csv-parse/sync";
import type { Bank, Question } from "./types.ts";
import { parseBank, semanticContent } from "./schema.ts";
import { parsePortable } from "./portable.ts";
export { parseBank, bankSchema } from "./schema.ts";
export { variants, resolveVariant } from "./questions.ts";
export async function readBank(path: string, deck?: string): Promise<Bank> {
  const data = await readFile(path, "utf8");
  if (extname(path).toLowerCase() === ".json")
    return parseBank(parsePortable(JSON.parse(data)).bank, deck);
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
      depends_on: r.depends_on ? r.depends_on.split("|") : undefined,
    })),
  });
}
export function contentHash(q: Question): string {
  return createHash("sha256").update(semanticContent(q)).digest("hex");
}
