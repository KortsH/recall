import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBank, contentHash } from "../src/core/bank.ts";
import { variants } from "../src/core/questions.ts";
import { emptyProgress } from "../src/core/types.ts";
import { publicCard } from "../src/core/engine.ts";
import { revealAnswer, newSession } from "../src/core/study.ts";
import { selectVoice } from "../src/web/speech.tsx";
import { matchesSpokenWords } from "../src/core/speech.ts";

const word = {
  id: "bread",
  question: "bread",
  answer: "el pan",
  reversible: true,
  reverse: { question: "el pan", answer: "bread" },
  speech: { questionLang: "en-US", answerLang: "es-ES" },
};
test("language metadata roundtrips, swaps for reverse recall and cannot reset mastery", () => {
  const base = parseBank({ deck: "Language", questions: [word] }).questions[0];
  assert.equal(contentHash(base), contentHash({ ...base, speech: undefined }));
  const all = variants(base);
  assert.equal(
    all.find((v) => v.id === "written")!.speech!.answerLang,
    "es-ES",
  );
  assert.deepEqual(all.find((v) => v.id === "reverse")!.speech, {
    questionLang: "es-ES",
    answerLang: "en-US",
    practice: "question",
  });
  assert.throws(() =>
    parseBank({
      deck: "Language",
      questions: [
        { ...word, speech: { questionLang: "en", answerLang: "<script>" } },
      ],
    }),
  );
  const item = { question: base, revision: 1, progress: emptyProgress() };
  const s = newSession("d", [item], { mode: "test" });
  const card = publicCard(item, s.queue[0]);
  assert.ok(!("answer" in card));
  assert.ok(!JSON.stringify(card.speech).includes("pan"));
  const flash = newSession("d", [item], { mode: "flashcards" });
  assert.equal(
    revealAnswer(flash, item, { version: 0, revision: 1, response: "" }).speech
      ?.answerLang,
    "es-ES",
  );
  assert.throws(() =>
    revealAnswer(s, item, {
      version: 0,
      revision: 1,
      response: "",
      mental: true,
    }),
  );
});
test("word-recognition checks are literal, not confidence/accent scores", () => {
  assert.equal(matchesSpokenWords("¿Dónde está?", "dónde está!"), true);
  assert.equal(matchesSpokenWords("el pan", "el plan"), false);
  assert.equal(matchesSpokenWords("año", "ano"), false);
  assert.equal(matchesSpokenWords("brood", "bread"), false);
  assert.equal(matchesSpokenWords("brood", ""), false);
});
test("explicit language playback never substitutes an English or cloud voice", () => {
  const voices = [
    { lang: "en-US", localService: true },
    { lang: "es-MX", localService: true },
    { lang: "nl-NL", localService: false },
  ] as SpeechSynthesisVoice[];
  assert.equal(selectVoice(voices, "es-ES", true)?.lang, "es-MX");
  assert.equal(selectVoice(voices, "nl-NL", true), undefined);
  assert.equal(selectVoice(voices, "en-US", true)?.lang, "en-US");
});
