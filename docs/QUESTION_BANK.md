# Question banks

The versioned JSON bank is independent of the UI. An externally generated file can be imported by the CLI or the browser. A question record is a learning objective; its formats share progress. Different prompts testing the same objective belong in `variants` rather than as unrelated duplicate records.

```json
{
  "schemaVersion": 1,
  "deck": "Principles of Data Protection",
  "description": "Core rules and applied practice",
  "questions": [{
    "id": "mac-blp-rules",
    "topic": "MAC",
    "concept": "Bell–LaPadula rules",
    "question": "State the two core BLP read/write restrictions.",
    "answer": "No Read Up; No Write Down",
    "options": ["No Read Up", "No Write Down", "No Read Down", "No Write Up"],
    "correct": ["No Read Up", "No Write Down"],
    "requiredParts": [["No Read Up", "Cannot read up"], ["No Write Down", "Cannot write down"]],
    "explanation": "These constrain confidentiality flows; other permissions may still be required.",
    "difficulty": 1,
    "tags": ["BLP", "rules"],
    "variants": [{
      "id": "name-from-rules",
      "type": "written",
      "question": "Which confidentiality model has these two rules? No Read Up; No Write Down.",
      "answer": "Bell–LaPadula",
      "acceptedAnswers": ["BLP", "Bell–LaPadula", "Bell-LaPadula"]
    }]
  }]
}
```

## Generated formats

Each record provides a written question and flashcard automatically. `options` adds a choice question. `correct` is a list of exact option strings; omit it for a single correct option matching `answer`. Multiple correct strings create a multiple-select question. Distractors must be plausible and demonstrably wrong under the stated assumptions.

Written grading uses one of:

- `acceptedAnswers`: explicit whole-answer aliases. Case, whitespace and limited harmless punctuation are normalised. Mathematical operators, signs and negation are preserved.
- `requiredParts`: one alias list per required part. The learner supplies one part per semicolon/newline, in any order. Every part must match; extra assertions are rejected.
- Neither: model-answer self-assessment. Add `rubric` as a list of expected points. Do not use exact aliases for open-ended prose.

Flashcards always use self-assessment. Ratings are `again`, `hard`, `good`, `easy`. Again means unsuccessful recall. Hard means correct with effort, with an earlier review.

## Explicit variants

Each variant has unique `id`, `type`, `question`, `answer` and optional `explanation`. IDs `choice`, `written`, and `flashcard` are reserved for generated formats. Supported types:

| Type | Additional fields |
| --- | --- |
| `multiple_choice` | `options`, optional single-item `correct` |
| `multiple_select` | `options`, `correct` |
| `written` | optional `acceptedAnswers`, `requiredParts`, or `rubric` |
| `flashcard` | no extra fields |
| `matching` | `pairs`: objects with unique `left` and `right` strings |

Scenarios and reverse recall are authored prompts using these formats. There is no automatic inference of inverse definitions or question generation at study time. A matching example:

```json
{
  "id": "match-directions",
  "type": "matching",
  "question": "Match each core BLP operation with its prohibited direction.",
  "answer": "Read → Up; Write → Down",
  "pairs": [{ "left": "Read", "right": "Up" }, { "left": "Write", "right": "Down" }]
}
```

## Updates and validation

Required: deck name, a non-empty question list, and each question's ID, prompt and model answer. Defaults: General topic, concept from prompt, difficulty 1, empty explanation/tags/variants. Legacy `type` fields for simple choice/written/flashcard records remain accepted; format capability is derived from the content, rather than restricting an objective to a single type.

Unknown fields, duplicate IDs, malformed matching pairs and choices whose correct answers are absent are rejected. JSON Schema handles structural checks; the CLI also checks cross-field consistency. A bank is validated before its transaction starts.

The deck name identifies the destination deck; `--deck` overrides it. IDs are unique within that deck. Imports normally update/add records and retain absent IDs. `--replace` archives absent active IDs; `--dry-run` previews counts and `archiveIds`. `--topic MAC` scopes replacement and rejects incoming records from other topics. Archived records leave the study queue and statistics but remain recoverable using `restore <deck> <id>`. Unchanged records retain progress; changed prompts/answers reset only the affected objective. Obsolete or archived revisions are excluded from results.

Use `concept` to group related objectives and `skill: "recall" | "application"` to distinguish remembering a principle from applying it. These are explicit authoring decisions; the scheduler separates related concepts when alternatives exist. `questions --json`, `audit`, and `audit --file incoming.json` let external agents inspect coverage before adding more questions. Exact prompt duplicates and probable wording/concept overlap are reported for review; useful recall/application pairs are retained. The compact foundation bank is 16 recall / 6 application; aim for roughly 40/60 in later banks without inventing redundant questions to meet a quota.

If an active session's explicit variant is removed by a correction, that card safely falls back to the current objective's written question.

Export the current deck before generating updates so the bank includes manual corrections. Never blindly reimport an old generated file over a corrected bank.
