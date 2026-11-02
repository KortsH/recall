import { ErrorMessage } from "./error.tsx";
import {
  tr,
  useLanguage,
  setLanguage,
  availableLanguages,
  getLanguage,
  type MessageKey,
} from "./i18n.ts";
import {
  defaultStudyControls,
  loadStudyControls,
  saveStudyControls,
  keyLabel,
  validContinueKey,
  continuesFeedback,
  type StudyControls,
} from "./controls.ts";
import { parsePortable, exportPortable } from "../core/portable.ts";
import { saveJson } from "./files.ts";
import { emptyProgress } from "../core/types.ts";
import { QuestionLibrary } from "./library.tsx";
import type { TopicMove } from "../core/organization.ts";
import { dependentQuestions } from "../core/prerequisites.ts";
import {
  loadTheme,
  applyTheme,
  saveTheme,
  type ThemePreference,
} from "./theme.ts";
import { ReadAloud } from "./speech.tsx";
import { version as appVersion } from "../../package.json";
import {
  saveAnswerDraft,
  readAnswerDraft,
  clearAnswerDraft,
} from "./drafts.ts";
import {
  subscribeUpdates,
  startAppUpdates,
  checkAppUpdates,
} from "./updates.ts";
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Layers,
  ChartNoAxesCombined,
  Settings2,
  Plus,
  Check,
  CheckCheck,
  X,
  RotateCcw,
  Flame,
  Keyboard,
  MoreHorizontal,
  Search,
  Pencil,
  Download,
  Upload,
  Play,
  Clock,
  ChevronDown,
  Command,
  GraduationCap,
  PanelLeftClose,
  Lightbulb,
  Flag,
  Sun,
  Moon,
} from "lucide-react";
import type { Store } from "../server/store.ts";
import type { Question, Item, Attempt } from "../core/types.ts";
import "./style.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "./readability.css";
import "./study.css";
import "./library.css";
import "./theme.css";
import "./updates.css";
import {
  api,
  personalMode,
  selectWorkspace,
  downloadedMode,
  setDownloadedMode,
  refreshDownloads,
  syncDownloads,
  downloadStatus,
  exportPendingRecovery,
  discardResetEvidence,
  flushDeviceState,
} from "./cache.ts";

applyTheme(loadTheme());

type Deck = Awaited<ReturnType<Store["decks"]>>[number];
type SessionView = Awaited<ReturnType<Store["getSession"]>>;
const sessionKey = () =>
  personalMode() ? "recall-session-personal" : "recall-session";
type Feedback = Attempt & { rubric?: string[] };
type Reveal = Awaited<ReturnType<Store["reveal"]>>;
const fmt = (s: string) =>
  ["learn", "cram", "flashcards", "test"].includes(s)
    ? tr(`mode.${s}` as MessageKey)
    : s;
const getModes = () => [
  {
    id: "learn",
    title: tr("mode.learn"),
    copy: tr("main.build_understanding_one_question_at_a_time"),
    icon: BookOpen,
  },
  {
    id: "cram",
    title: tr("mode.cram"),
    copy: tr("main.focus_on_weak_spots_keep_everything_fresh"),
    icon: Flame,
  },
  {
    id: "flashcards",
    title: tr("mode.flashcards"),
    copy: tr("main.take_a_breath_recall_it_in_your_own_words"),
    icon: Layers,
  },
  {
    id: "test",
    title: tr("main.test_yourself"),
    copy: tr("main.no_hints_see_what_you_really_remember"),
    icon: GraduationCap,
  },
];
function App() {
  const language = useLanguage();
  const modes = getModes();
  useEffect(() => {
    window.RecallFiles?.postMessage(
      JSON.stringify({ action: "language", language }),
    );
  }, [language]);
  const [theme, setTheme] = useState<ThemePreference>(loadTheme);
  const [resolvedTheme, setResolvedTheme] = useState(
    () => document.documentElement.dataset.theme ?? "light",
  );
  const changeTheme = (value: ThemePreference) => {
    setTheme(value);
    setResolvedTheme(saveTheme(value));
  };
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolvedTheme(applyTheme(theme));
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  const [cache, setCache] = useState(downloadStatus());
  const [controls, setControls] = useState(loadStudyControls);
  const [controlsOpen, setControlsOpen] = useState(false);
  const changeControls = (next: StudyControls) => {
    saveStudyControls(next);
    setControls(next);
  };
  useEffect(() => {
    const update = () => setCache(downloadStatus());
    window.addEventListener("recall-cache", update);
    return () => window.removeEventListener("recall-cache", update);
  }, []);
  const [decks, setDecks] = useState<Deck[]>([]),
    [deckId, setDeckId] = useState(""),
    [section, setSection] = useState("overview");
  const [session, setSession] = useState<SessionView | null>(null),
    [recent, setRecent] = useState<any[]>([]);
  const [topic, setTopic] = useState(""),
    [count, setCount] = useState(20),
    [learnSize, setLearnSize] = useState(12),
    [minutes, setMinutes] = useState(0),
    [mode, setMode] = useState("learn");
  const [items, setItems] = useState<Item[]>([]),
    [search, setSearch] = useState(""),
    [editor, setEditor] = useState<Item | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [importRaw, setImportRaw] = useState(""),
    [shareOpen, setShareOpen] = useState(false);
  const [resetRequest, setResetRequest] = useState<Awaited<
    ReturnType<Store["resetLearning"]>
  > | null>(null);
  const [discardResetOpen, setDiscardResetOpen] = useState(false);
  const [flagRequest, setFlagRequest] = useState<Item | null>(null);
  const [appUpdate, setAppUpdate] = useState({
    available: false,
    supported: false,
    checking: false,
    error: "",
  });
  const [deferUpdate, setDeferUpdate] = useState(false);
  useEffect(() => subscribeUpdates(setAppUpdate), []);
  const [response, setResponse] = useState<any>(""),
    [selected, setSelected] = useState<string[]>([]),
    [pairs, setPairs] = useState<Record<string, string>>({}),
    [feedback, setFeedback] = useState<Feedback | null>(null),
    [reveal, setReveal] = useState<Reveal | null>(null);
  const [now, setNow] = useState(Date.now()),
    [mobileNav, setMobileNav] = useState(false);
  const answerPendingRef = useRef(false);
  const leaveState = useRef<any>(null);
  leaveState.current = {
    session,
    response,
    selected,
    pairs,
    feedback,
    reveal,
    busy,
    editing: !!(
      editor ||
      importOpen ||
      flagRequest ||
      shareOpen ||
      resetRequest ||
      discardResetOpen ||
      controlsOpen
    ),
  };
  function preserveDraft() {
    const current = leaveState.current;
    if (current.busy || answerPendingRef.current)
      throw new Error(tr("main.wait_for_the_current_answer_or_save_to_finish"));
    if (current.editing)
      throw new Error(
        tr("main.finish_or_close_the_open_editor_or_dialog_before"),
      );
    if (current.session?.card && !current.feedback)
      saveAnswerDraft(personalMode(), current.session, {
        response: String(current.response ?? ""),
        selected: current.selected,
        pairs: current.pairs,
        ...(current.reveal ? { reveal: current.reveal } : {}),
      });
  }
  useEffect(() => {
    const prepare = async (event: Event) => {
      const token = String((event as CustomEvent).detail ?? "");
      if (!/^[a-f0-9-]{36}$/.test(token) || !window.RecallFiles) return;
      try {
        preserveDraft();
        const status = await flushDeviceState();
        window.RecallFiles.postMessage(
          JSON.stringify({ action: "leave", token, pending: status.pending }),
        );
      } catch (error) {
        window.RecallFiles.postMessage(
          JSON.stringify({
            action: "leave",
            token,
            error: (error as Error).message,
          }),
        );
      }
    };
    const recovery = () => {
      setSession(null);
      setSection("settings");
      setNotice(
        tr(
          "app.export_unsynced_progress_here_before_switching_workspaces_pending_answers",
        ),
      );
    };
    window.addEventListener("recall-prepare-leave", prepare);
    window.addEventListener("recall-show-recovery", recovery);
    return () => {
      window.removeEventListener("recall-prepare-leave", prepare);
      window.removeEventListener("recall-show-recovery", recovery);
    };
  }, []);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const optionsRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    mainRef = useRef<HTMLElement>(null),
    studyRef = useRef<HTMLElement>(null),
    continueRef = useRef<HTMLButtonElement>(null);
  const deck = decks.find((d) => d.id === deckId);
  useEffect(() => {
    if (!session?.card) return;
    const draft = readAnswerDraft(personalMode(), session);
    if (draft) {
      setResponse(draft.response);
      setSelected(draft.selected);
      setPairs(draft.pairs);
      if (draft.reveal && session.revealed) setReveal(draft.reveal);
    }
  }, [session?.id, session?.cursor, session?.card?.revision]);
  useEffect(() => {
    const receive = (event: Event) => {
      setImportRaw(String((event as CustomEvent).detail));
      setImportOpen(true);
    };
    window.addEventListener("recall-import", receive);
    window.RecallFiles?.postMessage(JSON.stringify({ action: "ready" }));
    return () => window.removeEventListener("recall-import", receive);
  }, []);
  const refresh = async () => {
    const d = await api<Deck[]>("/decks");
    setDecks(d);
    if (!deckId && d[0]) setDeckId(d[0].id);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const id = localStorage.getItem(sessionKey());
    if (id)
      void api<SessionView>(`/sessions/${id}`)
        .then((s) => {
          if (!s.finished) {
            setSession(s);
            setDeckId(s.deckId);
          }
        })
        .catch(() => localStorage.removeItem(sessionKey()));
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [session?.id, session?.cursor, !!feedback, section]);
  useEffect(() => {
    setTopic("");
  }, [deckId]);
  useEffect(() => {
    if (!deckId) return;
    void Promise.all([
      api<Item[]>(`/decks/${deckId}/questions`),
      api<any[]>(`/decks/${deckId}/sessions`),
    ])
      .then(([i, s]) => {
        setItems(i);
        setRecent(s);
      })
      .catch((e) => setError(e.message));
  }, [deckId, session?.finished, section]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const resetAnswer = () => {
    setResponse("");
    setSelected([]);
    setPairs({});
    setFeedback(null);
    setReveal(null);
  };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const [ignorePrerequisites, setIgnorePrerequisites] = useState(false);
  const start = (chosen = mode) =>
    void run(async () => {
      const s = await api<SessionView>(`/decks/${deckId}/sessions`, {
        mode: chosen,
        topic: topic || undefined,
        count: chosen === "learn" ? learnSize : count,
        minutes,
        ignorePrerequisites:
          ["cram", "test"].includes(chosen) && ignorePrerequisites,
      });
      setNow(Date.now());
      setSession(s);
      setMode(chosen);
      resetAnswer();
      localStorage.setItem(sessionKey(), s.id);
    });
  const resume = (id: string) =>
    void run(async () => {
      const s = await api<SessionView>(`/sessions/${id}`);
      setNow(Date.now());
      setSession(s);
      setDeckId(s.deckId);
      resetAnswer();
      localStorage.setItem(sessionKey(), s.id);
    });
  const leave = () => {
    try {
      preserveDraft();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (downloadedMode()) void syncDownloads().catch(() => {});
    setSession(null);
    resetAnswer();
    void refresh();
    setSection("overview");
  };
  const applyAppUpdate = () => {
    try {
      preserveDraft();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    void run(async () => {
      await flushDeviceState();
      window.location.reload();
    });
  };
  const openReset = () =>
    void run(async () => {
      if (deckId)
        setResetRequest(
          await api<Awaited<ReturnType<Store["resetLearning"]>>>(
            `/decks/${deckId}/reset-learning`,
            {},
          ),
        );
    });
  const backupBeforeReset = () =>
    void run(async () => {
      if (!resetRequest) return;
      const bank = await api<any>(`/decks/${resetRequest.deckId}/export`);
      const current = await api<Item[]>(
        `/decks/${resetRequest.deckId}/questions`,
      );
      saveJson(
        "Recall-before-reset.recall.json",
        await exportPortable(bank, current, true),
      );
      setNotice(tr("app.progress_backup_prepared_keep_the_file_if_you_may"));
    });
  const applyReset = () =>
    void run(async () => {
      if (!resetRequest) return;
      await api(`/decks/${resetRequest.deckId}/reset-learning`, {
        confirm: true,
        expectedEpoch: resetRequest.expectedEpoch,
      });
      setResetRequest(null);
      setSession(null);
      resetAnswer();
      localStorage.removeItem(sessionKey());
      await refresh();
      setItems(await api<Item[]>(`/decks/${deckId}/questions`));
      setRecent(await api<any[]>(`/decks/${deckId}/sessions`));
      setSection("overview");
      setNotice(tr("app.learning_reset_to_zero_start_learn_to_begin_with"));
    });
  const card = session?.card;
  const actualResponse = card?.options
    ? selected
    : card?.format === "matching"
      ? pairs
      : response;
  const canAnswer = card?.options
    ? selected.length > 0
    : card?.format === "matching"
      ? card.left?.every((x) => pairs[x])
      : card?.format === "flashcard" || String(response).trim().length > 0;
  const submit = (rating?: string, responseOverride?: unknown) => {
    if (answerPendingRef.current || busy || !session || !card) return;
    answerPendingRef.current = true;
    const submittedResponse = responseOverride ?? actualResponse;
    void run(async () => {
      if (!session || !card) return;
      if (card.selfGrade && session.mode !== "test" && !reveal) {
        const r = await api<Reveal>(`/sessions/${session.id}/reveal`, {
          version: session.version,
          revision: card.revision,
          response: submittedResponse,
        });
        setReveal(r);
        setSession({ ...session, version: r.version });
        return;
      }
      const r = await api<{ session: SessionView; feedback: Feedback | null }>(
        `/sessions/${session.id}/answer`,
        {
          version: session.version,
          revision: card.revision,
          response: submittedResponse,
          rating,
        },
      );
      clearAnswerDraft(personalMode(), session);
      setSession(r.session);
      if (r.feedback && !r.feedback.selfAssessed) setFeedback(r.feedback);
      else resetAnswer();
      void refresh();
    }).finally(() => {
      answerPendingRef.current = false;
    });
  };
  const chooseOption = (option: string) => {
    if (busy || answerPendingRef.current || feedback || reveal || !card) return;
    optionRefs.current[card.options?.indexOf(option) ?? -1]?.focus({
      preventScroll: true,
    });
    if (card.format === "multiple_select")
      setSelected((s) =>
        s.includes(option) ? s.filter((x) => x !== option) : [...s, option],
      );
    else {
      setSelected([option]);
      if (controls.autoSubmitSingle) submit(undefined, [option]);
    }
  };
  const next = () => {
    resetAnswer();
    mainRef.current?.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (
      !session ||
      (session.finished && !feedback) ||
      busy ||
      editor ||
      importOpen ||
      shareOpen ||
      resetRequest ||
      discardResetOpen ||
      flagRequest ||
      controlsOpen
    )
      return;
    const frame = requestAnimationFrame(() => {
      const control = feedback
        ? continueRef.current
        : reveal
          ? revealRef.current
          : (inputRef.current ??
            studyRef.current?.querySelector<HTMLElement>(".option.selected") ??
            optionsRef.current ??
            studyRef.current?.querySelector<HTMLElement>(
              ".option, select, .card-bottom button",
            ));
      control?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    session?.id,
    session?.cursor,
    !!feedback,
    !!reveal,
    busy,
    editor,
    importOpen,
    shareOpen,
    resetRequest,
    discardResetOpen,
    flagRequest,
    controlsOpen,
  ]);
  useEffect(() => {
    if (!session?.deadline || session.finished) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.deadline, session?.finished]);
  useEffect(() => {
    if (
      !session?.deadline ||
      session.finished ||
      now < Date.parse(session.deadline)
    )
      return;
    void run(async () => {
      setSession(await api<SessionView>(`/sessions/${session.id}`));
      resetAnswer();
    });
  }, [now]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        editor ||
        importOpen ||
        resetRequest ||
        discardResetOpen ||
        flagRequest ||
        controlsOpen ||
        !session
      )
        return;
      const target = e.target as HTMLElement;
      const typing = ["TEXTAREA", "INPUT", "SELECT"].includes(target.tagName);
      if (
        e.key === "Enter" &&
        (e.metaKey || e.ctrlKey) &&
        !feedback &&
        !reveal &&
        canAnswer
      ) {
        e.preventDefault();
        submit();
        return;
      }
      if (typing) return;
      if (
        e.repeat &&
        (e.key === "Enter" || e.key === " " || /^[1-9]$/.test(e.key))
      ) {
        e.preventDefault();
        return;
      }
      if (feedback) {
        if (continuesFeedback(e, controls)) {
          e.preventDefault();
          next();
        } else if (
          e.repeat ||
          (controls.continueMode !== "button" && ["Enter", " "].includes(e.key))
        )
          e.preventDefault();
        return;
      }
      if (e.key === "Enter" && !busy && canAnswer && !reveal) {
        e.preventDefault();
        submit();
      } else if (
        card?.options &&
        !feedback &&
        !reveal &&
        /^[1-9]$/.test(e.key)
      ) {
        const option = card.options[Number(e.key) - 1];
        if (option) {
          e.preventDefault();
          if (!e.repeat) chooseOption(option);
        }
      } else if (reveal && !feedback && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        submit(["again", "hard", "good", "easy"][Number(e.key) - 1]);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  });
  const edit = (id: string) =>
    void run(async () => {
      setEditor(
        await api<Item>(`/decks/${deckId}/questions/${encodeURIComponent(id)}`),
      );
    });
  const saveEdit = (question: Question) =>
    void run(async () => {
      if (!editor) return;
      if (editor.revision === 0) {
        if (!deck) throw new Error(tr("app.choose_a_quiz_first"));
        await api("/import", { deck: deck.name, questions: [question] });
        setEditor(null);
        setItems(await api<Item[]>(`/decks/${deckId}/questions`));
        await refresh();
        setNotice(tr("app.question_added_to_this_quiz"));
        return;
      }
      const result = await api<{ reset: boolean }>(
        `/decks/${deckId}/questions/${editor.question.id}`,
        { question, revision: editor.revision },
        "PUT",
      );
      setEditor(null);
      setNotice(
        result.reset
          ? tr(
              "app.question_corrected_previous_progress_for_this_objective_was_reset",
            )
          : tr("app.question_updated"),
      );
      setItems(await api<Item[]>(`/decks/${deckId}/questions`));
      if (session)
        setSession(await api<SessionView>(`/sessions/${session.id}`));
      if (feedback)
        setFeedback({
          ...feedback,
          explanation: result.reset
            ? tr("study.editedAttempt")
            : (question.variants.find((v) => v.id === feedback.variantId)
                ?.explanation ?? question.explanation),
        });
      void refresh();
    });
  const updateOrganization = async (question: Question, message: string) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const current = await api<Item>(
        `/decks/${deckId}/questions/${encodeURIComponent(question.id)}`,
      );
      await api(
        `/decks/${deckId}/questions/${encodeURIComponent(question.id)}`,
        {
          question: {
            ...current.question,
            topic: question.topic,
            depends_on: question.depends_on ?? [],
          },
          revision: current.revision,
        },
        "PUT",
      );
      setItems(await api<Item[]>(`/decks/${deckId}/questions`));
      await refresh();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const exportDeck = () => setShareOpen(true);
  const openFlag = (id: string) =>
    void run(async () => {
      setFlagRequest(
        await api<Item>(`/decks/${deckId}/questions/${encodeURIComponent(id)}`),
      );
    });
  const saveFlag = (flag?: Question["flag"]) =>
    void run(async () => {
      if (!flagRequest) return;
      const current = await api<Item>(
        `/decks/${deckId}/questions/${encodeURIComponent(flagRequest.question.id)}`,
      );
      const question = { ...current.question };
      if (flag) question.flag = flag;
      else delete question.flag;
      await api(
        `/decks/${deckId}/questions/${encodeURIComponent(question.id)}`,
        { question, revision: current.revision },
        "PUT",
      );
      setItems(await api<Item[]>(`/decks/${deckId}/questions`));
      if (session) {
        setSession(await api<SessionView>(`/sessions/${session.id}`));
        if (
          session.card?.questionId === question.id ||
          feedback?.questionId === question.id
        )
          resetAnswer();
      }
      setFlagRequest(null);
      await refresh();
      setNotice(
        flag
          ? tr("app.flagged_for_review_and_skipped_your_note_is_saved")
          : tr("app.flag_removed_normal_learning_rules_restored"),
      );
    });
  const moveQuestions = async (moves: TopicMove[], message: string) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await api(`/decks/${deckId}/organize`, { moves, apply: true });
      setItems(await api<Item[]>(`/decks/${deckId}/questions`));
      await refresh();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const showHint = () =>
    void run(async () => {
      if (!session?.card || feedback || reveal || answerPendingRef.current)
        return;
      const result = await api<{ version: number; hint: string }>(
        `/sessions/${session.id}/hint`,
        { version: session.version, revision: session.card.revision },
      );
      setSession({ ...session, version: result.version, hint: result.hint });
      inputRef.current?.focus({ preventScroll: true });
    });
  const shareDeck = (includeProgress: boolean) =>
    void run(async () => {
      const bank = await api<any>(`/decks/${deckId}/export`);
      const current = includeProgress
        ? await api<Item[]>(`/decks/${deckId}/questions`)
        : [];
      const bundle = await exportPortable(bank, current, includeProgress);
      saveJson(
        `${bank.deck.replace(/[^\p{L}\p{N}._-]+/gu, "-")}${includeProgress ? "-with-progress" : ""}.recall.json`,
        bundle,
      );
      setShareOpen(false);
      setNotice(tr("app.export_prepared_save_the_file_then_send_it_through"));
    });
  const importBank = async (
    input: unknown,
    replace: boolean,
    restoreProgress: boolean,
    dryRun: boolean,
  ) => {
    if (busy) throw new Error(tr("app.another_action_is_running"));
    setBusy(true);
    setError("");
    try {
      const parsed = parsePortable(input);
      const params = new URLSearchParams({
        replace: replace ? "1" : "0",
        dryRun: dryRun ? "1" : "0",
        progress: restoreProgress ? "replace" : "keep",
      });
      const result = await api<any>(
        `/import?${params}`,
        personalMode() ? input : parsed.bank,
      );
      if (!dryRun) {
        setImportOpen(false);
        setImportRaw("");
        await refresh();
        setDeckId(result.deckId);
        setItems(await api<Item[]>(`/decks/${result.deckId}/questions`));
        setNotice(
          tr("app.added_updated_unchanged_archived", {
            created: result.created,
            updated: result.updated,
            unchanged: result.unchanged,
            archived: result.archived,
          }),
        );
      }
      return result;
    } finally {
      setBusy(false);
    }
  };
  const due = decks.reduce((n, d) => n + d.stats.due, 0),
    total = decks.reduce((n, d) => n + d.stats.total, 0);
  const inStudy = !!session;
  return (
    <div className={`app ${inStudy ? "studying" : ""}`}>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            leave();
          }}
        >
          <img
            className="brand-icon"
            src={`${import.meta.env.BASE_URL}recall.svg`}
            alt="r."
            width="37"
            height="37"
          />
          <span className="brand-wordmark">
            recall<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">
          {tr("app.your_study_space")}
          <span>{tr("app.local")}</span>
        </div>
        <nav aria-label={tr("app.main_navigation")}>
          {[
            { id: "overview", icon: BookOpen, label: tr("app.overview") },
            { id: "library", icon: Layers, label: tr("app.question_library") },
            {
              id: "progress",
              icon: ChartNoAxesCombined,
              label: tr("app.your_progress"),
            },
          ].map((n) => (
            <button
              key={n.id}
              className={`nav-item ${section === n.id && !inStudy ? "active" : ""}`}
              onClick={() => {
                setSession(null);
                setSection(n.id);
                setMobileNav(false);
                void refresh();
              }}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "library" && <span className="nav-count">{total}</span>}
            </button>
          ))}
        </nav>
        <div className="side-decks">
          <div className="side-label">
            {tr("app.your_decks")}
            <button
              aria-label={tr("app.import_a_deck")}
              onClick={() => setImportOpen(true)}
            >
              <Plus size={15} />
            </button>
          </div>
          {decks.map((d, i) => (
            <button
              className={`deck-link ${d.id === deckId ? "selected" : ""}`}
              key={d.id}
              onClick={() => {
                setDeckId(d.id);
                setSession(null);
                setSection("overview");
                setMobileNav(false);
              }}
            >
              <span className={`deck-marker color-${i % 3}`} />
              <span>{d.name}</span>
              <span>{d.stats.total}</span>
            </button>
          ))}
          {!decks.length && (
            <p className="side-empty">
              {tr("app.your_next_subject_starts_here")}
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="side-note">
            <span className="status-dot" />{" "}
            {tr("app.a_little_practice_a_lasting_memory")}
            <p>{tr("app.private_local_and_entirely_yours")}</p>
          </div>
          <button
            className="profile"
            onClick={() => {
              setSession(null);
              setSection("settings");
              setMobileNav(false);
            }}
          >
            <span className="avatar">Y</span>
            <span>
              {tr("app.your_workspace")}
              <small>{tr("app.made_for_learning")}</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <main ref={mainRef}>
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label={tr("app.toggle_navigation")}
            onClick={() => setMobileNav(!mobileNav)}
          >
            <PanelLeftClose size={20} />
          </button>
          <div className="breadcrumb">
            {tr("app.your_workspace_2")}
            <span>/</span>{" "}
            <strong>
              {inStudy
                ? tr("app.study_session")
                : section === "overview"
                  ? tr("app.overview")
                  : section === "library"
                    ? tr("app.question_library")
                    : section === "progress"
                      ? tr("app.your_progress")
                      : tr("app.settings")}
            </strong>
          </div>
          <div className="local-badge">
            <span className="status-dot" />
            {cache.personal
              ? tr("app.on_this_device_no_server")
              : cache.enabled
                ? tr("app.downloaded_on_device", {
                    value: cache.pending
                      ? tr("app.to_sync", { pending: cache.pending })
                      : "",
                  })
                : tr("app.live_server")}
            {!cache.personal && cache.enabled && (
              <button
                className="icon-button"
                aria-label={tr("app.refresh_downloaded_quizzes")}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await refreshDownloads();
                    await refresh();
                    if (deckId) {
                      setItems(await api<Item[]>(`/decks/${deckId}/questions`));
                      setRecent(await api<any[]>(`/decks/${deckId}/sessions`));
                    }
                    setNotice(
                      tr(
                        "app.progress_synced_and_downloaded_quizzes_refreshed",
                      ),
                    );
                  })
                }
              >
                <RotateCcw size={14} />
              </button>
            )}
            <button
              className="icon-button theme-toggle"
              aria-label={
                resolvedTheme === "dark"
                  ? tr("app.switch_to_light_mode")
                  : tr("app.switch_to_dark_mode")
              }
              title={
                resolvedTheme === "dark"
                  ? tr("app.switch_to_light_mode")
                  : tr("app.switch_to_dark_mode")
              }
              onClick={() =>
                changeTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
          </div>
        </header>
        {appUpdate.available && !deferUpdate && (
          <div className="app-update-banner" role="status">
            <div>
              <strong>{tr("app.an_app_update_is_ready")}</strong>
              <span>
                {tr(
                  "app.your_current_question_and_pending_progress_stay_saved_on",
                )}
              </span>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeferUpdate(true)}
            >
              {tr("common.later")}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={applyAppUpdate}
            >
              {tr("app.save_reload")}
            </button>
          </div>
        )}
        {cache.error && (
          <div className="cache-status" role="status">
            {<ErrorMessage message={cache.error} />}
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{<ErrorMessage message={error} />}</span>
            {session && (
              <button onClick={() => resume(session.id)}>
                {tr("app.reload_session")}
              </button>
            )}
            <button
              aria-label={tr("app.dismiss_error")}
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <CheckCheck size={18} />
            {notice}
          </div>
        )}
        {!inStudy && (
          <div
            className={`page ${section === "library" ? "library-page" : ""}`}
          >
            {section === "overview" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {tr("app.make_it_second_nature")}
                    </div>
                    <h1>
                      {tr("app.a_little_closer_to")}
                      <br />
                      {tr("app.i_know_this")}
                      <span className="heading-spark">✦</span>
                    </h1>
                    <p>
                      {tr(
                        "app.turn_what_you_re_studying_into_something_that_stays",
                      )}
                    </p>
                  </div>
                  <button
                    className="button secondary import-button"
                    onClick={() => setImportOpen(true)}
                  >
                    <Plus size={17} />
                    {tr("app.add_a_deck")}
                  </button>
                </div>
                <div className="overview-stats">
                  <div>
                    <span className="stat-icon">
                      <Layers size={19} />
                    </span>
                    <span>
                      <strong>{total}</strong>
                      <small>{tr("app.learning_objectives")}</small>
                    </span>
                  </div>
                  <div>
                    <span className="stat-icon green">
                      <CheckCheck size={19} />
                    </span>
                    <span>
                      <strong>
                        {decks.reduce((n, d) => n + d.stats.mastered, 0)}
                        <em> / {total}</em>
                      </strong>
                      <small>{tr("app.mastered_through_recall")}</small>
                    </span>
                  </div>
                  <div>
                    <span className="stat-icon orange">
                      <RotateCcw size={19} />
                    </span>
                    <span>
                      <strong>{due}</strong>
                      <small>{tr("app.ready_for_a_review")}</small>
                    </span>
                  </div>
                </div>
                {deck ? (
                  <>
                    <div className="section-heading">
                      <h2>{tr("app.pick_up_where_you_left_off")}</h2>
                      <span>
                        {decks.length}{" "}
                        {decks.length === 1 ? tr("app.deck") : tr("app.decks")}{" "}
                        {tr("app.in_your_library")}
                      </span>
                    </div>
                    <section className="deck-card" aria-label={deck.name}>
                      <div className="deck-card-top">
                        <span className="subject-pill">
                          <span />
                          {tr("app.exam_preparation")}
                        </span>
                        <button
                          className="icon-button"
                          aria-label={tr("app.view_question_library")}
                          onClick={() => setSection("library")}
                        >
                          <MoreHorizontal size={22} />
                        </button>
                      </div>
                      <div className="deck-card-content">
                        <div>
                          <h2>{deck.name}</h2>
                          <p>
                            {deck.description ||
                              tr("app.your_next_step_toward_confident_recall")}
                          </p>
                          <div className="deck-meta">
                            <span>
                              <Layers size={15} />
                              {deck.stats.total} {tr("app.objectives")}
                            </span>
                            <i />
                            <span>
                              {deck.stats.topics.length} {tr("app.topics")}
                            </span>
                            <i />
                            <span>
                              {tr("app.recognition_recall_application")}
                            </span>
                          </div>
                        </div>
                        <div
                          className="mastery-ring"
                          style={
                            {
                              "--progress": `${deck.stats.total ? (deck.stats.mastered / deck.stats.total) * 100 : 0}%`,
                            } as React.CSSProperties
                          }
                        >
                          <div>
                            <strong>
                              {Math.round(
                                (deck.stats.mastered /
                                  (deck.stats.total || 1)) *
                                  100,
                              )}
                              <small>%</small>
                            </strong>
                            <span>{tr("app.mastered")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="deck-progress">
                        <span
                          style={{
                            width: `${(deck.stats.mastered / (deck.stats.total || 1)) * 100}%`,
                          }}
                        />
                        <span
                          style={{
                            width: `${(deck.stats.learning / (deck.stats.total || 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="deck-card-bottom">
                        <div className="progress-legend">
                          <span>
                            <i className="legend-mastered" />
                            {deck.stats.mastered} {tr("app.mastered_2")}
                          </span>
                          <span>
                            <i className="legend-learning" />
                            {deck.stats.learning} {tr("app.learning")}
                          </span>
                          <span>
                            <i />
                            {deck.stats.unseen} {tr("app.unseen")}
                          </span>
                        </div>
                        <button
                          className="text-button quick-start"
                          disabled={busy}
                          onClick={() => start("learn")}
                        >
                          {tr("app.learn_this_deck")}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </section>
                    <div className="section-heading mode-heading">
                      <h2>{tr("app.how_do_you_want_to_practise")}</h2>
                      <span>
                        {tr(
                          "app.different_ways_in_the_same_deeper_understanding",
                        )}
                      </span>
                    </div>
                    <div className="mode-grid">
                      {modes.map((m) => (
                        <button
                          key={m.id}
                          className={`mode-card ${mode === m.id ? "chosen" : ""}`}
                          onClick={() => setMode(m.id)}
                        >
                          <div className="mode-card-top">
                            <span className={`mode-icon ${m.id}`}>
                              <m.icon size={22} />
                            </span>
                            <span className="mode-radio">
                              {mode === m.id && <span />}
                            </span>
                          </div>
                          <h3>
                            {m.title}
                            {m.id === "learn" && (
                              <span className="tiny-badge">
                                {tr("app.adaptive")}
                              </span>
                            )}
                          </h3>
                          <p>{m.copy}</p>
                        </button>
                      ))}
                    </div>
                    {mode === "learn" && (
                      <p className="small">
                        {tr(
                          "app.start_with_choices_then_recall_without_hints_learn_up",
                        )}
                        {learnSize}{" "}
                        {tr(
                          "app.unlocked_questions_at_a_time_the_next_set_arrives",
                        )}
                      </p>
                    )}
                    <div className="session-controls">
                      <label>
                        {tr("common.topic")}
                        <select
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                        >
                          <option value="">{tr("common.all_topics")}</option>
                          {deck.stats.topics.map((t) => (
                            <option key={t.topic} value={t.topic}>
                              {t.topic}
                              {t.locked
                                ? tr("app.locked", { locked: t.locked })
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {mode === "learn"
                          ? tr("app.working_set")
                          : tr("app.session_size")}
                        <select
                          value={mode === "learn" ? learnSize : count}
                          onChange={(e) =>
                            (mode === "learn" ? setLearnSize : setCount)(
                              Number(e.target.value),
                            )
                          }
                        >
                          {(mode === "learn"
                            ? [8, 12, 16]
                            : [5, 10, 20, 50, 100, 200]
                          ).map((n) => (
                            <option value={n} key={n}>
                              {n} {tr("app.objectives")}
                            </option>
                          ))}
                        </select>
                      </label>
                      {mode === "test" && (
                        <label>
                          {tr("app.time_limit")}
                          <select
                            value={minutes}
                            onChange={(e) => setMinutes(Number(e.target.value))}
                          >
                            <option value={0}>{tr("app.untimed")}</option>
                            {[5, 15, 30, 60].map((n) => (
                              <option value={n} key={n}>
                                {n} {tr("app.minutes")}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {["cram", "test"].includes(mode) && (
                        <label className="prerequisite-override">
                          <input
                            type="checkbox"
                            checked={ignorePrerequisites}
                            onChange={(e) =>
                              setIgnorePrerequisites(e.target.checked)
                            }
                          />{" "}
                          {tr("app.include_locked_questions")}
                        </label>
                      )}
                      <button
                        className="button primary start-button"
                        disabled={busy}
                        onClick={() => start()}
                      >
                        {busy
                          ? tr("app.getting_ready")
                          : tr(`study.start.${mode}` as MessageKey)}
                        <ArrowRight size={18} />
                      </button>
                    </div>
                    <button
                      className="text-button quiet"
                      disabled={busy}
                      onClick={openReset}
                    >
                      <RotateCcw size={14} />
                      {tr("common.reset_learning")}
                    </button>
                    <div className="learning-note">
                      <span>✦</span>
                      <p>
                        <strong>
                          {tr("app.knowing_it_is_more_than_recognising_it")}
                        </strong>{" "}
                        {tr(
                          "app.learn_gradually_moves_you_from_choosing_an_answer_to",
                        )}
                      </p>
                    </div>
                    {recent.some((s) => !s.finished) && (
                      <div className="resume-panel">
                        <div>
                          <Clock size={18} />
                          <span>
                            {tr("app.you_have_a_session_in_progress")}
                          </span>
                        </div>
                        <button
                          className="text-button"
                          onClick={() =>
                            resume(recent.find((s) => !s.finished).id)
                          }
                        >
                          {tr("app.resume_session")}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Layers size={36} />
                    </div>
                    <h2>{tr("app.a_space_for_what_you_re_learning")}</h2>
                    <p>
                      {tr(
                        "app.import_a_question_bank_to_create_your_first_deck",
                      )}
                      <br />
                      {tr(
                        "app.you_can_generate_the_bank_with_any_assistant_then",
                      )}
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setImportOpen(true)}
                    >
                      <Upload size={17} />
                      {tr("app.import_a_question_bank")}
                    </button>
                    <p className="small">
                      {tr("app.json_csv_and_tsv_no_ai_account_needed")}
                    </p>
                  </div>
                )}
              </>
            )}
            {section === "library" && (
              <>
                <div className="page-heading compact">
                  <div className="eyebrow">
                    {tr("app.make_the_material_yours")}
                  </div>
                  <h1>
                    {tr("app.question_library")}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {tr(
                      "app.good_learning_starts_with_good_questions_keep_yours_accurate",
                    )}
                  </p>
                </div>
                <div className="library-toolbar">
                  <label className="search-box">
                    <Search size={18} />
                    <input
                      placeholder={tr("app.search_questions_or_concepts")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>

                  <button
                    className="button secondary"
                    disabled={!deck || busy}
                    onClick={() =>
                      setEditor({
                        revision: 0,
                        progress: emptyProgress(),
                        question: {
                          id: `q-${crypto.randomUUID().slice(0, 8)}`,
                          topic: topic || items[0]?.question.topic || "General",
                          concept: "",
                          skill: "recall",
                          question: "",
                          answer: "",
                          explanation: "",
                          difficulty: 1,
                          tags: [],
                          variants: [],
                          depends_on: [],
                        },
                      })
                    }
                  >
                    <Plus size={16} />
                    {tr("common.new_question")}
                  </button>
                  <button
                    className="button secondary"
                    disabled={!deck}
                    onClick={exportDeck}
                  >
                    <Upload size={16} />
                    {tr("common.export")}
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setImportOpen(true)}
                  >
                    <Download size={16} />
                    {tr("common.import")}
                  </button>
                </div>
                <QuestionLibrary
                  key={deckId}
                  items={items}
                  topic={topic}
                  search={search}
                  busy={busy}
                  onTopic={setTopic}
                  onEdit={setEditor}
                  onUpdate={updateOrganization}
                  onMove={moveQuestions}
                  onFlag={setFlagRequest}
                />
              </>
            )}
            {section === "progress" && (
              <>
                <div className="page-heading compact">
                  <div className="eyebrow">
                    {tr("app.know_where_you_stand")}
                  </div>
                  <h1>
                    {tr("app.understanding_growing")}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {tr(
                      "app.mastery_needs_repeated_active_recall_a_lucky_guess_doesn",
                    )}
                  </p>
                </div>
                {deck && (
                  <>
                    <div className="progress-summary">
                      <div>
                        <strong>
                          {deck.stats.mastered}
                          <span> / {deck.stats.total}</span>
                        </strong>
                        <p>{tr("app.objectives_mastered")}</p>
                      </div>
                      <div>
                        <strong>{deck.stats.attempts}</strong>
                        <p>{tr("app.answers_practised")}</p>
                      </div>
                      <div>
                        <strong>{deck.stats.due}</strong>
                        <p>{tr("app.reviews_ready")}</p>
                      </div>
                    </div>
                    <div className="section-heading">
                      <h2>{tr("app.topic_by_topic")}</h2>
                      <span>
                        {tr(
                          "app.recognition_and_self_assessment_are_recorded_separately",
                        )}
                      </span>
                    </div>
                    <div className="topic-grid">
                      {deck.stats.topics.map((t) => (
                        <article className="topic-card" key={t.topic}>
                          <div>
                            <h3>{t.topic}</h3>
                            <span>
                              {t.mastered}/{t.total}
                            </span>
                          </div>
                          <div className="topic-bar">
                            <span
                              style={{
                                width: `${(t.mastered / t.total) * 100}%`,
                              }}
                            />
                          </div>
                          <p>
                            {t.accuracy === null
                              ? tr("app.ready_for_your_first_attempt")
                              : tr("app.accuracy_attempts", {
                                  accuracy: t.accuracy,
                                  attempts: t.attempts,
                                })}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              setTopic(t.topic);
                              setSection("overview");
                            }}
                          >
                            {tr("app.practise_topic")}
                            <ArrowRight size={15} />
                          </button>
                        </article>
                      ))}
                    </div>
                    <div className="section-heading">
                      <h2>{tr("app.a_little_more_attention")}</h2>
                      <span>
                        {tr("app.your_most_frequently_missed_questions")}
                      </span>
                    </div>
                    <div className="question-list">
                      {deck.stats.weak.map((q) => (
                        <div className="weak-row" key={q.id}>
                          <span className="weak-count">{q.wrong}×</span>
                          <div>
                            <small>{q.topic}</small>
                            <p>{q.question}</p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={tr("app.edit", { id: q.id })}
                            onClick={() => edit(q.id)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      ))}
                      {!deck.stats.weak.length && (
                        <p className="quiet empty-line">
                          {tr(
                            "app.no_missed_questions_yet_start_a_session_to_discover",
                          )}
                        </p>
                      )}
                    </div>
                    <details className="session-history">
                      <summary>{tr("app.recent_sessions")}</summary>
                      {recent.map((s) => (
                        <button key={s.id} onClick={() => resume(s.id)}>
                          <span>
                            {fmt(s.mode)} ·{" "}
                            {new Date(s.createdAt).toLocaleDateString(
                              getLanguage(),
                            )}
                          </span>
                          <span>
                            {s.finished
                              ? tr("app.view_results")
                              : tr("app.resume", {
                                  cursor: s.cursor,
                                  total: s.total,
                                })}
                            <ArrowRight size={14} />
                          </span>
                        </button>
                      ))}
                    </details>
                  </>
                )}
              </>
            )}
            {section === "settings" && (
              <>
                <div className="page-heading compact">
                  <div className="eyebrow">{tr("app.simple_by_design")}</div>
                  <h1>
                    {tr("app.your_workspace")}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {cache.personal
                      ? tr(
                          "app.your_quizzes_and_progress_stay_in_this_browser_or",
                        )
                      : tr(
                          "app.your_server_stores_shared_questions_and_progress_downloaded_mode",
                        )}
                  </p>
                </div>
                <section className="settings-card">
                  <h2>{tr("app.app_updates")}</h2>
                  <p>
                    {tr("app.version")}
                    {appVersion}
                  </p>
                  {appUpdate.available ? (
                    <>
                      <p>
                        {tr(
                          "app.a_new_web_app_is_downloaded_save_reload_preserves",
                        )}
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={applyAppUpdate}
                      >
                        {tr("app.save_reload_app")}
                      </button>
                    </>
                  ) : (
                    <p>
                      {tr(
                        "app.your_app_keeps_working_while_an_update_downloads_it",
                      )}
                    </p>
                  )}
                  {appUpdate.supported && (
                    <button
                      className="button secondary"
                      disabled={appUpdate.checking || busy}
                      onClick={() => {
                        setDeferUpdate(false);
                        void checkAppUpdates();
                      }}
                    >
                      {appUpdate.checking
                        ? tr("app.checking")
                        : tr("app.check_for_app_update")}
                    </button>
                  )}
                  {appUpdate.error && (
                    <p role="alert">
                      {<ErrorMessage message={appUpdate.error} />}
                    </p>
                  )}
                  <p>
                    {tr(
                      "app.windows_android_installations_bundle_their_own_interface_download_a",
                    )}
                  </p>
                  <a
                    className="text-button"
                    href="https://github.com/KortsH/recall/releases"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tr("app.browse_app_releases")}
                  </a>
                </section>
                <section className="settings-card">
                  <h2>{tr("common.study_controls")}</h2>
                  <StudyControlsPanel
                    value={controls}
                    onChange={changeControls}
                  />
                </section>
                <section className="settings-card">
                  <h2>{tr("settings.language")}</h2>
                  <label className="appearance-control">
                    {tr("settings.language")}
                    <select
                      aria-label={tr("settings.language")}
                      value={language}
                      onChange={(e) => {
                        setNotice("");
                        setError("");
                        void setLanguage(e.target.value);
                      }}
                    >
                      {availableLanguages.map((l) => (
                        <option key={l.code} value={l.code} lang={l.code}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>{tr("settings.languageDescription")}</p>
                  <a
                    className="text-button"
                    href="https://github.com/KortsH/recall/blob/main/docs/TRANSLATING.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tr("settings.translations")}
                  </a>
                </section>
                <section className="settings-card">
                  <h2>{tr("app.appearance")}</h2>
                  <label className="appearance-control">
                    {tr("app.theme")}
                    <select
                      aria-label={tr("app.theme")}
                      value={theme}
                      onChange={(e) =>
                        changeTheme(e.target.value as ThemePreference)
                      }
                    >
                      <option value="system">{tr("app.follow_system")}</option>
                      <option value="light">{tr("app.light")}</option>
                      <option value="dark">{tr("app.dark")}</option>
                    </select>
                  </label>
                  <p>
                    {tr("app.saved_on_this_device_use_the_sun_moon_button")}
                  </p>
                </section>
                <section className="settings-card">
                  <h2>{tr("app.read_aloud_dictation")}</h2>
                  <p>
                    {tr("app.use_read_aloud_on_a_question_or_revealed_answer")}
                  </p>
                  <p>
                    {tr(
                      "app.for_dictation_focus_the_answer_field_and_use_your",
                    )}
                  </p>
                </section>
                {cache.personal && (
                  <div className="settings-card">
                    <h2>{tr("app.learn_here_share_anywhere")}</h2>
                    <p>
                      {tr(
                        "app.import_a_recall_json_or_ordinary_question_bank_json",
                      )}
                    </p>
                    <p className="small">
                      {tr(
                        "app.your_browser_and_phone_keep_separate_copies_clearing_app",
                      )}
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setImportOpen(true)}
                    >
                      <Upload size={16} />
                      {tr("app.import_a_quiz_file")}
                    </button>
                  </div>
                )}
                {!cache.personal && (
                  <div className="settings-card">
                    <h2>{tr("app.keep_quizzes_on_this_device")}</h2>
                    <p>
                      {tr(
                        "app.download_the_full_quiz_and_study_without_contacting_the",
                      )}
                    </p>
                    <label className="storage-choice">
                      <input
                        type="checkbox"
                        checked={cache.enabled}
                        onChange={(e) =>
                          void run(async () => {
                            const enabled = e.target.checked;
                            if (!enabled) await syncDownloads();
                            else await refreshDownloads();
                            setDownloadedMode(enabled);
                            await refresh();
                            setNotice(
                              enabled
                                ? tr("app.downloaded_study_mode_enabled")
                                : tr("app.live_server_mode_enabled"),
                            );
                          })
                        }
                      />
                      {tr("app.use_downloaded_study_mode")}
                    </label>
                    <p className="small">
                      {cache.downloadedAt
                        ? tr("app.last_downloaded", {
                            date: new Date(cache.downloadedAt).toLocaleString(
                              getLanguage(),
                            ),
                          })
                        : tr("app.no_quiz_download_yet")}{" "}
                      {cache.pending
                        ? tr("app.session_s_waiting_to_sync", {
                            pending: cache.pending,
                          })
                        : tr("app.progress_is_synced")}
                    </p>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await refreshDownloads();
                          await refresh();
                          setNotice(
                            tr("app.downloaded_quizzes_are_up_to_date"),
                          );
                        })
                      }
                    >
                      <RotateCcw size={16} />
                      {tr("app.sync_progress_refresh_quizzes")}
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || !cache.pending}
                      onClick={() =>
                        void run(async () => {
                          const recovery = await exportPendingRecovery();
                          saveJson(
                            "Recall-pending-progress.recovery.json",
                            recovery,
                          );
                          setNotice(
                            tr(
                              "app.private_recovery_export_prepared_it_includes_pending_answers_keep",
                            ),
                          );
                        })
                      }
                    >
                      <Download size={16} />
                      {tr("app.export_unsynced_progress")}
                    </button>
                    {cache.resetConflicts.length > 0 && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => setDiscardResetOpen(true)}
                      >
                        {tr("app.discard_outdated_answers_reload_decks")}
                      </button>
                    )}
                    <p className="small">
                      {tr(
                        "app.if_the_server_stays_unavailable_export_pending_evidence_before",
                      )}
                    </p>
                    <p className="small">
                      {tr(
                        "app.phone_and_computer_keep_their_own_downloads_refresh_either",
                      )}
                    </p>
                  </div>
                )}
                <div className="settings-card">
                  <h2>{tr("app.workspace")}</h2>
                  <p>
                    {cache.personal
                      ? tr(
                          "app.device_only_storage_is_independent_of_any_server_workspace",
                        )
                      : tr(
                          "app.you_can_also_use_an_independent_device_only_workspace",
                        )}
                  </p>
                  {!import.meta.env.VITE_RECALL_STANDALONE && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        void run(async () => {
                          if (!cache.personal && cache.pending)
                            await syncDownloads();
                          selectWorkspace(!cache.personal);
                          window.location.reload();
                        })
                      }
                    >
                      {cache.personal
                        ? tr("app.return_to_server_workspace")
                        : tr("app.use_a_device_only_workspace")}
                    </button>
                  )}
                </div>
                <div className="settings-card">
                  <h2>{tr("app.bring_your_own_questions")}</h2>
                  <p>
                    {tr(
                      "app.use_any_assistant_to_prepare_a_structured_bank_then",
                    )}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload size={16} />
                    {tr("app.import_a_bank")}
                  </button>
                </div>
                <div className="settings-card">
                  <h2>{tr("app.how_mastery_works")}</h2>
                  <p>
                    {tr(
                      "app.three_consecutive_successes_including_at_least_two_written_or",
                    )}
                  </p>
                  <p>
                    {tr("app.free_form_answers_use_a_model_answer_and_your")}
                  </p>
                </div>
              </>
            )}
            <footer>
              <span className="footer-brand">recall.</span>
              <span>{tr("app.learn_it_for_real")}</span>
              <span>{tr("app.small_steps_stronger_recall")}</span>
            </footer>
          </div>
        )}
        {inStudy && (
          <div className="study-page">
            <div className="study-top">
              <button className="text-button" onClick={leave}>
                <ArrowLeft size={16} />
                {tr("app.save_leave")}
              </button>
              <button
                className="icon-button"
                aria-label={tr("common.study_controls")}
                title={tr("common.study_controls")}
                onClick={() => setControlsOpen(true)}
              >
                <Settings2 size={18} />
              </button>
              <span>{deck?.name}</span>
              <span className="study-mode">{fmt(session.mode)}</span>
            </div>
            {(!session.finished || feedback) && (
              <>
                <div className="study-progress-label">
                  <span>
                    {session.learning
                      ? tr("app.set_of_mastered", {
                          round: session.learning.round,
                          mastered: session.learning.mastered,
                          total: session.learning.total,
                        })
                      : feedback
                        ? tr("app.a_little_stronger_already")
                        : session.mode === "test"
                          ? tr("app.take_your_time_trust_what_you_know")
                          : tr("app.one_question_a_little_deeper")}
                  </span>
                  <span>
                    {session.learning
                      ? tr("app.learned", {
                          deckMastered: session.learning.deckMastered,
                          deckTotal: session.learning.deckTotal,
                        })
                      : `${Math.min(session.cursor + (feedback ? 0 : 1), session.total)} / ${session.total}`}
                    {session.deadline && (
                      <>
                        {" "}
                        · <Clock size={13} />
                        {Math.max(
                          0,
                          Math.floor(
                            (Date.parse(session.deadline) - now) / 60000,
                          ),
                        )}
                        :
                        {String(
                          Math.max(
                            0,
                            Math.floor(
                              (Date.parse(session.deadline) - now) / 1000,
                            ) % 60,
                          ),
                        ).padStart(2, "0")}
                      </>
                    )}
                  </span>
                </div>
                <div className="study-progress">
                  <span
                    style={{
                      width: `${session.learning ? (session.learning.deckMastered / session.learning.deckTotal) * 100 : (session.cursor / session.total) * 100}%`,
                    }}
                  />
                </div>
              </>
            )}
            {feedback ? (
              <div className="study-card feedback-card">
                <div
                  className={`feedback-status ${feedback.correct ? "correct" : "incorrect"}`}
                >
                  {feedback.correct ? (
                    <CheckCheck size={22} />
                  ) : (
                    <RotateCcw size={22} />
                  )}
                  <span>
                    {feedback.correct
                      ? tr("app.that_s_it")
                      : tr("app.let_s_make_this_one_stick")}
                  </span>
                  {feedback.selfAssessed && (
                    <small>{tr("app.self_assessed")}</small>
                  )}
                  {feedback.hintUsed && <small>{tr("app.hint_used")}</small>}
                </div>
                <div className="eyebrow">{feedback.topic}</div>
                <h2>{feedback.question}</h2>
                <ReadAloud
                  text={feedback.answer}
                  label={tr("app.read_model_answer")}
                />
                {feedback.hintUsed && (
                  <p className="assisted-note">
                    {tr(
                      "app.assisted_practice_this_answer_does_not_increase_unaided_recall",
                    )}
                  </p>
                )}
                <div className="model-answer">
                  <span>{tr("app.model_answer")}</span>
                  <p>{feedback.answer}</p>
                </div>
                {feedback.explanation && (
                  <p className="explanation">{feedback.explanation}</p>
                )}
                <div className="feedback-bottom">
                  <button
                    className="text-button quiet"
                    onClick={() => edit(feedback.questionId)}
                  >
                    <Pencil size={14} />
                    {tr("app.something_off_edit_question")}
                  </button>
                  <button
                    className="text-button quiet"
                    disabled={busy}
                    onClick={() => openFlag(feedback.questionId)}
                  >
                    <Flag size={14} />
                    {tr("app.flag_for_review")}
                  </button>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={next}
                    ref={continueRef}
                  >
                    {session.finished
                      ? tr("app.see_session_results")
                      : tr("common.continue")}
                    {controls.continueMode === "any"
                      ? tr("app.any_key")
                      : controls.continueMode === "key"
                        ? ` · ${keyLabel(controls.continueKey)}`
                        : ""}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            ) : session.finished ? (
              <Results
                session={session}
                busy={busy}
                onRate={(index, rating) =>
                  void run(async () => {
                    setSession(
                      await api<SessionView>(`/sessions/${session.id}/rate`, {
                        index,
                        rating,
                      }),
                    );
                    void refresh();
                  })
                }
                onEdit={edit}
                onBack={leave}
                onAgain={() => start(session.mode)}
              />
            ) : (
              card && (
                <>
                  <section className="study-card" ref={studyRef}>
                    <div className="card-topline">
                      <span className="topic-tag">{card.topic}</span>
                      <span className="format-label">
                        {card.format === "written"
                          ? tr("app.active_recall")
                          : card.format === "flashcard"
                            ? tr("app.recall_reflect")
                            : card.format === "matching"
                              ? tr("app.make_the_connection")
                              : tr("app.recognition")}
                      </span>
                      <button
                        className="icon-button question-flag-button"
                        aria-label={tr("app.flag_and_skip_question")}
                        title={tr("app.flag_and_skip_this_question")}
                        disabled={busy}
                        onClick={() => openFlag(card.questionId)}
                      >
                        <Flag size={17} />
                      </button>
                    </div>
                    <h2>{card.question}</h2>
                    <ReadAloud
                      text={card.question}
                      label={tr("app.read_question")}
                    />
                    {card.hasHint && session.mode !== "test" && !reveal && (
                      <div className="study-hint">
                        {session.hint ? (
                          <div role="status">
                            <strong>
                              <Lightbulb size={16} />
                              {tr("app.hint_used_2")}
                            </strong>
                            <p>{session.hint}</p>
                            <small>
                              {tr(
                                "app.assisted_practice_try_it_without_a_hint_next_time",
                              )}
                            </small>
                          </div>
                        ) : (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={showHint}
                          >
                            <Lightbulb size={16} />
                            {tr("app.show_hint")}
                            <small>
                              {tr("app.counts_as_assisted_practice")}
                            </small>
                          </button>
                        )}
                      </div>
                    )}
                    {session.learning && !card.options && (
                      <p className="answer-hint">
                        {card.options
                          ? tr(
                              "app.start_by_recognising_the_answer_you_ll_recall_it",
                            )
                          : tr(
                              "app.now_recall_it_without_the_choices_two_successful_recalls",
                            )}
                      </p>
                    )}
                    {!reveal && (
                      <>
                        {card.options ? (
                          <>
                            <p className="answer-hint">
                              {card.format === "multiple_select"
                                ? tr("app.select_all_correct_answers")
                                : controls.autoSubmitSingle
                                  ? tr(
                                      "app.choose_one_answer_it_submits_immediately",
                                    )
                                  : tr("app.choose_one_answer_then_check_it")}
                            </p>
                            <div
                              ref={optionsRef}
                              tabIndex={-1}
                              onKeyDown={(event) => {
                                if (
                                  event.target !== event.currentTarget ||
                                  ![
                                    "ArrowDown",
                                    "ArrowRight",
                                    "ArrowUp",
                                    "ArrowLeft",
                                  ].includes(event.key)
                                )
                                  return;
                                event.preventDefault();
                                event.stopPropagation();
                                const index = ["ArrowUp", "ArrowLeft"].includes(
                                  event.key,
                                )
                                  ? card.options!.length - 1
                                  : 0;
                                optionRefs.current[index]?.focus({
                                  preventScroll: true,
                                });
                                if (
                                  card.format === "multiple_choice" &&
                                  !controls.autoSubmitSingle
                                )
                                  chooseOption(card.options![index]);
                              }}
                              className={`options ${card.format === "multiple_select" ? "multiple-answers" : "single-answer"}`}
                              role={
                                card.format === "multiple_select"
                                  ? "group"
                                  : controls.autoSubmitSingle
                                    ? "group"
                                    : "radiogroup"
                              }
                              aria-label={
                                card.format === "multiple_select"
                                  ? tr("app.select_all_correct_answers_2")
                                  : tr("app.choose_one_answer")
                              }
                            >
                              {card.options.map((option, i) => (
                                <button
                                  key={option}
                                  ref={(element) => {
                                    optionRefs.current[i] = element;
                                  }}
                                  tabIndex={
                                    card.format === "multiple_choice" &&
                                    !controls.autoSubmitSingle
                                      ? selected.length
                                        ? selected.includes(option)
                                          ? 0
                                          : -1
                                        : i === 0
                                          ? 0
                                          : -1
                                      : 0
                                  }
                                  onKeyDown={(event) => {
                                    if (
                                      ![
                                        "ArrowDown",
                                        "ArrowRight",
                                        "ArrowUp",
                                        "ArrowLeft",
                                      ].includes(event.key)
                                    )
                                      return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const direction = [
                                      "ArrowDown",
                                      "ArrowRight",
                                    ].includes(event.key)
                                      ? 1
                                      : -1;
                                    const index =
                                      (i + direction + card.options!.length) %
                                      card.options!.length;
                                    optionRefs.current[index]?.focus({
                                      preventScroll: true,
                                    });
                                    if (
                                      card.format === "multiple_choice" &&
                                      !controls.autoSubmitSingle
                                    )
                                      chooseOption(card.options![index]);
                                  }}
                                  className={`option ${selected.includes(option) ? "selected" : ""}`}
                                  role={
                                    card.format === "multiple_select"
                                      ? "checkbox"
                                      : controls.autoSubmitSingle
                                        ? undefined
                                        : "radio"
                                  }
                                  aria-checked={
                                    card.format === "multiple_select" ||
                                    !controls.autoSubmitSingle
                                      ? selected.includes(option)
                                      : undefined
                                  }
                                  aria-pressed={
                                    card.format === "multiple_choice" &&
                                    controls.autoSubmitSingle
                                      ? selected.includes(option)
                                      : undefined
                                  }
                                  disabled={busy}
                                  onClick={(event) => {
                                    if (event.detail <= 1) chooseOption(option);
                                  }}
                                >
                                  <span className="option-number">{i + 1}</span>
                                  <span>{option}</span>
                                  {card.format === "multiple_choice" &&
                                  controls.autoSubmitSingle ? (
                                    <ArrowRight
                                      className="option-action"
                                      size={18}
                                    />
                                  ) : (
                                    <span
                                      className={`option-check ${card.format === "multiple_select" ? "square" : ""}`}
                                    >
                                      {selected.includes(option) && (
                                        <Check size={14} />
                                      )}
                                    </span>
                                  )}
                                  {card.format === "multiple_select" && (
                                    <kbd
                                      className="option-shortcut"
                                      aria-hidden="true"
                                    >
                                      {i + 1}
                                    </kbd>
                                  )}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : card.format === "matching" ? (
                          <div className="matching-fields">
                            <p className="answer-hint">
                              {tr(
                                "app.choose_the_matching_answer_for_each_item",
                              )}
                            </p>
                            {card.left?.map((left) => (
                              <label key={left}>
                                <span>{left}</span>
                                <select
                                  aria-label={tr("app.match", { value: left })}
                                  value={pairs[left] ?? ""}
                                  onChange={(e) =>
                                    setPairs({
                                      ...pairs,
                                      [left]: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">
                                    {tr("app.choose_a_match")}
                                  </option>
                                  {card.right?.map((right) => (
                                    <option key={right}>{right}</option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>
                        ) : card.format === "flashcard" ? (
                          <div className="flashcard-front">
                            <Layers size={32} />
                            <p>
                              {tr("app.bring_the_answer_to_mind")}
                              <br />
                              {tr("app.then_turn_the_card")}
                            </p>
                          </div>
                        ) : (
                          <div className="written-answer">
                            <label htmlFor="written-response">
                              {tr("app.your_answer")}
                            </label>
                            <textarea
                              id="written-response"
                              ref={inputRef}
                              rows={4}
                              value={response}
                              onChange={(e) => setResponse(e.target.value)}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  !e.shiftKey &&
                                  !e.nativeEvent.isComposing
                                ) {
                                  e.preventDefault();
                                  if (canAnswer && !busy) submit();
                                }
                              }}
                              placeholder={tr(
                                "app.recall_it_in_your_own_words",
                              )}
                            />
                            <p>
                              {card.selfGrade
                                ? tr(
                                    "app.you_ll_compare_with_a_model_answer_and_assess",
                                  )
                                : tr(
                                    "app.for_multi_part_rules_separate_each_part_with_a",
                                  )}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {reveal && (
                      <div
                        className="reveal-answer"
                        ref={revealRef}
                        tabIndex={-1}
                        role="group"
                        aria-label={tr(
                          "app.compare_your_answer_with_the_model",
                        )}
                      >
                        <span className="eyebrow">
                          {tr("app.model_answer")}
                        </span>
                        <p className="reveal-model">{reveal.answer}</p>
                        <ReadAloud
                          text={reveal.answer}
                          label={tr("app.read_model_answer")}
                        />
                        <p className="explanation">{reveal.explanation}</p>
                        {reveal.rubric.length > 0 && (
                          <ul>
                            {reveal.rubric.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        )}
                        <span className="eyebrow">
                          {tr("app.how_did_you_do")}
                        </span>
                        <div className="rating-buttons">
                          {[
                            {
                              id: "again",
                              name: tr("common.again"),
                              copy: tr("app.couldn_t_recall_it"),
                            },
                            {
                              id: "hard",
                              name: tr("common.hard"),
                              copy: tr("app.got_it_with_effort"),
                            },
                            {
                              id: "good",
                              name: tr("common.good"),
                              copy: tr("app.recalled_it_clearly"),
                            },
                            {
                              id: "easy",
                              name: tr("common.easy"),
                              copy: tr("app.knew_it_instantly"),
                            },
                          ].map((r, i) => (
                            <button
                              className={`rating ${r.id}`}
                              key={r.id}
                              disabled={busy}
                              onClick={() => submit(r.id)}
                            >
                              <span>
                                <kbd>{i + 1}</kbd>
                                {r.name}
                              </span>
                              <small>{r.copy}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!reveal && (
                      <div className="card-bottom">
                        <span>
                          <Keyboard size={15} />
                          {card.format === "multiple_choice" &&
                          controls.autoSubmitSingle
                            ? tr("app.click_an_answer_or_press_1_to_submit", {
                                max: Math.min(9, card.options?.length ?? 0),
                                value:
                                  (card.options?.length ?? 0) > 9
                                    ? tr("app.arrow_keys_for_more")
                                    : "",
                              })
                            : card.options
                              ? tr("app.1_to_select_enter_to_check", {
                                  max: Math.min(9, card.options.length),
                                  value:
                                    card.options.length > 9
                                      ? tr("app.arrow_keys_for_more")
                                      : "",
                                })
                              : tr(
                                  "app.enter_to_check_shift_enter_for_a_new_line",
                                )}
                        </span>
                        {(card.format !== "multiple_choice" ||
                          !controls.autoSubmitSingle) && (
                          <button
                            className="button primary"
                            disabled={busy || !canAnswer}
                            onClick={() => submit()}
                          >
                            {busy
                              ? tr("app.saving")
                              : card.format === "flashcard"
                                ? tr("app.reveal_answer")
                                : card.selfGrade && session.mode !== "test"
                                  ? tr("app.compare_answer")
                                  : session.mode === "test"
                                    ? tr("app.save_answer")
                                    : tr("app.check_answer")}
                            <ArrowRight size={17} />
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                  <div className="study-under">
                    <p>
                      <span className="status-dot" />
                      {cache.personal
                        ? tr("app.savedOnDevice")
                        : cache.enabled
                          ? tr(
                              "app.saved_on_this_device_syncs_when_you_finish_or",
                            )
                          : tr("app.your_progress_saves_after_every_answer")}
                    </p>
                    {session.mode === "test" && (
                      <button
                        className="text-button quiet"
                        onClick={() =>
                          void run(async () => {
                            setSession(
                              await api<SessionView>(
                                `/sessions/${session.id}/finish`,
                                { version: session.version },
                              ),
                            );
                          })
                        }
                      >
                        {tr("app.finish_test_early")}
                      </button>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        )}
      </main>
      {editor && (
        <Editor
          item={editor}
          items={items}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={saveEdit}
        />
      )}
      {controlsOpen && (
        <StudyControlsDialog
          value={controls}
          onChange={changeControls}
          onClose={() => setControlsOpen(false)}
          onReset={() => {
            setControlsOpen(false);
            openReset();
          }}
        />
      )}
      {resetRequest && (
        <ResetDialog
          title={tr("app.reset_learning_to_zero")}
          busy={busy}
          onClose={() => setResetRequest(null)}
          onBackup={backupBeforeReset}
          onConfirm={applyReset}
          confirmLabel={tr("app.reset_to_zero")}
        >
          <p>
            <strong>{resetRequest.name}</strong> · {resetRequest.questions}{" "}
            {tr("app.questions")}
          </p>
          <p>{tr("app.this_clears_this_deck_s_mastery_answer_counters_and")}</p>
          <p>
            {cache.personal
              ? tr("app.this_affects_only_this_device_s_personal_workspace")
              : tr(
                  "app.this_resets_the_shared_deck_across_connected_devices_other",
                )}
          </p>
          <p className="small">
            {tr("app.download_a_progress_backup_first_if_you_may_want")}
          </p>
        </ResetDialog>
      )}
      {discardResetOpen && (
        <ResetDialog
          title={tr("app.discard_answers_from_before_the_reset")}
          busy={busy}
          onClose={() => setDiscardResetOpen(false)}
          confirmLabel={tr("app.discard_outdated_answers")}
          onBackup={() =>
            void run(async () =>
              saveJson(
                "Recall-outdated-progress.recovery.json",
                await exportPendingRecovery(),
              ),
            )
          }
          onConfirm={() =>
            void run(async () => {
              await discardResetEvidence();
              setDiscardResetOpen(false);
              setSession(null);
              resetAnswer();
              localStorage.removeItem(sessionKey());
              await refresh();
              setItems(await api<Item[]>(`/decks/${deckId}/questions`));
              setNotice(
                tr("app.reset_decks_reloaded_other_pending_answers_were_kept"),
              );
            })
          }
        >
          <p>{tr("app.the_server_has_a_newer_learning_reset_these_older")}</p>
          <p>{tr("app.export_a_private_evidence_backup_if_you_want_to")}</p>
        </ResetDialog>
      )}
      {shareOpen && (
        <ShareDialog
          busy={busy}
          onClose={() => setShareOpen(false)}
          onExport={shareDeck}
        />
      )}
      {flagRequest && (
        <FlagDialog
          item={flagRequest}
          items={items}
          busy={busy}
          onClose={() => setFlagRequest(null)}
          onSave={saveFlag}
        />
      )}
      {importOpen && (
        <ImportDialog
          busy={busy}
          initialRaw={importRaw}
          personal={cache.personal}
          onClose={() => {
            setImportOpen(false);
            setImportRaw("");
          }}
          onImport={importBank}
        />
      )}
    </div>
  );
}

function Results({
  session,
  busy,
  onRate,
  onEdit,
  onBack,
  onAgain,
}: {
  session: SessionView;
  busy: boolean;
  onRate: (i: number, r: string) => void;
  onEdit: (id: string) => void;
  onBack: () => void;
  onAgain: () => void;
}) {
  const r = session.result!;
  const percent = r.graded ? Math.round((r.correct / r.graded) * 100) : 0;
  return (
    <div className="results">
      <div className="result-hero">
        <div className="result-mark">
          <CheckCheck size={30} />
        </div>
        <div className="eyebrow">{tr("results.a_session_well_spent")}</div>
        <h1>
          {tr("results.it_s_starting_to_stick")}
          <span className="heading-dot">.</span>
        </h1>
        <p>
          {tr("results.every_attempt_makes_the_next_recall_a_little_easier")}
        </p>
        <div className="result-stats">
          <div>
            <strong>
              {r.correct}
              <em>/{r.graded}</em>
            </strong>
            <span>{tr("results.correct_graded_answers")}</span>
          </div>
          <div>
            <strong>
              {percent}
              <em>%</em>
            </strong>
            <span>{tr("results.session_accuracy")}</span>
          </div>
          <div>
            <strong>{r.pending}</strong>
            <span>{tr("results.to_self_assess")}</span>
          </div>
        </div>
        {r.unanswered > 0 && (
          <p>
            {r.unanswered}{" "}
            {tr(
              "results.unanswered_questions_unanswered_items_are_excluded_from_accuracy",
            )}
          </p>
        )}
        {r.answers.some((a) => a.hintUsed && !a.outdated) && (
          <p>
            {r.answers.filter((a) => a.hintUsed && !a.outdated).length}{" "}
            {tr(
              "results.answers_used_hints_assisted_answers_are_excluded_from_unaided",
            )}
          </p>
        )}
        <div className="result-actions">
          <button className="button secondary" onClick={onBack}>
            {tr("results.back_to_your_deck")}
          </button>
          <button className="button primary" disabled={busy} onClick={onAgain}>
            {tr("results.practise_again")}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
      <div className="result-topics">
        {r.topics.map((t) => (
          <span key={t.topic}>
            {t.topic}
            <strong>
              {t.correct}/{t.total}
            </strong>
          </span>
        ))}
      </div>
      <div className="section-heading">
        <h2>{tr("results.reflect_remember")}</h2>
        <span>
          {tr("results.includes_repeated_attempts_during_learn_and_cram")}
        </span>
      </div>
      {r.answers.map((a, i) => (
        <details
          className={`result-answer ${a.outdated ? "outdated" : a.correct === true ? "correct" : a.correct === false ? "incorrect" : ""}`}
          key={i}
          open={a.correct === null && !a.outdated}
        >
          <summary>
            <span className="answer-status">
              {a.outdated
                ? "—"
                : a.correct === null
                  ? "?"
                  : a.correct
                    ? "✓"
                    : "↻"}
            </span>
            <span>
              {a.question}
              <small>
                {a.topic}
                {a.selfAssessed ? tr("results.self_assessed") : ""}
                {a.hintUsed ? tr("results.hint_used") : ""}
                {a.outdated
                  ? tr("results.changed_question_excluded_from_score")
                  : ""}
              </small>
            </span>
            <ChevronDown size={16} />
          </summary>
          <div className="result-answer-body">
            <span className="eyebrow">{tr("results.your_answer")}</span>
            <p>
              {typeof a.response === "string"
                ? a.response
                : JSON.stringify(a.response)}
            </p>
            <span className="eyebrow">{tr("app.model_answer")}</span>
            <p>{a.answer}</p>
            <p className="explanation">{a.explanation}</p>
            {a.rubric && (
              <ul className="result-rubric">
                {a.rubric.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
            {a.correct === null && !a.outdated && (
              <div className="rating-buttons">
                {["again", "hard", "good", "easy"].map((r) => (
                  <button
                    className={`rating ${r}`}
                    disabled={busy}
                    key={r}
                    onClick={() => onRate(a.index, r)}
                  >
                    {tr(`results.${r}` as MessageKey)}
                  </button>
                ))}
              </div>
            )}
            <button
              className="text-button quiet"
              onClick={() => onEdit(a.questionId)}
            >
              <Pencil size={14} />
              {tr("results.correct_this_question")}
            </button>
          </div>
        </details>
      ))}
    </div>
  );
}

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,textarea,select,[tabindex="0"]',
        ) ?? [],
      ).filter((e) => !(e as HTMLButtonElement).disabled);
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = focusable();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, []);
  return ref;
}
function StudyControlsPanel({
  value,
  onChange,
}: {
  value: StudyControls;
  onChange: (value: StudyControls) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  return (
    <div className="study-controls-panel">
      <label className="storage-choice">
        <input
          type="checkbox"
          checked={value.autoSubmitSingle}
          onChange={(e) =>
            onChange({ ...value, autoSubmitSingle: e.target.checked })
          }
        />
        {tr("controls.submit_single_choice_answers_immediately")}
      </label>
      <p className="small quiet">
        {tr(
          "controls.single_choice_uses_answer_buttons_multiple_answer_questions_use",
        )}
      </p>
      <label className="field">
        {tr("controls.continue_after_feedback")}
        <select
          value={value.continueMode}
          onChange={(e) => {
            setCapturing(false);
            onChange({
              ...value,
              continueMode: e.target.value as StudyControls["continueMode"],
            });
          }}
        >
          <option value="key">{tr("controls.use_one_key")}</option>
          <option value="any">{tr("controls.press_any_key")}</option>
          <option value="button">{tr("controls.button_only")}</option>
        </select>
      </label>
      {value.continueMode === "key" && (
        <div className="continue-key">
          <span>{tr("controls.continue_key")}</span>
          <button
            className="button secondary"
            onClick={() => setCapturing(true)}
            onKeyDown={(e) => {
              if (!capturing) return;
              e.preventDefault();
              e.stopPropagation();
              if (e.key === "Escape") {
                setCapturing(false);
                return;
              }
              if (
                !e.nativeEvent.isComposing &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                validContinueKey(e.key)
              ) {
                onChange({ ...value, continueKey: e.key });
                setCapturing(false);
              }
            }}
          >
            {capturing
              ? tr("controls.press_your_key")
              : keyLabel(value.continueKey) + tr("controls.change")}
          </button>
        </div>
      )}
      <p className="small quiet">
        {tr(
          "controls.number_keys_choose_answers_enter_checks_typed_or_multiple",
        )}
      </p>
      <button
        className="text-button quiet"
        onClick={() => {
          setCapturing(false);
          onChange({ ...defaultStudyControls });
        }}
      >
        {tr("controls.restore_default_controls")}
      </button>
    </div>
  );
}
function StudyControlsDialog({
  value,
  onChange,
  onClose,
  onReset,
}: {
  value: StudyControls;
  onChange: (value: StudyControls) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const ref = useDialog(onClose);
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-controls-title"
      >
        <div className="modal-head">
          <h2 id="study-controls-title">{tr("common.study_controls")}</h2>
          <button
            className="icon-button"
            aria-label={tr("controls.close_study_controls")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <StudyControlsPanel value={value} onChange={onChange} />
        <div className="modal-foot">
          <button className="text-button quiet" onClick={onReset}>
            {tr("common.reset_learning")}
          </button>
          <button className="button primary" onClick={onClose}>
            {tr("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
function ResetDialog({
  title,
  busy,
  onClose,
  onBackup,
  onConfirm,
  confirmLabel,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  onBackup: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  children: React.ReactNode;
}) {
  const ref = useDialog(onClose);
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        ref={ref}
      >
        <div className="modal-head">
          <h2 id="reset-title">{title}</h2>
          <button
            className="icon-button"
            aria-label={tr("reset.close_reset")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
        <button className="button secondary" disabled={busy} onClick={onBackup}>
          <Download size={16} />
          {tr("reset.download_progress_backup")}
        </button>
        <div className="modal-foot">
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {tr("common.cancel")}
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? tr("reset.working") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
function FlagDialog({
  item,
  items,
  busy,
  onClose,
  onSave,
}: {
  item: Item;
  items: Item[];
  busy: boolean;
  onClose: () => void;
  onSave: (flag?: Question["flag"]) => void;
}) {
  const ref = useDialog(onClose);
  const [note, setNote] = useState(item.question.flag?.note ?? "");
  const [allow, setAllow] = useState(
    item.question.flag?.allowDependents ?? false,
  );
  const dependents = dependentQuestions(items, item.question.id);
  return (
    <div className="modal-backdrop">
      <div
        className="modal flag-dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-title"
      >
        <div className="modal-head">
          <h2 id="flag-title">{tr("flag.flag_question_for_review")}</h2>
          <button
            className="icon-button"
            aria-label={tr("flag.close_flag")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="flag-prompt">{item.question.question}</p>
        <p>{tr("flag.this_question_will_be_skipped_in_every_study_mode")}</p>
        <label className="field">
          {tr("flag.review_note")}
          <textarea
            autoFocus
            rows={3}
            maxLength={20000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tr(
              "flag.what_is_unclear_incorrect_or_worth_rewriting",
            )}
          />
        </label>
        {dependents.length > 0 && (
          <>
            <h3>{tr("flag.followUps", { count: dependents.length })}</h3>
            <p>
              {tr(
                "flag.review_the_affected_questions_below_hover_over_a_prompt",
              )}
            </p>
            <div className="flag-dependents">
              {dependents.map((i) => (
                <details key={i.question.id}>
                  <summary title={i.question.answer}>
                    {i.question.question}
                    <small>
                      {i.question.id}
                      {i.question.depends_on?.includes(item.question.id)
                        ? tr("flag.direct_follow_up")
                        : tr("flag.further_downstream")}
                    </small>
                  </summary>
                  <p>
                    <strong>{tr("common.model_answer")}</strong>
                    <br />
                    {i.question.answer}
                  </p>
                </details>
              ))}
            </div>
            <fieldset className="flag-policy">
              <legend>{tr("flag.what_should_happen_to_follow_ups")}</legend>
              <label>
                <input
                  type="radio"
                  name="flag-policy"
                  checked={!allow}
                  onChange={() => setAllow(false)}
                />
                <span>
                  {tr("flag.keep_them_locked_on_this_prerequisite")}
                  <small>
                    {tr(
                      "flag.recommended_while_an_incorrect_foundation_needs_fixing",
                    )}
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="flag-policy"
                  checked={allow}
                  onChange={() => setAllow(true)}
                />
                <span>
                  {tr("flag.bypass_this_flagged_prerequisite")}
                  <small>
                    {tr(
                      "flag.follow_ups_can_appear_when_their_other_prerequisites_are",
                    )}
                  </small>
                </span>
              </label>
            </fieldset>
          </>
        )}
        <p className="small">
          {tr("flag.the_flag_and_note_travel_with_question_bank_exports")}
        </p>
        <div className="modal-foot">
          {item.question.flag && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onSave()}
            >
              {tr("flag.remove_flag")}
            </button>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {tr("common.cancel")}
          </button>
          <button
            className="button primary"
            disabled={busy || !note.trim()}
            onClick={() =>
              onSave({
                note: note.trim(),
                allowDependents: dependents.length ? allow : false,
              })
            }
          >
            {busy
              ? tr("app.saving")
              : item.question.flag
                ? tr("flag.save_flag")
                : tr("flag.flag_skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
function Editor({
  item,
  items,
  busy,
  onClose,
  onSave,
}: {
  item: Item;
  items: Item[];
  busy: boolean;
  onClose: () => void;
  onSave: (q: Question) => void;
}) {
  const [q, setQ] = useState(item.question),
    [parentSearch, setParentSearch] = useState(""),
    [parents, setParents] = useState(
      (item.question.depends_on ?? []).join(", "),
    ),
    [advanced, setAdvanced] = useState(false),
    [raw, setRaw] = useState(JSON.stringify(item.question, null, 2)),
    [error, setError] = useState("");
  const ref = useDialog(onClose);
  const field = (key: keyof Question, value: any) =>
    setQ({ ...q, [key]: value });
  const save = () => {
    try {
      const value = advanced
        ? JSON.parse(raw)
        : { ...q, depends_on: parents.split(/[,\s]+/).filter(Boolean) };
      setError("");
      onSave(
        parsePortable({
          deck: "editor",
          questions: [
            { ...value, concept: value.concept?.trim() || value.question },
          ],
        }).bank.questions[0],
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal editor"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              {tr("editor.keep_your_material_accurate")}
            </div>
            <h2 id="editor-title">
              {item.revision === 0
                ? tr("editor.add_question")
                : tr("editor.edit_question")}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label={tr("editor.close_editor")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="editor-note">
          {tr("editor.changing_the_question_or_answer_resets_this_objective_s")}
        </p>
        <div className="editor-tabs">
          <button
            className={!advanced ? "active" : ""}
            onClick={() => {
              if (advanced) {
                try {
                  setQ(JSON.parse(raw));
                  setParents((JSON.parse(raw).depends_on ?? []).join(", "));
                  setAdvanced(false);
                  setError("");
                } catch {
                  setError(
                    tr("editor.fix_the_json_before_switching_to_the_form"),
                  );
                }
              }
            }}
          >
            {tr("editor.simple_editor")}
          </button>
          <button
            className={advanced ? "active" : ""}
            onClick={() => {
              setRaw(
                JSON.stringify(
                  { ...q, depends_on: parents.split(/[,\s]+/).filter(Boolean) },
                  null,
                  2,
                ),
              );
              setAdvanced(true);
            }}
          >
            {tr("editor.all_formats_json")}
          </button>
        </div>
        {error && (
          <p role="alert" className="field-error">
            {<ErrorMessage message={error} />}
          </p>
        )}
        {advanced ? (
          <label className="field">
            {tr("editor.complete_question_definition")}
            <textarea
              className="code-input"
              rows={20}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>
        ) : (
          <div className="editor-fields">
            <fieldset className="prerequisite-picker">
              <legend>{tr("editor.prerequisite_questions")}</legend>
              <p>
                {tr(
                  "editor.learn_these_first_every_selected_question_must_be_mastered",
                )}
              </p>
              <input
                aria-label={tr("editor.find_prerequisite_questions")}
                value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)}
                placeholder={tr("editor.search_questions_topics_or_ids")}
              />
              <div className="prerequisite-options">
                {items
                  .filter(
                    (i) =>
                      i.question.id !== q.id &&
                      `${i.question.question} ${i.question.topic} ${i.question.id}`
                        .toLowerCase()
                        .includes(parentSearch.toLowerCase()),
                  )
                  .map((i) => {
                    const selected = parents.split(/[,\s]+/).filter(Boolean);
                    const reaches = (
                      id: string,
                      seen = new Set<string>(),
                    ): boolean =>
                      id === q.id ||
                      (!seen.has(id) &&
                        (
                          items.find((x) => x.question.id === id)?.question
                            .depends_on ?? []
                        ).some((parent) =>
                          reaches(parent, new Set(seen).add(id)),
                        ));
                    const cycle = reaches(i.question.id);
                    return (
                      <label
                        key={i.question.id}
                        className={cycle ? "unavailable" : ""}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(i.question.id)}
                          disabled={cycle}
                          onChange={(e) =>
                            setParents(
                              (e.target.checked
                                ? [...new Set([...selected, i.question.id])]
                                : selected.filter((id) => id !== i.question.id)
                              ).join(", "),
                            )
                          }
                        />
                        <span>
                          <strong>{i.question.question}</strong>
                          <small>
                            {i.question.topic} · {i.question.id}
                            {cycle
                              ? tr("editor.would_create_a_circular_dependency")
                              : ""}
                          </small>
                        </span>
                      </label>
                    );
                  })}
              </div>
              <small>
                {parents.split(/[,\s]+/).filter(Boolean).length}{" "}
                {tr(
                  "editor.selected_empty_selection_means_available_immediately",
                )}
              </small>
            </fieldset>
            <div className="field-row">
              <label className="field">
                {tr("common.topic")}
                <input
                  value={q.topic}
                  onChange={(e) => field("topic", e.target.value)}
                />
              </label>
              <label className="field">
                {tr("editor.concept")}
                <input
                  value={q.concept}
                  onChange={(e) => field("concept", e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              {tr("common.question")}
              <textarea
                rows={3}
                value={q.question}
                onChange={(e) => field("question", e.target.value)}
              />
            </label>
            <label className="field">
              {tr("common.model_answer")}
              <textarea
                rows={3}
                value={q.answer}
                onChange={(e) => field("answer", e.target.value)}
              />
            </label>
            <label className="field">
              {tr("common.explanation")}
              <textarea
                rows={3}
                value={q.explanation}
                onChange={(e) => field("explanation", e.target.value)}
              />
            </label>
            <label className="field">
              {tr("editor.optional_hint")}
              <textarea
                rows={2}
                value={q.hint ?? ""}
                placeholder={tr(
                  "editor.a_cue_or_a_starting_point_without_giving_away",
                )}
                onChange={(e) => field("hint", e.target.value || undefined)}
              />
              <small>
                {tr(
                  "editor.shown_only_when_requested_during_open_recall_hint_assisted",
                )}
              </small>
            </label>
            {q.options && (
              <>
                <label className="field">
                  {tr("editor.choices_one_per_line")}
                  <textarea
                    rows={4}
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      field("options", e.target.value.split("\n"))
                    }
                  />
                </label>
                <label className="field">
                  {tr("editor.correct_choices_one_per_line")}
                  <textarea
                    rows={2}
                    value={(q.correct ?? [q.answer]).join("\n")}
                    onChange={(e) =>
                      field("correct", e.target.value.split("\n"))
                    }
                  />
                </label>
              </>
            )}
            {q.acceptedAnswers && (
              <label className="field">
                {tr("editor.accepted_written_answers_one_per_line")}
                <textarea
                  rows={3}
                  value={q.acceptedAnswers.join("\n")}
                  onChange={(e) =>
                    field("acceptedAnswers", e.target.value.split("\n"))
                  }
                />
              </label>
            )}
            {q.requiredParts && (
              <label className="field">
                {tr("editor.required_parts_one_per_line_aliases_separated_by")}
                <textarea
                  rows={3}
                  value={q.requiredParts.map((p) => p.join(" | ")).join("\n")}
                  onChange={(e) =>
                    field(
                      "requiredParts",
                      e.target.value
                        .split("\n")
                        .map((p) => p.split("|").map((a) => a.trim())),
                    )
                  }
                />
              </label>
            )}
            <p className="small quiet">
              {tr(
                "editor.edit_scenario_variants_matching_pairs_and_rubrics_in_all",
              )}
            </p>
          </div>
        )}
        <div className="modal-foot">
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {tr("common.cancel")}
          </button>
          <button className="button primary" disabled={busy} onClick={save}>
            {busy
              ? tr("app.saving")
              : item.revision === 0
                ? tr("editor.add_question")
                : tr("editor.save_correction")}
            <Check size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
function ShareDialog({
  busy,
  onClose,
  onExport,
}: {
  busy: boolean;
  onClose: () => void;
  onExport: (progress: boolean) => void;
}) {
  const ref = useDialog(onClose);
  const [progress, setProgress] = useState(false);
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              {tr("share.take_your_learning_with_you")}
            </div>
            <h2 id="share-title">{tr("share.share_this_quiz")}</h2>
          </div>
          <button
            className="icon-button"
            aria-label={tr("share.close_export")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="quiet">
          {tr("share.a_recall_json_file_works_on_computer_and_mobile")}
        </p>
        <label className="storage-choice">
          <input
            type="checkbox"
            checked={progress}
            onChange={(e) => setProgress(e.target.checked)}
          />
          {tr("share.include_my_learning_progress")}
        </label>
        <p className="small quiet">
          {progress
            ? tr("share.use_this_to_move_your_own_progress_between_devices")
            : tr(
                "share.questions_only_your_friend_starts_with_their_own_progress",
              )}
        </p>
        <div className="modal-foot">
          <button className="button secondary" onClick={onClose}>
            {tr("common.cancel")}
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => onExport(progress)}
          >
            <Download size={16} />
            {busy ? tr("share.preparing") : tr("share.save_quiz_file")}
          </button>
        </div>
      </div>
    </div>
  );
}
function ImportDialog({
  busy,
  initialRaw,
  personal,
  onClose,
  onImport,
}: {
  busy: boolean;
  onClose: () => void;
  initialRaw: string;
  personal: boolean;
  onImport: (
    bank: unknown,
    replace: boolean,
    restoreProgress: boolean,
    dryRun: boolean,
  ) => Promise<any>;
}) {
  const [replace, setReplace] = useState(false);
  const [raw, setRaw] = useState(initialRaw),
    [error, setError] = useState("");
  const [restoreProgress, setRestoreProgress] = useState(false),
    [preview, setPreview] = useState<any>(null);
  useEffect(() => setPreview(null), [raw, replace, restoreProgress]);
  let hasProgress = false;
  try {
    hasProgress = !!parsePortable(JSON.parse(raw)).progress;
  } catch {}
  const ref = useDialog(onClose);
  const load = async (file?: File) => {
    if (!file) return;
    setError("");
    if (!file.name.endsWith(".json")) {
      setError(tr("import.use_the_cli_for_csv_or_tsv_imports_this"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(tr("import.choose_a_file_smaller_than_5_mb"));
      return;
    }
    setRaw(await file.text());
  };
  const submit = async () => {
    try {
      setError("");
      const result = await onImport(
        JSON.parse(raw),
        replace,
        restoreProgress,
        !preview,
      );
      if (!preview) setPreview(result);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              {tr("import.bring_something_to_learn")}
            </div>
            <h2 id="import-title">{tr("import.add_a_question_bank")}</h2>
          </div>
          <button
            className="icon-button"
            aria-label={tr("import.close_import")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="quiet">
          {tr("import.import_a_shared_recall_json_file_or_a_plain")}
        </p>
        <label className="file-drop">
          <Upload size={25} />
          <strong>{tr("import.choose_a_json_file")}</strong>
          <span>{tr("import.or_paste_your_bank_below")}</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </label>
        <label className="field">
          {tr("import.question_bank_json")}
          <textarea
            rows={8}
            className="code-input"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={tr("import.example")}
          />
        </label>
        {hasProgress && (
          <label className="storage-choice">
            <input
              type="checkbox"
              checked={restoreProgress}
              disabled={!personal}
              onChange={(e) => setRestoreProgress(e.target.checked)}
            />
            {personal
              ? tr(
                  "import.restore_progress_from_this_file_replace_progress_for_matching",
                )
              : tr(
                  "import.this_file_includes_progress_use_a_device_only_workspace",
                )}
          </label>
        )}
        {preview && (
          <div className="import-preview" role="status">
            <strong>{tr("import.review_import")}</strong>
            <p>
              {preview.created} {tr("import.added")}
              {preview.updated} {tr("import.updated")} {preview.unchanged}{" "}
              {tr("import.unchanged")}
              {preview.archived} {tr("import.archived")}
            </p>
            <p>
              {preview.reviewReset}{" "}
              {tr("import.objectives_will_have_progress_reset")}
              {restoreProgress
                ? tr(
                    "import.matching_progress_from_this_file_will_then_be_restored",
                  )
                : tr(
                    "import.your_existing_progress_is_kept_for_unchanged_questions",
                  )}
            </p>
          </div>
        )}
        <label className="storage-choice">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
          />
          {tr(
            "import.replace_this_deck_archive_questions_absent_from_the_file",
          )}
        </label>
        {error && (
          <p className="field-error" role="alert">
            {<ErrorMessage message={error} />}
          </p>
        )}
        <div className="modal-foot">
          <button className="button secondary" onClick={onClose}>
            {tr("common.cancel")}
          </button>
          <button
            className="button primary"
            disabled={busy || !raw.trim()}
            onClick={() => void submit()}
          >
            {busy
              ? tr("app.checking")
              : preview
                ? tr("common.apply_import")
                : tr("common.preview_import")}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  location.hostname !== "appassets.androidplatform.net"
)
  void startAppUpdates(
    navigator.serviceWorker,
    `${import.meta.env.BASE_URL}sw.js`,
  );
