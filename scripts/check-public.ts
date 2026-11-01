import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const failures: string[] = [];
const privatePath =
  /(^|\/)(\.env(?!\.example$)[^/]*|private|\.ssh|local\.properties)(\/|$)|\.(dump|sql|keystore|jks|apk|aab)$/i;
const patterns = [
  /[a-z\d.-]+\.ts\.net\b/i,
  /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/,
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  /(?:C:[\\/]Users[\\/]|\/home\/)(?!runner\b)[a-z][\w.-]+[\\/]/i,
  /(?:github_pat_[a-z\d_]{30,}|gh[pousr]_[a-z\d]{30,})/i,
];
for (const path of paths) {
  if (privatePath.test(path)) failures.push(`${path}: private file type`);
  let data: Buffer;
  try {
    data = readFileSync(path);
  } catch {
    continue;
  }
  if (data.includes(0)) continue;
  if (patterns.some((p) => p.test(data.toString("utf8"))))
    failures.push(`${path}: possible private deployment data (value hidden)`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(`Public-source checks passed (${paths.length} tracked paths).`);
