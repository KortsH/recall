import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Info,
  Copy,
  RotateCcw,
} from "lucide-react";
import { tr, useLanguage, type MessageKey } from "./i18n.ts";
import {
  grade,
  publicCard,
  updateProgress,
  learningEntry,
} from "../core/engine.ts";
import { evaluateAttempt } from "../core/study.ts";
import { resolveVariant, recallDirection } from "../core/questions.ts";
import { prerequisiteStatus } from "../core/prerequisites.ts";
import type { Attempt, Item } from "../core/types.ts";
import { emptyProgress } from "../core/types.ts";
import { SubmittedAnswer } from "./answers.tsx";
import { saveJson } from "./files.ts";
import {
  newWalkthroughItems,
  starterExample,
  walkthroughSource,
  walkthroughSteps,
} from "./walkthrough-data.ts";

export function Walkthrough({ onClose }: { onClose: () => void }) {
  useLanguage();
  const [index, setIndex] = useState(0),
    [items, setItems] = useState(newWalkthroughItems),
    [direction, setDirection] = useState(false),
    [notice, setNotice] = useState("");
  const title = useRef<HTMLHeadingElement>(null),
    currentChapter = useRef<HTMLButtonElement>(null),
    prompt = useRef<HTMLTextAreaElement>(null);
  const step = walkthroughSteps[index],
    item = items.find((i) => i.question.id === step.question)!;
  const key = (suffix: string) => `guide.${step.id}.${suffix}` as MessageKey;
  const variant =
    direction && item.question.reversible
      ? step.variant === "flashcard"
        ? "reverse-flashcard"
        : "reverse"
      : step.variant;
  const promptText = tr("guide.aiPrompt", {
    example: JSON.stringify(starterExample, null, 2),
  });
  useEffect(() => {
    currentChapter.current?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
    window.scrollTo({ top: 0 });
  }, [index]);
  function go(next: number) {
    setDirection(false);
    setNotice("");
    setIndex(next);
  }
  const source = walkthroughSource.questions.find(
    (q) => q.id === step.question,
  )!;
  const shownJson =
    step.id === "make"
      ? starterExample
      : step.id === "defaults"
        ? { deck: walkthroughSource.deck, questions: [source] }
        : step.id === "sharing"
          ? {
              ...source,
              flag: { note: tr("guide.flagExample"), allowDependents: false },
            }
          : source;
  return (
    <main className="walkthrough">
      <header className="guide-header">
        <button className="text-button" onClick={onClose}>
          <ArrowLeft size={16} />
          {tr("guide.backApp")}
        </button>
        <strong>{tr("guide.title")}</strong>
        <button
          className="text-button"
          onClick={() => {
            setItems(newWalkthroughItems());
            go(0);
          }}
        >
          <RotateCcw size={15} />
          {tr("guide.restart")}
        </button>
      </header>
      {index === 0 && (
        <section className="guide-intro">
          <span className="eyebrow">{tr("guide.eyebrow")}</span>
          <h1>{tr("guide.heading")}</h1>
          <p>{tr("guide.intro")}</p>
          <small>{tr("guide.private")}</small>
        </section>
      )}
      <nav className="guide-steps" aria-label={tr("guide.chapters")}>
        {walkthroughSteps.map((s, n) => (
          <button
            key={s.id}
            ref={n === index ? currentChapter : undefined}
            aria-current={n === index ? "step" : undefined}
            onClick={() => go(n)}
          >
            <span>{n + 1}</span>
            {tr(`guide.${s.id}.title` as MessageKey)}
          </button>
        ))}
      </nav>
      <section className="guide-lesson" aria-labelledby="guide-lesson-title">
        <div className="guide-lesson-heading">
          <div>
            <span className="eyebrow">
              {tr("guide.position", {
                number: index + 1,
                total: walkthroughSteps.length,
              })}
            </span>
            <h2 id="guide-lesson-title" tabIndex={-1} ref={title}>
              {tr(key("title"))}
            </h2>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              try {
                saveJson("Recall-guided-sample.json", walkthroughSource);
                setNotice(tr("guide.downloaded"));
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          >
            <Download size={16} />
            {tr("guide.download")}
          </button>
        </div>
        <p className="guide-description">{tr(key("body"))}</p>
        <div className="guide-columns">
          <div className="guide-practice">
            {step.id === "make" ? (
              <section className="guide-prompt">
                <h3>{tr("guide.chatTitle")}</h3>
                <ol>
                  <li>{tr("guide.chatOne")}</li>
                  <li>{tr("guide.chatTwo")}</li>
                  <li>{tr("guide.chatThree")}</li>
                </ol>
                <textarea
                  aria-label={tr("guide.promptLabel")}
                  readOnly
                  ref={prompt}
                  value={promptText}
                  rows={15}
                />
                <button
                  className="button primary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(promptText);
                      setNotice(tr("guide.copied"));
                    } catch {
                      prompt.current?.focus();
                      prompt.current?.select();
                      setNotice(tr("guide.selectCopy"));
                    }
                  }}
                >
                  <Copy size={16} />
                  {tr("guide.copyPrompt")}
                </button>
              </section>
            ) : (
              <>
                {item.question.reversible && (
                  <div
                    className="guide-directions"
                    role="group"
                    aria-label={tr("guide.direction")}
                  >
                    <button
                      className="button secondary"
                      aria-pressed={!direction}
                      onClick={() => setDirection(false)}
                    >
                      {tr("guide.forward")}
                    </button>
                    <button
                      className="button secondary"
                      aria-pressed={direction}
                      onClick={() => setDirection(true)}
                    >
                      {tr("guide.reverseDirection")}
                    </button>
                  </div>
                )}
                {step.id === "metadata" || step.id === "sharing" ? (
                  <article className="guide-card">
                    <span className="topic-tag">{item.question.topic}</span>
                    <h3>{item.question.question}</h3>
                    <p>{tr(key("why"))}</p>
                  </article>
                ) : (
                  <QuestionPreview
                    key={`${index}:${variant}`}
                    item={item}
                    items={items}
                    variantId={variant}
                    onProgress={(updated) =>
                      setItems((current) =>
                        current.map((i) =>
                          i.question.id === updated.question.id ? updated : i,
                        ),
                      )
                    }
                    onFoundation={() => go(1)}
                  />
                )}
              </>
            )}
          </div>
          <aside className="guide-explanation">
            <details className="guide-feature">
              <summary>
                <Info size={17} />
                {step.id === "reverse"
                  ? tr("guide.reversibleNotice")
                  : tr("guide.featureNotice")}
              </summary>
              <p>{tr(key("why"))}</p>
              <strong>{tr("guide.defaultsLabel")}</strong>
              <p>{tr(key("defaults"))}</p>
              <span className="eyebrow">{tr("guide.fieldsLabel")}</span>
              <div className="guide-fields">
                {step.fields.map((field) => (
                  <code key={field}>{field}</code>
                ))}
              </div>
            </details>
            <details className="guide-json">
              <summary>{tr("guide.showJson")}</summary>
              <p>{tr("guide.jsonWarning")}</p>
              <pre>
                <code>{JSON.stringify(shownJson, null, 2)}</code>
              </pre>
            </details>
            <p className="guide-default-summary">
              <strong>{tr("guide.defaultsLabel")}</strong> {tr(key("defaults"))}
            </p>
          </aside>
        </div>
        {notice && (
          <p role="status" className="guide-notice">
            {notice}
          </p>
        )}
        <footer className="guide-footer">
          <button
            className="button secondary"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            <ArrowLeft size={16} />
            {tr("guide.previous")}
          </button>
          <span>{tr("guide.skipAllowed")}</span>
          {index < walkthroughSteps.length - 1 ? (
            <button className="button primary" onClick={() => go(index + 1)}>
              {tr("guide.next")}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="button primary" onClick={onClose}>
              {tr("guide.finish")}
              <ArrowRight size={16} />
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}

function QuestionPreview({
  item,
  items,
  variantId,
  onProgress,
  onFoundation,
}: {
  item: Item;
  items: Item[];
  variantId: string;
  onProgress: (item: Item) => void;
  onFoundation: () => void;
}) {
  useLanguage();
  const v = resolveVariant(item.question, variantId),
    entry =
      variantId === "learn-choice"
        ? learningEntry({ ...item, progress: emptyProgress() }, items)
        : { questionId: item.question.id, variantId, format: v.type, retry: 0 };
  const card = useMemo(
    () => publicCard(item, entry),
    [item.question.id, variantId],
  );
  const [text, setText] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [pairs, setPairs] = useState<Record<string, string>>({}),
    [hint, setHint] = useState(false),
    [revealed, setRevealed] = useState(false),
    [mental, setMental] = useState(false),
    [feedback, setFeedback] = useState<Attempt | null>(null),
    [override, setOverride] = useState(false);
  const answered = useRef(false),
    original = useRef<unknown>(""),
    input = useRef<HTMLTextAreaElement>(null),
    region = useRef<HTMLDivElement>(null);
  const lock = prerequisiteStatus(items).find((p) => p.id === item.question.id),
    locked = lock && !lock.unlocked && !override;
  const response = card.options
    ? selected
    : card.format === "matching"
      ? pairs
      : text;
  const canAnswer = card.options
    ? selected.length > 0
    : card.format === "matching"
      ? card.left?.every((left) => pairs[left])
      : card.format === "flashcard" || !!text.trim();
  const hintText =
    v.hint ??
    (recallDirection(item.question, variantId) === "reverse"
      ? undefined
      : item.question.hint);
  useEffect(() => {
    (input.current ?? region.current)?.focus({ preventScroll: true });
  }, []);
  function submit(rating?: string, chosen?: unknown) {
    if (answered.current || locked) return;
    const value = chosen ?? response;
    if (!revealed && (mental || grade(v, value) === null)) {
      original.current = value;
      setRevealed(true);
      return;
    }
    const attempt = evaluateAttempt(
      item,
      variantId,
      revealed ? original.current : value,
      rating,
      false,
      undefined,
      hint,
      mental,
    );
    answered.current = true;
    setFeedback(attempt);
    if (attempt.correct !== null)
      onProgress({
        ...item,
        progress: updateProgress(
          item.progress,
          attempt.correct,
          attempt.format,
          attempt.selfAssessed,
          new Date(),
          rating,
          attempt.skill,
          attempt.hintUsed,
          recallDirection(item.question, variantId),
        ),
      });
  }
  function revealMental() {
    if (answered.current || locked) return;
    original.current = response;
    setMental(true);
    setRevealed(true);
  }
  function again() {
    answered.current = false;
    setFeedback(null);
    setRevealed(false);
    setMental(false);
    setText("");
    setSelected([]);
    setPairs({});
    setHint(false);
    requestAnimationFrame(() => input.current?.focus());
  }
  if (locked)
    return (
      <div className="guide-card guide-locked">
        <h3>{tr("guide.locked")}</h3>
        <p>{tr("guide.lockedBody")}</p>
        <button className="button primary" onClick={onFoundation}>
          {tr("guide.practiseFoundation")}
        </button>
        <label>
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />
          {tr("guide.override")}
        </label>
      </div>
    );
  const comparison = feedback || revealed;
  return (
    <div
      className="guide-card"
      ref={region}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (
          e.defaultPrevented ||
          e.nativeEvent.isComposing ||
          e.ctrlKey ||
          e.altKey ||
          e.metaKey ||
          e.repeat
        )
          return;
        if (
          e.target instanceof HTMLTextAreaElement &&
          e.key === "Enter" &&
          !e.shiftKey
        ) {
          e.preventDefault();
          if (canAnswer) submit();
          else revealMental();
          return;
        }
        if (
          ["TEXTAREA", "INPUT", "SELECT"].includes(
            (e.target as HTMLElement).tagName,
          )
        )
          return;
        if (card.options && !comparison && /^[1-9]$/.test(e.key)) {
          const option = card.options[Number(e.key) - 1];
          if (option) {
            e.preventDefault();
            if (card.format === "multiple_select")
              setSelected((current) =>
                current.includes(option)
                  ? current.filter((x) => x !== option)
                  : [...current, option],
              );
            else {
              setSelected([option]);
              submit(undefined, [option]);
            }
          }
        }
      }}
    >
      <span className="eyebrow">{tr("guide.previewLabel")}</span>
      <h3>{card.question}</h3>
      {comparison ? (
        <>
          {feedback && (
            <p className="guide-verdict" role="status">
              {feedback.correct ? tr("guide.correct") : tr("guide.incorrect")}
            </p>
          )}
          <div className="answer-comparison">
            <SubmittedAnswer
              value={feedback ? feedback.response : original.current}
              mental={mental}
            />
            <div className="model-answer">
              <span className="eyebrow">{tr("app.model_answer")}</span>
              <p>{v.answer}</p>
            </div>
          </div>
          {(v.explanation ?? item.question.explanation) && (
            <p>{v.explanation ?? item.question.explanation}</p>
          )}
          {revealed && !feedback && (
            <>
              <p>{tr("guide.selfGrade")}</p>
              {(v.rubric ?? item.question.rubric)?.map((point) => (
                <p className="guide-rubric" key={point}>
                  {point}
                </p>
              ))}
              <div className="guide-ratings">
                {["again", "hard", "good", "easy"].map((rating) => (
                  <button
                    className="button secondary"
                    key={rating}
                    onClick={() => submit(rating)}
                  >
                    {tr(`common.${rating}` as MessageKey)}
                  </button>
                ))}
              </div>
            </>
          )}
          {feedback && (
            <button className="button secondary" onClick={again}>
              {tr("guide.tryAgain")}
            </button>
          )}
        </>
      ) : (
        <>
          {card.options ? (
            <div
              className="guide-options"
              role="group"
              aria-label={
                card.format === "multiple_select"
                  ? tr("app.select_all_correct_answers")
                  : tr("app.choose_one_answer")
              }
            >
              {card.options.map((option, n) => (
                <button
                  className="guide-option"
                  key={option}
                  role={
                    card.format === "multiple_select" ? "checkbox" : undefined
                  }
                  aria-checked={
                    card.format === "multiple_select"
                      ? selected.includes(option)
                      : undefined
                  }
                  onClick={() => {
                    if (card.format === "multiple_select")
                      setSelected((current) =>
                        current.includes(option)
                          ? current.filter((x) => x !== option)
                          : [...current, option],
                      );
                    else {
                      setSelected([option]);
                      submit(undefined, [option]);
                    }
                  }}
                >
                  <span>{n + 1}</span>
                  {option}
                </button>
              ))}
            </div>
          ) : card.format === "matching" ? (
            <div className="guide-matching">
              {card.left?.map((left) => (
                <label key={left}>
                  {left}
                  <select
                    value={pairs[left] ?? ""}
                    onChange={(e) =>
                      setPairs((current) => ({
                        ...current,
                        [left]: e.target.value,
                      }))
                    }
                  >
                    <option value="">{tr("app.choose_a_match")}</option>
                    {card.right?.map((right) => (
                      <option key={right}>{right}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : card.format === "flashcard" ? (
            <p>{tr("guide.flashcardPrompt")}</p>
          ) : (
            <label className="guide-answer-label">
              {tr("app.your_answer")}
              <textarea
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
              />
            </label>
          )}
          {hintText && ["written", "flashcard"].includes(card.format) && (
            <div className="guide-hint">
              {hint ? (
                <p role="status">
                  {hintText} — {tr("guide.assisted")}
                </p>
              ) : (
                <button className="text-button" onClick={() => setHint(true)}>
                  {tr("app.show_hint")}
                </button>
              )}
            </div>
          )}
          <div className="guide-actions">
            {card.format === "written" && (
              <button className="button secondary" onClick={revealMental}>
                {tr("app.answer_in_my_head")}
              </button>
            )}
            {card.format !== "multiple_choice" && (
              <button
                className="button primary"
                disabled={!canAnswer}
                onClick={() => submit()}
              >
                {card.format === "flashcard"
                  ? tr("app.reveal_answer")
                  : card.selfGrade
                    ? tr("app.compare_answer")
                    : tr("app.check_answer")}
              </button>
            )}
          </div>
        </>
      )}
      {item.question.reversible && (
        <p className="guide-direction-progress">
          {tr("guide.directionProgress", {
            forward: item.progress.recallDirections?.forward ?? 0,
            reverse: item.progress.recallDirections?.reverse ?? 0,
          })}
        </p>
      )}
    </div>
  );
}
