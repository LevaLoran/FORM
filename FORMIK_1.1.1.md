# FORM 1.1.1 — FORMΙK: Personal activity guide

## Delivered

- **Formik** replaces the AI chatbot. There is **no neural model**, no free-form chat box, no pretend AI service and no external API calls.
- The animated SVG mascot supports seven states; eye blinking uses independent static-position paths and opacity, not transform on the eye group.
- Contextual recommendations: first show pending tasks from today; otherwise rank activity categories using today’s tasks and recent completed task history. A curated set of local ideas can be added through FORM's existing task editor. Formik does not create tasks without confirmation.
- On mobile the narrow edge handle can be repositioned vertically by dragging; the panel opens as a sheet and can be closed by the dedicated button, escape or backdrop.
- All Formik labels, questions, progress responses and curated ideas translate among ru, en, es, de, fr, it, pt, pl, tr, uk, zh, ja. A hook after the application's current language-change listeners triggers re-rendering.
- Eight selectable profile banner gradients, stored using existing `theme.color`, `theme.color2`, `theme.banner` properties and rendered by the existing CSS. GIF and image uploads unchanged; old `theme.deco` values untouched.
- Avatar frame contrast fixed for small previews; `square` removed from selection. Existing users with square stored see no frame until another is selected; no silent writes to Supabase.

## Boundaries and risks

No Supabase schema changes or new permissions are required. Recommendations read only locally available FORM mission/category history and do not transmit any profile or task data. This version has **no generative AI**.

Browser checks can validate markup, UI controls, language changes and gradients. Authenticated multi-device Supabase sync and real-device Android/APK behavior require testing in a signed-in environment; automated unauthenticated tests do **not** guarantee these.

## Files

- `form-ai-character.js`: eye fixes (historical asset path retained for offline compatibility).
- `form-ai.css`: compact draggable dock, responsive sheet and animation fixes.
- `form-ai.js`: new Formik local recommendations, questions, localization and compatibility hooks.
- `social.js`: banner gradient presets and retired square selection.
- `social.css`: brighter frame previews and gradient preset UI.
- `app.js`: application version display.
- `sw.js`: refreshed cache.
- `README.md`, `README.ru.md`, `CHANGELOG.md`: documentation.

For backwards compatibility the existing task and shared-task reaction hooks still call `window.FormAI.react`, now an alias of `window.Formik.react`.

Rollback to the exact pre-release commit or the immutable backup branch `backup/pre-formik-1.1.1-20261123` rather than force-pushing main. Existing Supabase data remains intact.
