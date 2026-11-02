import source from "../../examples/walkthrough.json";
import { parseBank } from "../core/schema.ts";
import { emptyProgress, type Item } from "../core/types.ts";
export const walkthroughBank = parseBank(source);
export const walkthroughSource = source;
export const newWalkthroughItems = (): Item[] =>
  walkthroughBank.questions.map((question) => ({
    question: structuredClone(question),
    revision: 1,
    progress: emptyProgress(),
  }));
export const walkthroughSteps = [
  {
    id: "basics",
    question: "guide-first",
    variant: "choice",
    fields: ["id", "question", "answer", "options", "correct"],
  },
  {
    id: "aliases",
    question: "guide-minutes",
    variant: "written",
    fields: ["acceptedAnswers"],
  },
  {
    id: "prose",
    question: "guide-prose",
    variant: "written",
    fields: ["rubric", "explanation"],
  },
  {
    id: "reverse",
    question: "guide-fifo",
    variant: "written",
    fields: ["reversible", "reverse"],
  },
  {
    id: "select",
    question: "guide-even",
    variant: "choice",
    fields: ["options", "correct"],
  },
  {
    id: "parts",
    question: "guide-even",
    variant: "written",
    fields: ["requiredParts"],
  },
  {
    id: "hint",
    question: "guide-backup",
    variant: "written",
    fields: ["hint"],
  },
  {
    id: "matching",
    question: "guide-actions",
    variant: "match-actions",
    fields: ["variants", "type", "pairs"],
  },
  {
    id: "flashcards",
    question: "guide-fifo",
    variant: "flashcard",
    fields: ["question", "answer"],
  },
  {
    id: "dependencies",
    question: "guide-timer",
    variant: "written",
    fields: ["depends_on"],
  },
  {
    id: "metadata",
    question: "guide-timer",
    variant: "written",
    fields: ["topic", "concept", "skill", "difficulty", "tags"],
  },
  {
    id: "defaults",
    question: "guide-minimal",
    variant: "learn-choice",
    fields: [
      "schemaVersion",
      "description",
      "topic",
      "concept",
      "difficulty",
      "skill",
      "reversible",
      "variants",
    ],
  },
  {
    id: "sharing",
    question: "guide-backup",
    variant: "written",
    fields: ["id", "flag"],
  },
  {
    id: "make",
    question: "guide-first",
    variant: "choice",
    fields: ["deck", "questions"],
  },
] as const;
export const starterExample = {
  deck: "My first quiz",
  questions: [
    {
      id: "topic-001",
      question: "What is the main idea?",
      answer: "A clear model answer.",
    },
  ],
};
