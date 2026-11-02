import React, { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { availableLanguages, getLanguage, tr, useLanguage } from "./i18n.ts";

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export interface RecognitionConstructor {
  new (): Recognition;
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
}
const preferenceKey = "recall-dictation";
const speechLanguage = (code: string) =>
  code === "en" ? "en-US" : code === "et" ? "et-EE" : code;
function preferences() {
  try {
    const p = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
    return {
      remote: p?.remote === true,
      lang:
        typeof p?.lang === "string" &&
        /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(p.lang)
          ? speechLanguage(p.lang)
          : speechLanguage(getLanguage()),
    };
  } catch {
    return { remote: false, lang: speechLanguage(getLanguage()) };
  }
}
const append = (prefix: string, text: string) =>
  [prefix.trimEnd(), text.trim()].filter(Boolean).join(" ").slice(0, 16000);

/** Explicit, continuous browser dictation. Writes text only; never grades or submits automatically. */
export function Dictation({
  value,
  onChange,
  onSubmit,
  onReady,
  disabled = false,
  draftKey,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onReady?: () => void;
  disabled?: boolean;
  draftKey: string;
}) {
  useLanguage();
  const [prefs, setPrefs] = useState(preferences);
  const [phase, setPhase] = useState<"idle" | "checking" | "listening">("idle");
  const [error, setError] = useState("");
  const answer = useRef(value),
    changeAnswer = useRef(onChange),
    submitAnswer = useRef(onSubmit),
    focusAnswer = useRef(onReady);
  changeAnswer.current = onChange;
  submitAnswer.current = onSubmit;
  focusAnswer.current = onReady;
  useEffect(() => {
    answer.current = value;
  }, [value]);
  // Preserve an uninserted preview from the previous app version on this exact card.
  useEffect(() => {
    try {
      const key = `recall-dictation-preview:${draftKey}`,
        old = sessionStorage.getItem(key);
      if (old) {
        if (!answer.current.endsWith(old.trim())) {
          answer.current = append(answer.current, old);
          changeAnswer.current(answer.current);
        }
        sessionStorage.removeItem(key);
      }
    } catch {
      /* Normal answer drafts remain available without legacy preview storage. */
    }
  }, [draftKey]);
  const active = useRef<Recognition | null>(null),
    generation = useRef(0),
    wanted = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    options = useRef<HTMLDetailsElement>(null);
  const speechWindow =
    typeof window === "undefined"
      ? undefined
      : (window as Window & {
          SpeechRecognition?: RecognitionConstructor;
          webkitSpeechRecognition?: RecognitionConstructor;
        });
  const Constructor =
    speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition;
  const supported = !!Constructor && window.isSecureContext;
  function dispose() {
    wanted.current = false;
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const r = active.current;
    active.current = null;
    if (r) {
      r.onresult = r.onerror = r.onend = null;
      try {
        r.abort();
      } catch {
        /* Already stopped. */
      }
    }
  }
  function cancel() {
    dispose();
    setPhase("idle");
  }
  useEffect(() => {
    const stop = () => cancel();
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("recall-stop-dictation", stop);
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      dispose();
      window.removeEventListener("recall-stop-dictation", stop);
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);
  function change(next: typeof prefs) {
    cancel();
    setError("");
    setPrefs(next);
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      /* Optional preference storage. */
    }
  }
  async function start() {
    if (!supported || disabled || phase !== "idle") return;
    dispose();
    const token = generation.current;
    wanted.current = true;
    setError("");
    setPhase("checking");
    let emptyEnds = 0;
    const valid = (r?: Recognition) =>
      token === generation.current &&
      wanted.current &&
      (!r || active.current === r);
    const fail = (
      key:
        | "dictation.localUnavailable"
        | "dictation.denied"
        | "dictation.languageUnavailable"
        | "dictation.failed",
    ) => {
      if (valid()) {
        cancel();
        setError(tr(key));
      }
    };
    const begin = (r: Recognition, first = false) => {
      if (!valid()) return;
      const prefix = answer.current;
      let received = false;
      r.lang = prefs.lang;
      r.continuous = true;
      r.interimResults = true;
      if ("processLocally" in r) r.processLocally = !prefs.remote;
      active.current = r;
      r.onresult = (event) => {
        if (!valid(r)) return;
        const text = Array.from(
          event.results,
          (result) => result[0]?.transcript ?? "",
        )
          .join(" ")
          .trim();
        received ||= !!text;
        answer.current = append(prefix, text);
        changeAnswer.current(answer.current);
      };
      r.onerror = (event) => {
        if (!valid(r)) return;
        // Silence is a thinking pause; the subsequent end event restarts capture.
        if (event.error === "no-speech") return;
        fail(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "dictation.denied"
            : event.error === "language-not-supported"
              ? "dictation.languageUnavailable"
              : "dictation.failed",
        );
      };
      r.onend = () => {
        if (!valid(r)) return;
        r.onresult = r.onerror = r.onend = null;
        active.current = null;
        emptyEnds = received ? 0 : emptyEnds + 1;
        // Browsers may disconnect despite continuous=true. Retain the user's intent,
        // but avoid a tight restart loop on silent or malfunctioning engines.
        timer.current = setTimeout(
          () => {
            timer.current = null;
            if (!valid()) return;
            try {
              begin(new Constructor!());
            } catch {
              fail("dictation.failed");
            }
          },
          Math.min(2000, 250 * Math.max(1, emptyEnds)),
        );
      };
      r.start();
      if (!valid(r)) return;
      setPhase("listening");
      if (first) {
        if (options.current) options.current.open = false;
        focusAnswer.current?.();
      }
    };
    try {
      const r = new Constructor!();
      if (!prefs.remote) {
        if (!("processLocally" in r)) {
          fail("dictation.localUnavailable");
          return;
        }
        r.processLocally = true;
        if (Constructor!.available) {
          const result = await Constructor!.available({
            langs: [prefs.lang],
            processLocally: true,
          });
          if (!valid()) return;
          if (result !== "available") {
            fail("dictation.localUnavailable");
            return;
          }
        }
      }
      if (!valid()) return;
      window.dispatchEvent(new Event("recall-stop-reading"));
      window.speechSynthesis?.cancel();
      begin(r, true);
    } catch {
      fail("dictation.failed");
    }
  }
  const languages = [
    ...new Set([
      prefs.lang,
      ...availableLanguages.map((l) => speechLanguage(l.code)),
      navigator.language,
    ]),
  ];
  const names = new Intl.DisplayNames([getLanguage()], { type: "language" });
  return (
    <div
      className="dictation"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (
          phase === "listening" &&
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          cancel();
          submitAnswer.current();
        }
      }}
    >
      {supported ? (
        <>
          <div className="dictation-tools">
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              aria-pressed={phase === "listening"}
              onClick={() => {
                if (phase !== "idle") cancel();
                else void start();
              }}
            >
              {phase === "listening" ? <Square size={15} /> : <Mic size={16} />}
              {phase === "listening"
                ? tr("dictation.stop")
                : phase === "checking"
                  ? tr("dictation.checking")
                  : tr("dictation.start")}
            </button>
            <details ref={options}>
              <summary>{tr("dictation.options")}</summary>
              <label>
                {tr("dictation.language")}
                <select
                  disabled={disabled || phase !== "idle"}
                  value={prefs.lang}
                  onChange={(e) => change({ ...prefs, lang: e.target.value })}
                >
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>
                      {names.of(lang) ?? lang}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={prefs.remote}
                  disabled={disabled || phase !== "idle"}
                  onChange={(e) =>
                    change({ ...prefs, remote: e.target.checked })
                  }
                />
                {tr("dictation.allowBrowser")}
              </label>
            </details>
          </div>
          <p className="dictation-privacy">
            {prefs.remote
              ? tr("dictation.remotePrivacy")
              : tr("dictation.localPrivacy")}
          </p>
          <span role="status">
            {phase === "listening" ? tr("dictation.listening") : error}
          </span>
        </>
      ) : (
        <p className="dictation-privacy">{tr("dictation.unsupported")}</p>
      )}
    </div>
  );
}
