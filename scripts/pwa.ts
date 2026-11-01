import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const directory = process.argv[2] ?? "dist";
const html = await readFile(`${directory}/index.html`, "utf8");
const worker = await readFile("public/sw.js", "utf8");
await writeFile(
  `${directory}/sw.js`,
  worker.replace(
    "__BUILD__",
    createHash("sha256").update(html).digest("hex").slice(0, 12),
  ),
);
