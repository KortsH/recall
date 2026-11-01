import type { Question, Variant } from "./types.ts";

/** Browser-safe question projection. No filesystem, database, or Node dependencies. */
export function variants(q: Question): Variant[] {
  return [
    ...(q.options
      ? [
          {
            id: "choice",
            type:
              (q.correct?.length ?? 1) > 1
                ? "multiple_select"
                : "multiple_choice",
            question: q.question,
            answer: q.answer,
            options: q.options,
            correct: q.correct ?? [q.answer],
            skill: q.skill,
          } as Variant,
        ]
      : []),
    {
      id: "written",
      type: "written",
      question: q.question,
      answer: q.answer,
      acceptedAnswers: q.acceptedAnswers,
      requiredParts: q.requiredParts,
      rubric: q.rubric,
      skill: q.skill,
    },
    {
      id: "flashcard",
      type: "flashcard",
      question: q.question,
      answer: q.answer,
      skill: q.skill,
    },
    ...q.variants.map((v) => ({ ...v, skill: v.skill ?? q.skill })),
  ];
}
export function resolveVariant(q: Question, id: string): Variant {
  const all = variants(q);
  return all.find((v) => v.id === id) ?? all.find((v) => v.id === "written")!;
}
