# Translate Recall

Choose **Settings → Language → English / Eesti**. The choice is saved on this device and takes effect immediately, without restarting a session. On a fresh installation, Recall uses a supported browser language, otherwise English. Translations are bundled, so they work offline without a translation service or account.

This setting translates the interface: navigation, study controls, hints about using the app, dialogs, accessibility labels and notifications. Your questions, model answers, authored hints, topic names and notes stay exactly as you wrote them. Import an Estonian question bank to study Estonian schoolwork. Changing the interface language never changes question IDs, accepted answers, dependencies or progress. The CLI's commands and JSON field names stay stable and English.

## Add or improve a language

1. Copy `src/web/locales/en.json` to a BCP 47 language filename such as `fi.json` or `pt-BR.json`. Set `meta.name` to the language's own name, such as `Suomi`. The Settings selector discovers catalog files automatically; there is no separate language list to edit.
2. Translate values, keeping the keys. For example:

   ```json
   {
     "meta.name": "Eesti",
     "common.cancel": "Loobu",
     "library.select": "Vali: {{question}}",
     "flag.followUps_one": "{{count}} jätkuküsimus",
     "flag.followUps_other": "{{count}} jätkuküsimust"
   }
   ```

   This is a small excerpt, not a complete catalog. Keep every English key, including `native.*` for Android's connection and file dialogs. Preserve placeholders such as `{{question}}`, `{{count}}` and `{{date}}` exactly. Their order can change. Preserve intentional leading/trailing spaces in messages used beside other elements. Translate the whole message naturally; never translate stable IDs, JSON property names or keyboard event values.
3. i18next uses `count` and locale-specific plural rules. Keep the English `_one` and `_other` entries; languages needing additional categories may add `_zero`, `_two`, `_few` or `_many` entries for the same base key. Use plain text, not HTML. React escapes translated text and question content. Values passed into placeholders are data, never executable templates.
4. Run `npm run check:i18n`, `npm test` and `npm run build`. The checks reject missing/empty messages, mismatched placeholders, unknown keys, literal JSX text and translated protocol comparisons. English is the runtime fallback if a message is unavailable, but shipped catalogs must pass the completeness check.
5. Open Settings, switch between English and your language, and check the library, import/editor dialogs, study controls and feedback at desktop and phone widths. Check long labels and plural counts. A language change must preserve typed answers and library selections. Then submit a pull request with the catalog and any layout fixes.

For a new UI message, add a semantic key to the English and other bundled catalogs and use `tr("your.key", { value })`. Call `useLanguage()` in a standalone React component that renders translated copy so it updates immediately. Avoid translating values used in API requests, comparisons, CSS classes or storage keys. Translate their displayed labels separately. Dates should use `getLanguage()` when formatted for display. Grading and scheduling remain in the language-independent core.

Android's build copies these same catalogs into its offline assets. Native setup defaults to the phone's supported language; changing Language inside Recall also updates native workspace labels and subsequent dialogs. No separate Android translation file is needed. A connected server supplies its own web interface, so it must run a version supporting the language setting. Android/Windows users need an updated installer for new bundled translations. The operating system's file picker and Windows installer's own controls follow their respective platform behavior.

Server/validator diagnostics can contain technical English. Recall presents a localized error and an explicit **Technical details** control for unfamiliar diagnostics; that diagnostic text is preserved to help repair the file or server. Authored quiz content is never routed through this error adapter. Read-aloud still requires an installed voice; choosing Estonian does not install a voice pack or translate a quiz.
