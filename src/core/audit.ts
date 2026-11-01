import type { Question } from "./types.ts";
const normal = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const stop = new Set(
  "a an the what how which is are does do of to and in for under its with from when can it this that".split(
    " ",
  ),
);
const tokens = (s: string) =>
  new Set(
    normal(s)
      .split(" ")
      .filter((t) => t.length > 1 && !stop.has(t)),
  );
export function auditQuestions(
  questions: Question[],
  existing: Question[] = [],
) {
  const findings: {
    kind: string;
    ids: string[];
    reason: string;
    score?: number;
  }[] = [];
  const all = [
    ...questions,
    ...existing.filter((q) => !questions.some((n) => n.id === q.id)),
  ];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i],
        b = all[j];
      if (a.topic !== b.topic) continue;
      if (normal(a.question) === normal(b.question))
        findings.push({
          kind:
            normal(a.answer) === normal(b.answer)
              ? "duplicate"
              : "conflicting_answers",
          ids: [a.id, b.id],
          reason: "Same normalised prompt.",
        });
      else {
        const x = tokens(a.question),
          y = tokens(b.question);
        const intersection = [...x].filter((t) => y.has(t)).length;
        const score = intersection / (new Set([...x, ...y]).size || 1);
        if (score >= 0.65)
          findings.push({
            kind: "possible_overlap",
            ids: [a.id, b.id],
            reason:
              "Similar wording; an external author should inspect the learning objective.",
            score: Math.round(score * 100),
          });
      }
    }
  const concepts = [...new Set(all.map((q) => q.concept))].map((concept) => {
    const qs = all.filter((q) => q.concept === concept);
    const recall = qs.filter((q) => (q.skill ?? "recall") === "recall");
    const application = qs.filter((q) => q.skill === "application");
    if (recall.length > 1)
      findings.push({
        kind: "concept_density",
        ids: recall.map((q) => q.id),
        reason: `${recall.length} recall objectives cover “${concept}”; review whether they can be consolidated.`,
      });
    return {
      concept,
      total: qs.length,
      recall: recall.length,
      application: application.length,
      ids: qs.map((q) => q.id),
    };
  });
  const application = questions.filter((q) => q.skill === "application").length;
  return {
    total: questions.length,
    recall: questions.length - application,
    application,
    applicationPercent: Math.round(
      (application / (questions.length || 1)) * 100,
    ),
    targetApplicationPercent: 60,
    concepts,
    findings,
    note: "Heuristic review aids, not semantic proof. Recall/application pairs are complementary; nothing is deleted automatically.",
  };
}
