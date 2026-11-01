import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const html = await readFile("dist/index.html", "utf8");
const worker = await readFile("public/sw.js", "utf8");
await writeFile(
  "dist/sw.js",
  worker.replace(
    "__BUILD__",
    createHash("sha256").update(html).digest("hex").slice(0, 12),
  ),
);
