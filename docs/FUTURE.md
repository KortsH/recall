# Future work

Exam studying stays the priority. These items should not delay working quizzes.

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
