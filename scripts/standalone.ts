import { spawnSync } from "node:child_process";
import {
  copyFile,
  readFile,
  writeFile,
  mkdir,
  readdir,
} from "node:fs/promises";
const native = process.argv.includes("--android");
const directory = native
  ? "mobile/android/app/build/generated/assets/recall/www"
  : "build/standalone";
const base = native ? "/assets/www/" : (process.env.RECALL_WEB_BASE ?? "/");
const result = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_RECALL_STANDALONE: "true",
      VITE_RECALL_PLATFORM: native
        ? "android"
        : process.argv.includes("--windows")
          ? "windows"
          : "web",
      RECALL_BUILD_DIR: directory,
      RECALL_WEB_BASE: base,
    },
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);
if (native) {
  await mkdir(directory + "/locales", { recursive: true });
  for (const file of (await readdir("src/web/locales")).filter((f) =>
    f.endsWith(".json"),
  ))
    await copyFile("src/web/locales/" + file, directory + "/locales/" + file);
}
await copyFile("LICENSE", `${directory}/LICENSE.txt`);
let notices = "Recall bundles these open-source dependencies.\n\n";
for (const name of [
  "i18next",
  "react",
  "react-dom",
  "lucide-react",
  "zod",
  "katex",
  "@fontsource/dm-sans",
  "@fontsource/manrope",
]) {
  for (const file of ["LICENSE", "LICENSE.txt", "LICENSE.md"]) {
    try {
      notices += `\n===== ${name} =====\n${await readFile(`node_modules/${name}/${file}`, "utf8")}\n`;
      break;
    } catch {}
  }
}
await writeFile(`${directory}/THIRD_PARTY_NOTICES.txt`, notices);
const pwa = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/pwa.ts", directory],
  { stdio: "inherit" },
);
process.exit(pwa.status ?? 1);
