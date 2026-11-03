# Pictures and equations

Use Recall's guided sample for interactive **Read a picture** and **Render an equation** chapters. The [original example bank](../examples/media-math.json) is ready to import. Pictures and equation rendering work on the website, Windows and Android, including downloaded/device-only study.

## Easiest route: an ordinary online assistant and the editor

1. Give the assistant your notes, graph or equation and the README's question-bank prompt. Ask it to write the question, model answer and checking rules. Check its interpretation against the source.
2. Ask it to leave image fields out. It should **not invent base64 data**, remote URLs or an image-generation setting. Copy its JSON into Recall's import preview and import it.
3. In the question library, edit the question. Use **Question picture** for the graph to read, or **Model-answer picture** for a worked solution. Choose a PNG, JPEG or WebP file, add the required description and an optional caption, then preview and save.
4. Export the quiz for your friend. The picture is already inside the file; no separate image upload, folder, account or public server is needed. Old installations should update before importing image banks.

The editor accepts source pictures up to 10 MiB and 16 megapixels, resizes to at most 2048 pixels on the longer edge, re-encodes to remove file metadata, and fits each embedded picture under 1 MiB. Inspect the preview, especially small graph labels. The full shareable file must stay under 5 MiB; reduce pictures or split a large deck if necessary. Clicking a picture enlarges it. Descriptions should convey the useful visual information without accidentally revealing an answer the student is meant to work out.

## LaTeX in JSON

Plain text keeps working. Use `$...$` or `\(...\)` for inline math, and `$$...$$` or `\[...\]` for a separate equation. In the editor's normal text fields, type ordinary LaTeX backslashes. **Inside JSON strings, escape each backslash as `\\`.** The editor preview shows the rendered result before saving.

Complete importable example:

```json
{
  "deck": "A little algebra",
  "questions": [
    {
      "id": "slope-001",
      "question": "A line passes through $(0,1)$ and $(2,5)$. What is its slope?",
      "answer": "\\[m=\\frac{5-1}{2-0}=2\\]",
      "acceptedAnswers": ["2", "m=2"],
      "reversible": false
    },
    {
      "id": "roots-001",
      "question": "Find both solutions of $x^2-5x+6=0$.",
      "answer": "$(x-2)(x-3)=0$, so $x=2$ or $x=3$.",
      "requiredParts": [["2", "x=2"], ["3", "x=3"]],
      "reversible": false
    }
  ]
}
```

Recall uses bundled KaTeX and fonts, not an external math service. Prompts, model/submitted answers, explanations, captions and choice options render formulas. Unsupported/invalid expressions remain readable source instead of breaking the card. HTML commands, remote image commands and links are not trusted; raw HTML is treated as text. See [KaTeX's supported syntax](https://katex.org/docs/supported).

Rendering does **not** provide symbolic algebra checking. `x+x`, `2x` and `2*x` are equivalent mathematically but need explicit aliases if automatically checked. Use `requiredParts` for separately required exact answers (semicolon/newline separated), or omit exact-check fields and use a rubric/self-assessment for proofs and explanations. Multiple-choice `correct` values still have to match the complete raw option strings, including any math delimiters.

## Image fields

Each question may have optional `image` and `answerImage` objects. The same fields work on authored variants and inside `reverse`. Ordinary variants inherit the base images unless they supply their own. Reverse questions use only their own images; forward pictures are not automatically reversed. To use a picture on just one format, attach it to that authored variant rather than the base question.

| Field | Meaning |
| --- | --- |
| `src` | Required embedded `data:image/png;base64,...`, `data:image/jpeg;base64,...` or `data:image/webp;base64,...` string. Use the editor or CLI to create it. |
| `alt` | Required 1–2000-character description, used by screen readers and the enlarged view. |
| `caption` | Optional visible caption, up to 2000 characters. Supports the same equation delimiters. |

Normal import accepts embedded raster data only. It rejects local paths, HTTP URLs, SVG/HTML, invalid image signatures, oversized files and excessive dimensions. Pictures are part of the question's semantic revision: changing them resets that objective's mastery, just as correcting its prompt would. Existing text-only banks keep their hashes/progress. Questions-only exports include pictures but omit learner progress by default.

The current unanswered card contains only its prompt picture. Model pictures appear after explicit reveal/feedback or after a Test is finished. Attempt history stores no duplicate base64 pictures; review projects images from the matching current question revision. If a question has since changed, its old attempt does not display the new picture as if it were the old one.

## CLI: pack local pictures for sharing

Authors/agents can work with relative files while preparing a bank. In an **unpacked draft**, `image.src` or `answerImage.src` may refer to a nearby file, for example:

```text
"image": {
  "src": "assets/line-graph.jpg",
  "alt": "A line passes through (0, 1) and (2, 5)."
}
```

This draft is not directly importable. Run:

```sh
npm run recall -- pack examples/media-math.source.json -o private/math.recall.json
npm run recall -- validate private/math.recall.json
```

`pack` reads only relative files inside the bank file's directory (including its subdirectories). Absolute paths, network sources, `..` escapes and symlinks escaping that directory are rejected. It embeds the bytes, validates the whole bank/dependency graph and writes a questions-only portable file. It connects to no server/database. CLI images must already be valid PNG/JPEG/WebP under 1 MiB; the editor handles resizing larger files. Packing uses the original file bytes, so prepare only the image content/metadata you intend to share.

Attach, preview or remove an image on an existing question:

```sh
npm run recall -- question-image "My quiz" graph-001 private/graph.png --alt "Axes and two labelled points" --dry-run
npm run recall -- question-image "My quiz" graph-001 private/graph.png --alt "Axes and two labelled points"
npm run recall -- question-image "My quiz" graph-001 private/solution.png --answer --alt "The worked solution"
npm run recall -- question-image "My quiz" graph-001 --answer --clear
```

Use `--variant reverse` or an authored variant id to target that format, and optional `--caption`. The normal CLI server selection and optimistic revision checks apply. You can also edit the full JSON through existing `question --file` or bank import commands; no media-specific backend is required.

## Mental-answer keyboard shortcut

On an open written practice question, blank **Enter** compares without typing; **Alt+5** does the same while the answer box is focused. Bare **5** works outside text inputs. Typing 5 inside a text box still enters 5. These shortcuts only reveal the model; they never award credit. Choose an honest rating afterward. Test keeps its normal no-reveal rule, and repeated/composition/browser-modifier events are ignored.
