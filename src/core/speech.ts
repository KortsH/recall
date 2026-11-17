/** Presentation metadata only; it never changes grading or mastery. */
export interface SpeechSettings {
  questionLang: string;
  answerLang: string;
  practice?: "question" | "answer";
}
export function reverseSpeech(s?: SpeechSettings): SpeechSettings | undefined {
  return (
    s && {
      questionLang: s.answerLang,
      answerLang: s.questionLang,
      practice: s.practice === "question" ? "answer" : "question",
    }
  );
}
export function spokenWords(text: string) {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function matchesSpokenWords(expected: string, heard: string) {
  return !!spokenWords(heard) && spokenWords(expected) === spokenWords(heard);
}
