import React, { useEffect, useRef, useState } from "react";
import { Volume2, Square } from "lucide-react";

/** Device voices only: quiz text is never sent to a remote speech service by Recall. */
export const localVoices = (voices: SpeechSynthesisVoice[]) =>
  voices.filter((v) => v.localService);
export function ReadAloud({
  text,
  label = "Read aloud",
}: {
  text: string;
  label?: string;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const update = () => setVoices(localVoices(synth.getVoices()));
    const stopped = () => {
      setSpeaking(false);
      utterance.current = null;
    };
    update();
    synth.addEventListener("voiceschanged", update);
    window.addEventListener("recall-stop-reading", stopped);
    return () => {
      synth.removeEventListener("voiceschanged", update);
      window.removeEventListener("recall-stop-reading", stopped);
      if (utterance.current) synth.cancel();
    };
  }, [supported]);
  useEffect(() => {
    if (utterance.current && supported) window.speechSynthesis.cancel();
    utterance.current = null;
    setSpeaking(false);
  }, [text, supported]);
  if (!supported) return null;
  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const language =
      document.documentElement.lang || navigator.language || "en";
    const voice =
      voices.find((v) =>
        v.lang.toLowerCase().startsWith(language.split("-")[0].toLowerCase()),
      ) ?? voices[0];
    if (!voice) return;
    window.dispatchEvent(new Event("recall-stop-reading"));
    synth.cancel();
    const next = new SpeechSynthesisUtterance(text);
    utterance.current = next;
    next.voice = voice;
    next.lang = voice.lang;
    next.onend = next.onerror = () => {
      setSpeaking(false);
      utterance.current = null;
    };
    setSpeaking(true);
    synth.speak(next);
  }
  return (
    <button
      type="button"
      className="text-button read-aloud"
      aria-pressed={speaking}
      disabled={!voices.length}
      title={
        voices.length
          ? "Uses a voice installed on this device"
          : "No local speech voice is available in this browser"
      }
      onClick={toggle}
    >
      {speaking ? <Square size={15} /> : <Volume2 size={16} />}{" "}
      {speaking ? "Stop reading" : label}
    </button>
  );
}
