# Future work

Exam studying stays the priority. These items should not delay working quizzes.

## Next priority: simple installation

Requested for **1 November 2026**. The personal-use preview is complete. Formal publisher signing and device certification are not planned for this project.

- [x] Windows per-user installer and Android APK downloads, plus a hosted browser/PWA option. Personal use requires no Node.js, PostgreSQL, Docker or home server.
- [x] Clone and run `setup.cmd`: download the versioned Windows installer, verify SHA-256, install, add a Start-menu shortcut and open Recall.
- [x] Separate device-only and optional server workspaces. Device-only study uses IndexedDB; choosing it never installs a redundant database. Server self-hosting retains the documented Docker/PostgreSQL route.
- [x] Private local configuration, loopback-only Windows launcher, repeat-install/update preservation, backup and uninstall instructions.
- [x] Isolated installation/reinstallation, shortcut creation and loopback security tests, including running the installer/launcher with Node/PostgreSQL absent from their PATH.
- [x] README installation and sharing instructions for Windows, Android and browser/iPhone, separate from contributor setup.
- Personal-project scope: Windows remains unsigned and Android retains its existing development certificate. Paid signing, clean-VM certification and a physical-device certification matrix were declined by the owner; issue #4 is closed as not planned.

## Other follow-up

- [x] Embedded portable question/model pictures, editor upload/resize/preview, CLI image attachment/packing, local LaTeX rendering with offline fonts, sample walkthrough and authoring documentation. Alt+5/bare5 outside inputs reduce mental-recall friction while preserving numeric typing and explicit self-assessment.

- [x] Wrong-choice feedback names matching source questions, correct/mental answers show one model panel, and long answers use the available page space without nested scrolling. Shared live/offline feedback and Test secrecy are preserved.

- [x] Beginner-first README with a paste-only online-LLM workflow, complete JSON field/default reference, and a downloadable guided sample. The public walkthrough previews ordinary questions, reversals, grading, hints, matching, prerequisites, metadata and sharing without changing real study progress.

- [x] Bundled English/Estonian interface catalogs, live device-local language selection, Android setup translations and contributor translation checks/documentation.
- [ ] Community translations beyond English/Estonian and review by native-speaking contributors; physical-device accessibility and voice-pack checks in each language.

- [x] Device-local Light/Dark/System appearance, immediate header toggle and consistent lowercase r-and-dot branding across SVG, PWA icons and Android source.
- [x] Explicit read-aloud using installed local browser voices, with cancellation on card changes and no answer reading before reveal.
- [x] Browser-integrated speech-to-text for written answers: explicit microphone control, on-device default/availability checks, optional disclosed browser-service processing, language selection and direct editable answer transcription, with continuous capture across pauses. Enter stops and submits in one action; no preview/insertion step. No transcription backend or automatic submission. Unsupported browsers/WebViews retain keyboard/OS dictation.
- [ ] Physical-device speech-recognition quality, language-pack and accessibility checks across browsers; embedded WebViews may not expose recognition.
- [x] Refresh Windows/Android preview binaries with library layouts, flags, hints, dark mode, consistent branding and local voice controls (v0.4.0-preview.1).
- [x] App-update notices with explicit Save & reload, draft/reveal restoration and no automatic study reload. Settings shows the UI version and offers a manual update check.
- [x] Event-triggered update discovery on opening/foreground/reconnection, quiet persistent reminders, and Windows/Android release notifications based on the installed app version. No interval polling, auto-installation or background push service.
- [x] Android saved-state acknowledgement before native reload/workspace changes or incoming attachments; explicit choices for pending progress, recovery export and older-page fallback. Physical-device verification remains below.

- Android bundles the offline interface and supports device-only study, files, explicit server selection and guarded workspace switching. Safari PWA covers iPhone. Native iOS was excluded by the owner; issue #1 is closed as not planned.
- Portable quiz/progress files are implemented: stable IDs, import preview, additive/replacement question updates, explicit keep/replace progress choices and semantic-hash validation. Files can be transferred through Files, WhatsApp or any channel. Next: optional multi-file import and explicit resolution of simultaneous question edits.
  Tracked in [issue #2](https://github.com/KortsH/recall/issues/2).
- [x] Downloaded server workspaces queue question creation/corrections, imports/replacements, hints/flags, prerequisites and bulk topic moves offline. Full-version conflict review, idempotent server receipts and CLI edit-backup replay are implemented. Metadata edits preserve mastery; unpublished semantic corrections wait for their acknowledged server revision before entering study.
- More complete automatic API description and generated native clients.
- Multi-user accounts and authentication for public hosting. Current home deployment is single-user and private to the tailnet.
- [x] Offline export and CLI replay of pending server answers, with idempotent regrading and obsolete-revision handling. See `PORTABLE.md`.
- [x] Configurable local/two-disk retention, disposable restore verification, stale/failure status, journal alerts and an optional owner-supplied notification hook. Off-site storage is not configured or required for the personal deployment, by the owner’s choice.
- Additional past-paper exercises: Chinese Wall write rule and multi-step HRU reasoning. Aim for roughly 40% recall / 60% application in later banks. The compact foundation bank intentionally remains recall-heavy.

Any host that supports Node + PostgreSQL can run Recall. Private VPN access and an existing Docker database network are deployment choices, not requirements of the learning engine.
