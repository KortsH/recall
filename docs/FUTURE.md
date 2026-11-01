# Future work

Exam studying stays the priority. These items should not delay working quizzes.

## Next priority: simple installation

Requested for **1 November 2026**, later today. This is pending implementation.

- [ ] Provide an end-user download/install link on the GitHub page, backed by a packaged installer or release executable. Using Recall should not require understanding the development stack.
- [ ] Support cloning the repository and running one documented setup command. Detect prerequisites, install or guide their setup, create private configuration, prepare PostgreSQL, migrate the database, build/start Recall and open the app. Prioritise Windows; document support for other platforms explicitly.
- [ ] Offer two clear setup paths: connect to an existing Recall server, or run a standalone installation with PostgreSQL managed by the setup flow. Connecting to an existing server must not install a second database.
- [ ] Use private local configuration and safe defaults. Repeated setup and updates must preserve questions, progress and existing settings; explain where data lives and how to back it up or uninstall.
- [ ] Verify installation on a clean environment, including missing prerequisites, first launch and a repeated setup/update.
- [ ] Put the actual download link and exact installation/start commands prominently in the README, separately from contributor/development instructions. Document remaining system requirements and recovery steps. Do not advertise the installer as available before it exists.

## Other follow-up

- Android starter now exists in `mobile/android`: configurable HTTPS connection, shared web study engine, JSON file picker, and downloaded study. Next: device testing, stable release signing, connection-change handling for unsynced progress, and a native iOS client. The PWA supports both platforms now.
  Tracked in [issue #1](https://github.com/KortsH/recall/issues/1).
- Portable bundles containing a deck and optional progress; import from the phone/computer file picker after transferring through Files, WhatsApp, email, or another channel. Do not integrate a messaging service simply to transfer a file.
  Tracked in [issue #2](https://github.com/KortsH/recall/issues/2).
- Explicit progress merge/reset choices for imported bundles, with previews and stable IDs.
- Offline question editing and a conflict-resolution interface. Current question editing/importing is an explicit online action; downloaded studying works offline.
  Tracked with operations follow-up in [issue #3](https://github.com/KortsH/recall/issues/3).
- More complete automatic API description and generated native clients.
- Multi-user accounts and authentication for public hosting. Current home deployment is single-user and private to the tailnet.
- Configurable backup retention, alerts, and a separate off-site copy.
- Additional past-paper exercises: Chinese Wall write rule and multi-step HRU reasoning. Aim for roughly 40% recall / 60% application in later banks. The compact foundation bank intentionally remains recall-heavy.

Any host that supports Node + PostgreSQL can run Recall. Private VPN access and an existing Docker database network are deployment choices, not requirements of the learning engine.
