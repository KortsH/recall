export type Format =
  "multiple_choice" | "multiple_select" | "written" | "flashcard" | "matching";
export interface Variant {
  skill?: "recall" | "application";
  id: string;
  type: Format;
  question: string;
  answer: string;
  options?: string[];
  correct?: string[];
  acceptedAnswers?: string[];
  requiredParts?: string[][];
  pairs?: { left: string; right: string }[];
  explanation?: string;
  rubric?: string[];
}
export interface Question {
  depends_on?: string[];
  skill?: "recall" | "application";
  id: string;
  topic: string;
  concept: string;
  question: string;
  answer: string;
  explanation: string;
  difficulty: number;
  tags: string[];
  options?: string[];
  correct?: string[];
  acceptedAnswers?: string[];
  requiredParts?: string[][];
  rubric?: string[];
  variants: Variant[];
}
export interface Bank {
  schemaVersion: 1;
  deck: string;
  description: string;
  questions: Question[];
}
export interface Progress {
  skills?: Partial<
    Record<"recall" | "application", { attempts: number; correct: number }>
  >;
  attempts: number;
  correct: number;
  wrong: number;
  streak: number;
  recalls: number;
  recognition: number;
  selfAssessed: number;
  mastered: boolean;
  lastReviewed: string | null;
  nextReview: string | null;
}
export interface Item {
  archived?: boolean;
  question: Question;
  revision: number;
  progress: Progress;
}
export interface QueueEntry {
  choiceOptions?: string[];
  concept?: string;
  questionId: string;
  variantId: string;
  format: Format;
  retry: number;
}
export interface Session {
  learningEpoch?: number;
  learningReset?: boolean;
  learning?: { version: 1; size: number; round: number; ids: string[] };
  targetCount?: number;
  ignorePrerequisites?: boolean;
  id: string;
  deckId: string;
  mode: "learn" | "cram" | "flashcards" | "test";
  topic: string | null;
  queue: QueueEntry[];
  cursor: number;
  answers: Attempt[];
  createdAt: string;
  deadline: string | null;
  finished: boolean;
  version: number;
  revealed?: { cursor: number; response: unknown };
}
export interface Attempt {
  invalidated?: boolean;
  skill?: "recall" | "application";
  questionId: string;
  variantId: string;
  format: Format;
  response: unknown;
  correct: boolean | null;
  selfAssessed: boolean;
  rating?: string;
  revision: number;
  question: string;
  answer: string;
  explanation: string;
  topic: string;
  rubric?: string[];
  at: string;
}
export interface PublicCard {
  questionId: string;
  variantId: string;
  revision: number;
  format: Format;
  topic: string;
  concept: string;
  question: string;
  options?: string[];
  left?: string[];
  right?: string[];
  selfGrade: boolean;
}
export const emptyProgress = (): Progress => ({
  attempts: 0,
  correct: 0,
  wrong: 0,
  streak: 0,
  recalls: 0,
  recognition: 0,
  selfAssessed: 0,
  mastered: false,
  lastReviewed: null,
  nextReview: null,
});
