import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const directory = process.argv[2] ?? "dist";
const hash = createHash("sha256");
const assets: string[] = [];
async function fingerprint(relative = "") {
  for (const entry of (
    await readdir(`${directory}/${relative}`, { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative + entry.name;
    if (entry.isDirectory()) await fingerprint(name + "/");
    else if (name !== "sw.js") {
      if (/^assets\/.+\.(?:js|css|woff2)$/.test(name)) assets.push(name);
      hash
        .update(name + "\0")
        .update(await readFile(`${directory}/${name}`))
        .update("\0");
    }
  }
}
await fingerprint();
const worker = await readFile("public/sw.js", "utf8");
await writeFile(
  `${directory}/sw.js`,
  worker
    .replace("__BUILD__", hash.digest("hex").slice(0, 12))
    .replace("/*__PRECACHE__*/ []", JSON.stringify(assets)),
);
