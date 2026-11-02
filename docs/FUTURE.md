# Future work

Exam studying stays the priority. These items should not delay working quizzes.

## Next priority: simple installation

Requested for **1 November 2026**. The preview implementation is complete; release verification/signing follow-up remains below.

- [x] Windows per-user installer and Android APK downloads, plus a hosted browser/PWA option. Personal use requires no Node.js, PostgreSQL, Docker or home server.
- [x] Clone and run `setup.cmd`: download the versioned Windows installer, verify SHA-256, install, add a Start-menu shortcut and open Recall.
- [x] Separate device-only and optional server workspaces. Device-only study uses IndexedDB; choosing it never installs a redundant database. Server self-hosting retains the documented Docker/PostgreSQL route.
- [x] Private local configuration, loopback-only Windows launcher, repeat-install/update preservation, backup and uninstall instructions.
- [x] Isolated installation/reinstallation, shortcut creation and loopback security tests, including running the installer/launcher with Node/PostgreSQL absent from their PATH.
- [x] README installation and sharing instructions for Windows, Android and browser/iPhone, separate from contributor setup.
- [ ] Verify on clean Windows VMs and physical Android/iPhone devices; add stable Android release signing and Windows publisher signing. Current binaries are clearly identified previews.

## Other follow-up

- [x] Device-local Light/Dark/System appearance, immediate header toggle and consistent lowercase r-and-dot branding across SVG, PWA icons and Android source.
- [x] Explicit read-aloud using installed local browser voices, with cancellation on card changes and no answer reading before reveal.
- [ ] Browser-integrated speech-to-text: detect on-device recognition/language-pack availability, require explicit microphone action, preview dictated text before submission and disclose any remote processing before enabling a fallback. Test physical Android/iPhone and desktop accessibility. Until then use the device keyboard or OS dictation in the answer field.
- [x] Refresh Windows/Android preview binaries with library layouts, flags, hints, dark mode, consistent branding and local voice controls (v0.4.0-preview.1).
- [x] App-update notices with explicit Save & reload, draft/reveal restoration and no automatic study reload. Settings shows the UI version and offers a manual update check.
- [x] Android saved-state acknowledgement before native reload/workspace changes or incoming attachments; explicit choices for pending progress, recovery export and older-page fallback. Physical-device verification remains below.

- Android bundles the offline study interface, supports device-only first launch, JSON file import/export, optional HTTPS server connection and guarded switching with unsynced progress. Next: physical-device tests, stable release signing and native iOS. The PWA supports both platforms now.
  Tracked in [issue #1](https://github.com/KortsH/recall/issues/1).
- Portable quiz/progress files are implemented: stable IDs, import preview, additive/replacement question updates, explicit keep/replace progress choices and semantic-hash validation. Files can be transferred through Files, WhatsApp or any channel. Next: optional multi-file import and explicit resolution of simultaneous question edits.
  Tracked in [issue #2](https://github.com/KortsH/recall/issues/2).
- Device-only import, new questions, corrections and organization are fully offline. Downloaded server mode still requires a connection for authoring; queued server edits and revision-aware conflict review remain future work.
  Tracked with operations follow-up in [issue #3](https://github.com/KortsH/recall/issues/3).
- More complete automatic API description and generated native clients.
- Multi-user accounts and authentication for public hosting. Current home deployment is single-user and private to the tailnet.
- [x] Offline export and CLI replay of pending server answers, with idempotent regrading and obsolete-revision handling. See `PORTABLE.md`.
- Configurable backup retention, alerts, and a separate off-site copy.
- Additional past-paper exercises: Chinese Wall write rule and multi-step HRU reasoning. Aim for roughly 40% recall / 60% application in later banks. The compact foundation bank intentionally remains recall-heavy.

Any host that supports Node + PostgreSQL can run Recall. Private VPN access and an existing Docker database network are deployment choices, not requirements of the learning engine.
