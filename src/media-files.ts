import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  MAX_IMAGE_BYTES,
  validateImageSource,
  type QuizImage,
} from "./core/media.ts";
import { parseBank } from "./core/schema.ts";

export async function imageFromFile(
  file: string,
  alt: string,
  caption?: string,
): Promise<QuizImage> {
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_IMAGE_BYTES)
    throw new Error(
      "Use an image file of at most 1 MiB; the editor can resize larger images",
    );
  const data = await readFile(file);
  const type = data[0] === 137 ? "png" : data[0] === 255 ? "jpeg" : "webp";
  const src = `data:image/${type};base64,${data.toString("base64")}`;
  if (!validateImageSource(src))
    throw new Error(
      "Use a valid PNG/JPEG/WebP, up to 8192 pixels per side and 16 megapixels",
    );
  if (!alt.trim() || alt.length > 2000)
    throw new Error("Supply descriptive alt text (1–2000 characters)");
  if (caption && caption.length > 2000)
    throw new Error("Captions must be at most 2000 characters");
  return { src, alt: alt.trim(), ...(caption ? { caption } : {}) };
}
/** Explicit file-only packaging. Local references cannot escape the bank's directory. */
export async function packBank(file: string) {
  const info = await stat(file);
  if (info.size > 5 * 1024 * 1024)
    throw new Error("Question bank exceeds 5 MiB");
  const raw = JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  if (raw.format && (raw.format !== "recall" || raw.version !== 1))
    throw new Error("Invalid Recall file format");
  const input = raw.format === "recall" ? raw.bank : raw;
  if (!input || !Array.isArray(input.questions))
    throw new Error("Pack a question bank JSON file");
  const root = await realpath(dirname(resolve(file)));
  for (const question of input.questions) {
    for (const target of [
      question,
      question.reverse,
      ...(Array.isArray(question.variants) ? question.variants : []),
    ]) {
      if (!target || typeof target !== "object") continue;
      for (const key of ["image", "answerImage"]) {
        const image = target[key];
        if (
          !image ||
          typeof image.src !== "string" ||
          image.src.startsWith("data:")
        )
          continue;
        if (isAbsolute(image.src) || /^[a-z][a-z0-9+.-]*:/i.test(image.src))
          throw new Error(
            "Image references must be relative files inside the bank directory",
          );
        const path = await realpath(resolve(root, image.src)),
          inside = relative(root, path);
        if (inside.startsWith("..") || isAbsolute(inside))
          throw new Error("Image reference escapes the bank directory");
        target[key] = {
          ...image,
          ...(await imageFromFile(path, image.alt ?? "", image.caption)),
        };
      }
    }
  }
  const bank = parseBank(input);
  if (Buffer.byteLength(JSON.stringify(bank)) > 5 * 1024 * 1024)
    throw new Error(
      "Packed bank exceeds 5 MiB; resize images or split the deck",
    );
  return bank;
}
