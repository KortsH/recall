# Question banks

For a complete first-quiz walkthrough, copyable LLM prompt and UI/CLI import examples, start with [Make a quiz from your notes](../README.md#make-a-quiz-from-your-notes).

## Optional cues and review flags

Questions and explicit variants may include a nonempty `hint` string. Use a cue, not a disguised answer. An explicit variant's hint overrides the objective hint. Hints are requested explicitly on written/flashcard cards; Test disallows them. Assistance is recorded before revealing the cue, persists across reload/sync, and is exported as `Attempt.hintUsed` plus optional `Progress.assisted`. Correct assisted answers count in accuracy but do not increase streak, recall or recognition credit. Existing mastery remains; wrong assisted answers lose mastery normally. An assisted answer receives a short review interval. Hint-only changes preserve semantic hashes and learning progress.

A question may include `flag: { "note": "Reason to review", "allowDependents": false }`. It is excluded from every study queue, including Cram/Test prerequisite overrides. Follow-ups stay blocked on this flagged parent by default, even if it was previously mastered. Explicit `allowDependents: true` bypasses this parent requirement only when its own upstream prerequisites are satisfied; all other parents and downstream mastery requirements remain. This never changes the parent's mastery. Remove `flag` to restore normal rules. Flags/notes are metadata, included in exports, and do not reset progress. Preserve them when generating updated banks; importing a replacement question object without its flag removes it.

The UI previews direct and transitive follow-ups before saving a flag. `questions <deck> --flagged with --json` exposes notes for external review; `flag <deck> <id>` shows the question and downstream prompts/answers. Use `--note`, `--allow-dependents`, `--keep-dependents-locked` or `--clear` to edit it. Ordinary archive/restore still validates graph integrity; flagging does not remove graph nodes.

`organize <deck>` previews bulk topic moves; `--apply` commits all or none, preserving progress, revisions and dependencies. Select IDs, a source topic, uncategorized cards or a search, or supply a JSON move array with `--file`. An optional `fromTopic` guards against overwriting a concurrent move. The uncategorized UI label corresponds to JSON topic `General`. Library and CLI filters use the same status/difficulty/hints/flags/sort implementation.

## Prerequisite learning

Use `depends_on: ["foundation-id", "another-id"]` on a question. This is an AND relationship: every listed objective must meet the existing mastery threshold. Empty or omitted arrays are immediately eligible. References use stable IDs in the same deck and may cross topics. Put prerequisites on objectives, not format variants.

Model a useful progression: definition → distinctions/variant definitions → application. Do not invent extra model variants or create cycles. Inspect the existing bank and its prerequisite status before generating additions. A single application can require several foundations. Dependencies do not establish mastery or change due dates.

Learn always respects dependencies. It keeps a working set of up to 12 unlocked objectives by default (UI choices: 8, 12 or 16). Every new objective starts with single-answer recognition; after correct recognition it moves to recall, with at least two successful recalls needed for mastery. Mistakes keep the objective in the set and bring back recognition. No fresh objectives enter until the current set is mastered; newly unlocked objectives join a subsequent set during the same session. The session continues through the selected topic/deck, rather than ending at the working-set size. A single available foundation repeats after feedback until it is mastered, then its eligible children can enter. Save & leave preserves the set and evidence. Cram retains its bounded session/retry behavior.

Review becoming due does not remove mastery or relock children; an incorrect answer can. Test/Cram respect prerequisites by default, with an explicit **Include locked questions** / `--ignore-prerequisites` override. Learn and Flashcards reject that override.

```sh
recall prerequisites "My Deck"
recall prerequisites "My Deck" application-id --set definition-id,variant-id
recall prerequisites "My Deck" application-id --add another-id
recall prerequisites "My Deck" application-id --remove another-id
recall prerequisites "My Deck" application-id --clear
recall session-start "My Deck" --mode cram --ignore-prerequisites
```

The inspection command prints `unlocked`, `depends_on`, and `blockedBy`. Topic statistics include locked counts. The library explains missing prerequisites, and the editor supports the IDs directly. Import, edit, restore and archive validate the prospective active graph atomically: unknown/archived parents, self-links, duplicate edges and cycles are rejected. Remove or redirect dependents before archiving their foundation. A replacement cannot leave dangling links.

`validate file.json` checks a complete bank. Use `--partial` only for a partial update whose referenced parents already exist; import still validates the entire resulting deck. CSV/TSV can supply `depends_on` separated by `|`. Optional top-level `dependency_semantics` is accepted as descriptive metadata. Dependency-only edits preserve question revisions, attempts and progress. Export includes the dependency graph.

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

Learn can present an existing question as recognition without changing its bank data. It prefers an authored single-choice variant; otherwise it builds options from distinct existing answers, preferring the same topic and excluding known aliases. No new facts/questions are generated. Small banks use fewer choices; if no distractor exists, the model answer and an explicit “I don’t know yet” choice provide the introductory step. Review distractor suitability for your material; authored choices remain preferable for subtle overlapping definitions. `learn-choice` is reserved for this session-only projection and never changes content hashes or question revisions.

Each record provides a written question and flashcard automatically. `options` adds a choice question. `correct` is a list of exact option strings; omit it for a single correct option matching `answer`. Multiple correct strings create a multiple-select question. Distractors must be plausible and demonstrably wrong under the stated assumptions.

Written grading uses one of:

- `acceptedAnswers`: explicit whole-answer aliases. Case, whitespace and limited harmless punctuation are normalised. Mathematical operators, signs and negation are preserved.
- `requiredParts`: one alias list per required part. The learner supplies one part per semicolon/newline, in any order. Every part must match; extra assertions are rejected.
- Neither: model-answer self-assessment. Add `rubric` as a list of expected points. Do not use exact aliases for open-ended prose.

Flashcards always use self-assessment. Ratings are `again`, `hard`, `good`, `easy`. Again means unsuccessful recall. Hard means correct with effort, with an earlier review.

## Explicit variants

Each variant has unique `id`, `type`, `question`, `answer` and optional `explanation`. IDs `choice`, `written`, `flashcard`, and `learn-choice` are reserved for generated formats. Supported types:

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
