import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";

export const placeholders = (text: string) =>
  [
    ...new Set([...text.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)].map((m) => m[1])),
  ].sort();

/** Bundled translations are complete; i18next's runtime fallback is for resilience. */
export function catalogIssues(
  base: Record<string, string>,
  translation: Record<string, string>,
) {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(base)) {
    if (typeof translation[key] !== "string" || !translation[key].trim())
      problems.push(`Missing message: ${key}`);
    else if (
      JSON.stringify(placeholders(value)) !==
      JSON.stringify(placeholders(translation[key]))
    )
      problems.push(`Interpolation mismatch: ${key}`);
  }
  for (const key of Object.keys(translation)) {
    if (key in base) continue;
    const stem = key.replace(/_(zero|one|two|few|many|other)$/, "");
    const pluralBase = base[`${stem}_other`];
    if (stem !== key && pluralBase) {
      if (
        typeof translation[key] !== "string" ||
        !translation[key].trim() ||
        JSON.stringify(placeholders(pluralBase)) !==
          JSON.stringify(placeholders(translation[key]))
      )
        problems.push(`Invalid plural message: ${key}`);
    } else problems.push(`Unknown message: ${key}`);
  }
  return problems;
}

export function sourceIssues(
  name: string,
  source: string,
  messages: Record<string, string>,
) {
  const file = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const problems: string[] = [];
  const report = (n: ts.Node, message: string) =>
    problems.push(
      `${name}:${file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1}: ${message}`,
    );
  const human = (text: string) =>
    /\p{L}{2}/u.test(text) &&
    !["Recall", "recall", "recall."].includes(text.trim());
  function visit(n: ts.Node) {
    if (ts.isJsxText(n) && human(n.text.trim()))
      report(n, "Move visible text to a translation key");
    if (
      ts.isJsxAttribute(n) &&
      [
        "aria-label",
        "placeholder",
        "title",
        "alt",
        "label",
        "confirmLabel",
      ].includes(n.name.getText(file)) &&
      n.initializer &&
      ts.isStringLiteral(n.initializer) &&
      human(n.initializer.text)
    )
      report(n, "Translate this visible attribute");
    if (ts.isCallExpression(n) && n.expression.getText(file) === "tr") {
      const key = n.arguments[0];
      if (
        key &&
        ts.isStringLiteral(key) &&
        !(key.text in messages) &&
        !(`${key.text}_other` in messages)
      )
        report(n, `Unknown translation key: ${key.text}`);
      if (
        ts.isBinaryExpression(n.parent) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken,
        ].includes(n.parent.operatorToken.kind)
      )
        report(n, "Never translate a protocol value or comparison operand");
    }
    ts.forEachChild(n, visit);
  }
  visit(file);
  return problems;
}

export async function checkTranslations() {
  const directory = "src/web/locales";
  const en = JSON.parse(await readFile(`${directory}/en.json`, "utf8"));
  const problems: string[] = [];
  for (const file of (await readdir(directory)).filter((f) =>
    f.endsWith(".json"),
  )) {
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*\.json$/.test(file))
      problems.push(`${file}: Use a BCP 47 language filename`);
    const catalog = JSON.parse(await readFile(`${directory}/${file}`, "utf8"));
    problems.push(...catalogIssues(en, catalog).map((p) => `${file}: ${p}`));
  }
  for (const file of (await readdir("src/web")).filter((f) =>
    /\.tsx?$/.test(f),
  ))
    problems.push(
      ...sourceIssues(file, await readFile(`src/web/${file}`, "utf8"), en),
    );
  return problems;
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/check-i18n.ts")) {
  const problems = await checkTranslations();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "Translation catalogs, placeholders and visible UI text passed.",
    );
}
