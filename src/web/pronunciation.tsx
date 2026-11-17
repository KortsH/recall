import React, { useState } from "react";
import { ReadAloud } from "./speech.tsx";
import { Dictation } from "./dictation.tsx";
import { matchesSpokenWords, type SpeechSettings } from "../core/speech.ts";
import { tr, useLanguage } from "./i18n.ts";

/** Optional post-answer practice. Recognition is not a phonetic/accent score or learning credit. */
export function PronunciationPractice({
  question,
  answer,
  speech,
}: {
  question: string;
  answer: string;
  speech?: SpeechSettings;
}) {
  useLanguage();
  const [heard, setHeard] = useState("");
  const [matched, setMatched] = useState<boolean | null>(null);
  if (!speech) return null;
  const target = speech.practice === "question" ? question : answer;
  const lang =
    speech.practice === "question" ? speech.questionLang : speech.answerLang;
  function check() {
    window.dispatchEvent(new Event("recall-stop-dictation"));
    setMatched(matchesSpokenWords(target, heard));
  }
  return (
    <details
      className="pronunciation-practice"
      onKeyDown={(e) => e.stopPropagation()}
      onToggle={(e) => {
        if (!e.currentTarget.open) {
          window.dispatchEvent(new Event("recall-stop-dictation"));
          window.dispatchEvent(new Event("recall-stop-reading"));
          window.speechSynthesis?.cancel();
        }
      }}
    >
      <summary>{tr("pronunciation.title")}</summary>
      <p lang={lang} className="pronunciation-target">
        {target}
      </p>
      <div className="dictation-tools">
        <ReadAloud
          text={target}
          lang={lang}
          label={tr("pronunciation.listen")}
        />
        <ReadAloud
          text={target}
          lang={lang}
          rate={0.7}
          label={tr("pronunciation.slow")}
        />
      </div>
      <p className="dictation-privacy">{tr("pronunciation.disclaimer")}</p>
      <Dictation
        draftKey={`practice:${lang}:${target}`}
        language={lang}
        value={heard}
        label={tr("pronunciation.speak")}
        onChange={(value) => {
          setHeard(value);
          setMatched(null);
        }}
        onSubmit={check}
      />
      {heard && (
        <>
          <p lang={lang}>{tr("pronunciation.heard", { text: heard })}</p>
          <button type="button" className="button secondary" onClick={check}>
            {tr("pronunciation.check")}
          </button>
        </>
      )}
      {matched !== null && (
        <p role="status">
          {tr(matched ? "pronunciation.matched" : "pronunciation.retry")}
        </p>
      )}
    </details>
  );
}
