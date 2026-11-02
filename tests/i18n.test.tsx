import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import {
  availableLanguages,
  catalogs,
  initialLanguage,
  setLanguage,
  supportedLanguage,
  tr,
  useLanguage,
} from "../src/web/i18n.ts";
import {
  catalogIssues,
  checkTranslations,
  sourceIssues,
} from "../scripts/check-i18n.ts";
import { QuestionLibrary } from "../src/web/library.tsx";
import { ErrorMessage } from "../src/web/error.tsx";
import { parseBank } from "../src/core/bank.ts";
import { emptyProgress } from "../src/core/types.ts";

test("language selection uses saved preference, browser language and safe English fallback", () => {
  assert.equal(initialLanguage({ getItem: () => "et" }, ["en"]), "et");
  assert.equal(
    initialLanguage({ getItem: () => "removed" }, ["et-EE", "en"]),
    "et",
  );
  assert.equal(
    initialLanguage(
      {
        getItem: () => {
          throw Error("disabled");
        },
      },
      ["fr"],
    ),
    "en",
  );
  assert.equal(supportedLanguage("ET-ee"), "et");
  assert.deepEqual(availableLanguages.map((l) => l.name).sort(), [
    "Eesti",
    "English",
  ]);
});

test("every catalog is complete and interpolations and visible strings are checked", async () => {
  assert.deepEqual(await checkTranslations(), []);
  assert.ok(catalogIssues({ test: "{{count}}" }, {}).length);
  assert.ok(catalogIssues({ test: "{{count}}" }, { test: "{{wrong}}" }).length);
  assert.ok(
    sourceIssues(
      "test.tsx",
      '<button title="Hardcoded">Hello</button>',
      catalogs.en,
    ).length === 2,
  );
  assert.ok(
    sourceIssues("test.tsx", 'mode === tr("mode.learn")', catalogs.en).length,
  );
});

test("Estonian plurals and interpolation preserve user content rather than treating it as a translation", async () => {
  await setLanguage("et");
  assert.equal(tr("flag.followUps", { count: 1 }), "1 jätkuküsimus");
  assert.equal(tr("flag.followUps", { count: 4 }), "4 jätkuküsimust");
  const question = "<script> {{value}} $t(common.cancel)";
  assert.equal(tr("library.select", { question }), `Vali: ${question}`);
  await setLanguage("en");
});

test("live language changes retain library selection, question IDs and progress; diagnostics are explicit", async () => {
  const dom = new JSDOM(
    '<html><head><title>Recall</title><meta name="description"></head><body><div id="root"></div></body></html>',
    { url: "https://recall.example.test" },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const items = parseBank({
    deck: "Kool",
    questions: [
      {
        id: "school-1",
        topic: "General",
        question: "What is an atom?",
        answer: "An atom",
      },
    ],
  }).questions.map((question) => ({
    question,
    revision: 1,
    progress: { ...emptyProgress(), attempts: 2 },
  }));
  const original = JSON.stringify(items);
  const root = createRoot(document.getElementById("root")!);
  function View() {
    useLanguage();
    return (
      <>
        <QuestionLibrary
          items={items}
          topic=""
          search=""
          busy={false}
          onTopic={() => {}}
          onEdit={() => {}}
          onUpdate={async () => true}
        />
        <ErrorMessage message="raw diagnostic 123" />
      </>
    );
  }
  await act(async () => root.render(<View />));
  const checkbox = document.querySelector<HTMLInputElement>(
    'input[type="checkbox"][aria-label="Select school-1"]',
  )!;
  await act(async () => checkbox.click());
  await act(async () => {
    await setLanguage("et");
  });
  assert.equal(document.documentElement.lang, "et");
  assert.equal(localStorage.getItem("recall-language"), "et");
  assert.match(document.title, /Õpi/);
  assert.match(document.body.textContent!, /Rühmitamata/);
  assert.match(document.body.textContent!, /What is an atom\?/);
  assert.ok(
    document.querySelector<HTMLInputElement>(
      'input[aria-label="Vali: school-1"]',
    )!.checked,
  );
  assert.equal(JSON.stringify(items), original);
  assert.doesNotMatch(document.body.textContent!, /raw diagnostic/);
  const details = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Tehnilised üksikasjad",
  )!;
  await act(async () => details.click());
  assert.match(document.body.textContent!, /raw diagnostic 123/);
  await act(async () => {
    await setLanguage("en");
  });
  assert.equal(document.documentElement.lang, "en");
  await act(async () => root.unmount());
  dom.window.close();
});
