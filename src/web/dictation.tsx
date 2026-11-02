import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { availableLanguages, getLanguage, tr, useLanguage } from "./i18n.ts";

// The Web Speech API remains browser-specific and is absent from lib.dom in some TS versions.
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

/** Browser microphone only. No recording storage, uploads to Recall, or automatic answer submission. */
export function Dictation({
  onInsert,
  disabled = false,
  draftKey,
}: {
  onInsert: (text: string) => void;
  disabled?: boolean;
  draftKey: string;
}) {
  useLanguage();
  const [prefs, setPrefs] = useState(preferences);
  const [phase, setPhase] = useState<"idle" | "checking" | "listening">("idle");
  const [preview, setPreview] = useState(() => {
    try {
      return (
        sessionStorage
          .getItem(`recall-dictation-preview:${draftKey}`)
          ?.slice(0, 16000) ?? ""
      );
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      const key = `recall-dictation-preview:${draftKey}`;
      if (preview) sessionStorage.setItem(key, preview);
      else sessionStorage.removeItem(key);
    } catch {
      /* Editing still works without browser storage. */
    }
  }, [draftKey, preview]);
  const [error, setError] = useState("");
  const active = useRef<Recognition | null>(null),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      /* Still usable without saved preferences. */
    }
  }
  async function start() {
    if (!supported || disabled || phase !== "idle") return;
    dispose();
    const token = generation.current;
    const prefix = preview.trimEnd();
    setError("");
    setPhase("checking");
    try {
      const r = new Constructor!();
      if (!prefs.remote) {
        if (!("processLocally" in r)) {
          setError(tr("dictation.localUnavailable"));
          setPhase("idle");
          return;
        }
        r.processLocally = true;
        if (Constructor!.available) {
          const result = await Constructor!.available({
            langs: [prefs.lang],
            processLocally: true,
          });
          if (token !== generation.current) return;
          if (result !== "available") {
            setError(tr("dictation.localUnavailable"));
            setPhase("idle");
            return;
          }
        }
      } else if ("processLocally" in r) r.processLocally = false;
      if (token !== generation.current) return;
      window.dispatchEvent(new Event("recall-stop-reading"));
      window.speechSynthesis?.cancel();
      r.lang = prefs.lang;
      r.continuous = false;
      r.interimResults = true;
      active.current = r;
      r.onresult = (event) => {
        if (token !== generation.current) return;
        const transcript = Array.from(
          event.results,
          (result) => result[0]?.transcript ?? "",
        )
          .join(" ")
          .trim();
        setPreview(
          [prefix, transcript].filter(Boolean).join(" ").slice(0, 16000),
        );
      };
      r.onerror = (event) => {
        if (token !== generation.current) return;
        setError(
          tr(
            event.error === "not-allowed" ||
              event.error === "service-not-allowed"
              ? "dictation.denied"
              : event.error === "language-not-supported"
                ? "dictation.languageUnavailable"
                : event.error === "no-speech"
                  ? "dictation.noSpeech"
                  : "dictation.failed",
          ),
        );
        cancel();
      };
      r.onend = () => {
        if (token === generation.current) cancel();
      };
      r.start();
      if (token !== generation.current) return;
      setPhase("listening");
      timer.current = setTimeout(() => {
        if (active.current === r) {
          try {
            r.stop();
            timer.current = setTimeout(() => {
              if (active.current === r) cancel();
            }, 5000);
          } catch {
            cancel();
          }
        }
      }, 60000);
    } catch {
      if (token === generation.current) {
        cancel();
        setError(tr("dictation.failed"));
      }
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
    <div className="dictation" onKeyDown={(e) => e.stopPropagation()}>
      {supported ? (
        <>
          <div className="dictation-tools">
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              aria-pressed={phase === "listening"}
              onClick={() => {
                if (phase === "listening") {
                  try {
                    active.current?.stop();
                  } catch {
                    cancel();
                  }
                } else if (phase === "checking") cancel();
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
            <details>
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
              <label className="dictation-remote">
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
          {preview && (
            <div className="dictation-preview">
              <label>
                {tr("dictation.preview")}
                <textarea
                  rows={3}
                  value={preview}
                  disabled={phase !== "idle"}
                  onChange={(e) => setPreview(e.target.value)}
                />
              </label>
              <p>{tr("dictation.review")}</p>
              <button
                type="button"
                className="button subtle"
                disabled={disabled || phase !== "idle" || !preview.trim()}
                onClick={() => {
                  onInsert(preview.trim());
                  setPreview("");
                }}
              >
                {tr("dictation.insert")}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => {
                  cancel();
                  setPreview("");
                }}
              >
                <X size={14} />
                {tr("dictation.discard")}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="dictation-privacy">{tr("dictation.unsupported")}</p>
      )}
    </div>
  );
}
