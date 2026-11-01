# Future work

Exam studying stays the priority. These items should not delay working quizzes.

- Native Android/iOS clients consuming the same API and downloaded study engine. The installable PWA is the first mobile version; no separate native app is claimed yet.
- Portable bundles containing a deck and optional progress; import from the phone/computer file picker after transferring through Files, WhatsApp, email, or another channel. Do not integrate a messaging service simply to transfer a file.
- Explicit progress merge/reset choices for imported bundles, with previews and stable IDs.
- Offline question editing and a conflict-resolution interface. Current question editing/importing is an explicit online action; downloaded studying works offline.
- More complete automatic API description and generated native clients.
- Multi-user accounts and authentication for public hosting. Current home deployment is single-user and private to the tailnet.
- Configurable backup retention, alerts, and a separate off-site copy.
- Additional past-paper exercises: Chinese Wall write rule and multi-step HRU reasoning. Aim for roughly 40% recall / 60% application in later banks. The compact foundation bank intentionally remains recall-heavy.

Any host that supports Node + PostgreSQL can run Recall. Tailscale and the named home-server Docker network are deployment choices, not requirements of the learning engine.
