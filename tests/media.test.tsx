import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseBank, contentHash } from "../src/core/bank.ts";
import { emptyProgress, type Item } from "../src/core/types.ts";
import { MAX_IMAGE_BYTES, validateImageSource } from "../src/core/media.ts";
import { imageFromFile, packBank } from "../src/media-files.ts";
import { publicCard } from "../src/core/engine.ts";
import {
  newSession,
  revealAnswer,
  advanceSession,
  sessionView,
  presentAttempt,
} from "../src/core/study.ts";
import { exportPortable, importPersonal } from "../src/core/portable.ts";
import { RichText, mathSegments } from "../src/web/rich-text.tsx";
import { ImageFigure } from "../src/web/media.tsx";
import { mentalAnswerShortcut } from "../src/web/controls.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const image = {
  src: `data:image/png;base64,${png.toString("base64")}`,
  alt: "A single point",
  caption: "Reference diagram",
};
const source = () => ({
  deck: "Media examples",
  questions: [
    {
      id: "graph",
      question: "Find $x$ in the picture.",
      answer: "$x=2$",
      image: { ...image },
      answerImage: { ...image, alt: "The worked solution" },
      reversible: true,
      reverse: { question: "Name the diagram for $x=2$", answer: "A point" },
    },
  ],
});
const items = (): Item[] =>
  parseBank(source()).questions.map((question) => ({
    question,
    revision: 1,
    progress: emptyProgress(),
  }));

test("image banks accept embedded bounded raster images and reject URLs, paths, SVG and oversized dimensions", () => {
  assert.ok(validateImageSource(image.src));
  assert.equal(parseBank(source()).questions[0].image!.alt, image.alt);
  for (const src of [
    "https://example.test/track.png",
    "../picture.png",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:image/jpeg;base64," + png.toString("base64"),
    "data:image/png;base64,invalid",
    `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`,
  ]) {
    assert.equal(validateImageSource(src), false);
    const bank = source();
    bank.questions[0].image.src = src;
    assert.throws(() => parseBank(bank), /embedded/);
  }
  const enormous = Buffer.from(png);
  enormous.writeUInt32BE(100000, 16);
  assert.equal(
    validateImageSource(`data:image/png;base64,${enormous.toString("base64")}`),
    false,
  );
  const noAlt = source();
  noAlt.questions[0].image.alt = "";
  assert.throws(() => parseBank(noAlt), /alt/);
});

test("media follows forward variants, stays independent in reverse, and never exposes a model image before reveal/Test completion", () => {
  const bank = items(),
    item = bank[0];
  const card = publicCard(item, {
    questionId: "graph",
    variantId: "written",
    format: "written",
    retry: 0,
  });
  assert.deepEqual(card.image, image);
  assert.ok(!("answerImage" in card));
  const reverse = publicCard(item, {
    questionId: "graph",
    variantId: "reverse",
    format: "written",
    retry: 0,
  });
  assert.equal(reverse.image, undefined);
  const session = newSession("d", bank, { mode: "cram", count: 1 });
  const shown = revealAnswer(session, item, {
    version: 0,
    revision: 1,
    response: "",
    mental: true,
  });
  assert.equal(shown.answerImage!.alt, "The worked solution");
  const result = advanceSession(
    session,
    item,
    { version: 0, revision: 1, response: "", rating: "good" },
    bank,
  );
  assert.ok(
    !JSON.stringify(session.answers).includes("data:image"),
    "Attempts never duplicate image bytes",
  );
  assert.equal(
    presentAttempt(result.attempt, bank).answerImage!.alt,
    "The worked solution",
  );
  assert.equal(
    presentAttempt(result.attempt, [{ ...item, revision: 2 }]).answerImage,
    undefined,
    "Do not show a changed image on an old attempt",
  );
  const exam = newSession("d", bank, { mode: "test", count: 1 });
  assert.equal(sessionView(exam, bank).result, null);
  assert.ok(
    !JSON.stringify(sessionView(exam, bank)).includes("The worked solution"),
  );
});

test("portable images round-trip offline; image corrections change grading revisions, and old banks keep their content hashes", async () => {
  const bank = parseBank(source()),
    original = items();
  const file = await exportPortable(bank, original, true);
  const imported = await importPersonal([], JSON.parse(JSON.stringify(file)), {
    restoreProgress: true,
  });
  assert.deepEqual(imported.items[0], original[0]);
  const old = contentHash(bank.questions[0]);
  const changed = structuredClone(bank);
  changed.questions[0].image!.alt = "A different diagram description";
  assert.notEqual(contentHash(changed.questions[0]), old);
  assert.equal((await importPersonal(original, changed)).counts.reviewReset, 1);
  const plain = parseBank({
    deck: "Old",
    questions: [{ id: "q", question: "Name a color", answer: "Red" }],
  }).questions[0];
  assert.equal(
    contentHash(plain),
    contentHash({ ...plain, image: undefined, answerImage: undefined }),
  );
});

test("CLI packaging embeds relative files without a server, rejects directory escape/network sources and keeps portable pack compatibility", async () => {
  const folder = await mkdtemp(join(tmpdir(), "recall-media-")),
    root = join(folder, "bank");
  await mkdir(root);
  await writeFile(join(root, "point.png"), png);
  await writeFile(join(folder, "outside.png"), png);
  const draft = source();
  draft.questions[0].image.src = "point.png";
  const input = join(root, "draft.json");
  await writeFile(input, JSON.stringify(draft));
  const packed = await packBank(input);
  assert.equal(packed.questions[0].image!.src, image.src);
  const output = join(root, "quiz.recall.json");
  const result = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "pack", input, "-o", output],
    {
      cwd: process.cwd(),
      env: { ...process.env, RECALL_SERVER_URL: "http://127.0.0.1:1" },
      encoding: "utf8",
    },
  );
  assert.match(result, /questions/);
  const portable = JSON.parse(await readFile(output, "utf8"));
  assert.equal(portable.format, "recall");
  assert.equal(portable.progress, undefined);
  assert.equal((await packBank(output)).questions[0].image!.src, image.src);
  for (const src of [
    "../outside.png",
    "https://example.test/image.png",
    join(folder, "outside.png"),
  ]) {
    draft.questions[0].image.src = src;
    await writeFile(input, JSON.stringify(draft));
    await assert.rejects(packBank(input), /inside|escapes|relative/);
  }
  await assert.rejects(imageFromFile(join(root, "point.png"), ""), /alt text/);
});

test("math is rendered accessibly from LaTeX while HTML, links, remote images and invalid formulas remain inert", () => {
  const math = renderToStaticMarkup(
    <RichText text={"Solve \\(x^2\\) using $$\\frac{a}{b}$$."} />,
  );
  assert.match(math, /katex/);
  assert.match(math, /<math/);
  assert.match(math, /math-display/);
  for (const payload of [
    "<img src=x onerror=alert(1)>",
    "$\\href{javascript:alert(1)}{go}$",
    "$\\includegraphics{https://evil.test/image.png}$",
    "\\(\\frac{\\)",
  ]) {
    const html = renderToStaticMarkup(<RichText text={payload} />);
    assert.doesNotMatch(html, /<img|href="javascript:|src="https:/);
  }
  assert.ok(mathSegments("Prices are $5 and $10").every((p) => !p.math));
  assert.match(
    renderToStaticMarkup(<ImageFigure image={image} />),
    /Expand image/,
  );
  assert.doesNotMatch(
    renderToStaticMarkup(
      <ImageFigure image={{ src: "https://evil.test/pixel", alt: "remote" }} />,
    ),
    /<img/,
  );
});

test("mental shortcuts preserve numerical typing, browser modifiers and composition", () => {
  assert.equal(mentalAnswerShortcut({ key: "5" }, false), true);
  assert.equal(mentalAnswerShortcut({ key: "5" }, true), false);
  assert.equal(mentalAnswerShortcut({ key: "5", altKey: true }, true), true);
  for (const modifier of [
    "ctrlKey",
    "metaKey",
    "shiftKey",
    "repeat",
    "isComposing",
  ])
    assert.equal(
      mentalAnswerShortcut({ key: "5", altKey: true, [modifier]: true }, false),
      false,
    );
});
