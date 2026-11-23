# FORM. — Shape yourself

<div align="center">

[![Open app](https://img.shields.io/badge/open-levaloran.github.io%2FFORM-111111?style=flat)](https://levaloran.github.io/FORM/)
![Version](https://img.shields.io/badge/version-1.0.2-2563eb?style=flat)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat)
![Languages](https://img.shields.io/badge/languages-12-22863a?style=flat)
[![Deploy](https://github.com/LevaLoran/FORM/actions/workflows/pages.yml/badge.svg)](https://github.com/LevaLoran/FORM/actions/workflows/pages.yml)

[![Stars](https://img.shields.io/github/stars/LevaLoran/FORM?style=flat&logo=github)](https://github.com/LevaLoran/FORM/stargazers)
[![Issues](https://img.shields.io/github/issues/LevaLoran/FORM?style=flat&logo=github)](https://github.com/LevaLoran/FORM/issues)
[![Last commit](https://img.shields.io/github/last-commit/LevaLoran/FORM?style=flat&logo=github)](https://github.com/LevaLoran/FORM/commits/main)

**A minimal task tracker with RPG progression.**  
Complete everyday tasks, earn XP, climb ranks, unlock skills — and keep the same progress on every device.

[Open the app](https://levaloran.github.io/FORM/) · [Русский](README.ru.md) · [Українська](README.uk.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [中文](README.zh.md) · [日本語](README.ja.md)

</div>

---

## Why FORM.

Most to-do apps stop at checkboxes. FORM. turns the same daily work into a long-term character build:

- **Tasks** → XP and skill points
- **Ranks** from Novice to Legend, each with its own emblem
- **Skill tree** with four tiers per branch and cross-branch requirements
- **Awards**, streaks, calendar heatmaps
- **Friends**, public profiles, and **shared tasks**

The UI stays quiet and readable — light and dark themes, no clutter.

## Features

### Tasks & progress
- One-off and daily tasks (edit or delete a daily series in one place)
- Undo a completion the same day — XP and skill points roll back
- Optional short completion sound
- Up to 10 tasks per day, 5 XP each
- 11 ranks with rising XP thresholds
- Skill tree: 6 branches × 4 tiers × 6 levels
- 7 awards that stay unlocked even if you reset XP

### Statistics
- Month calendar with per-day details
- 12-month activity heatmap
- History, category breakdown, daily report
- XP reset for the last 7 / 30 / 365 days (awards are kept)

### Account & data
- Sign in with **GitHub** or **email + password**
- Cloud sync across devices with offline queue and three-way merge
- Server-side backups and restore from Profile
- Export / import JSON
- Avatar of any size (preview on device, original in private storage)

### Social
- Permanent **FORM ID** (`FORM#483921`)
- Friends, requests, online status, blocks
- Customizable public profile (banner, frame, bio, links, pinned awards)
- Privacy controls for profile, invites, and shared-task visibility
- **Shared tasks** with friends: invite, track progress, split the XP reward

### Interface
- Bottom nav (Home, Stats, Friends, Profile) + top chips for the rest
- Mini progress bar (rank + quick “new task”)
- 12 UI languages
- Light / dark theme, optional reduced motion

## How progress works

| Rule | Detail |
| --- | --- |
| XP | 5 per completed task |
| Daily limit | 10 tasks |
| Ranks | 11 steps; thresholds live in `app.js` (`rankThresholds`) |
| Skills | Each completion adds a point to the task’s branch |
| Streak | Consecutive days with at least one completion |
| Awards | Never revoked by undo or XP reset |

## Quick start (users)

1. Open **[https://levaloran.github.io/FORM/](https://levaloran.github.io/FORM/)**
2. Choose a language
3. Sign in with GitHub or create an email account
4. Add a task, mark it done, watch XP and skills grow

On a phone: **Add to Home Screen** (iOS) or **Install app** (Android / Chrome).

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. Service worker and `crypto.randomUUID` need HTTPS or `localhost`.

For sign-in and sync, put your public Supabase keys in `config.js` (see [Owner setup](#owner-setup-supabase)).

## Owner setup (Supabase)

One-time configuration by the project owner. **Never** put `service_role` or OAuth client secrets in the repo.

1. Create a project on [supabase.com](https://supabase.com).
2. **SQL Editor** → run `supabase/setup.sql` (safe to re-run).
3. **Authentication → URL Configuration** → Site URL and Redirect URLs = your Pages URL (and `http://localhost:8000/` for dev).
4. Enable **Email** (and optionally **GitHub**) under Providers.
5. Set repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`, or write them into `config.js`.
6. For real users, configure custom SMTP under Authentication → Emails (built-in mail is test-only).

File size limits are controlled by the Supabase project (free tier ≈ 50 MB per file). The app does not add its own upload cap.

## Project layout

```
.
├── index.html           screens & shell
├── style.css            themes & base UI
├── app.js               state, tasks, ranks, skills, storage
├── extras.js            calendar, avatars, sound, effects
├── settings.js          settings & XP reset
├── social.js / .css     FORM ID, friends, profiles, privacy
├── shared-tasks.js/.css shared tasks with friends
├── ui.js / ui.css       chips, mini bar, ASCII accents
├── auth.js              sign-in / sign-up
├── sync.js              cloud sync & merge
├── upload.js            resumable photo uploads (TUS)
├── i18n.js + lang-data.js  12 languages
├── config.js            public Supabase config
├── sw.js                offline cache
├── supabase/setup.sql   tables, RLS, storage
└── CHANGELOG.md
```

## Translations

Source language is **Russian** (dictionary keys are Russian strings). Fallback chain: selected language → English → Russian.

| Code | Language |
| --- | --- |
| `ru` | Русский |
| `en` | English |
| `es` | Español |
| `de` | Deutsch |
| `fr` | Français |
| `it` | Italiano |
| `pt` | Português |
| `pl` | Polski |
| `tr` | Türkçe |
| `uk` | Українська |
| `zh` | 中文 |
| `ja` | 日本語 |

To add a language: extend `LANGS` in `i18n.js` and add `window.FORM_I18N.xx = { ... }` in `lang-data.js`.

## Limits & notes

- The site is static. Sign-in UI is not security by itself — **RLS policies** in `setup.sql` protect cloud data.
- Simultaneous edits of the *same* task on two devices: last successful sync wins; completions are not lost.
- Import merges with the cloud; use **Backups** in Profile to roll back.
- GIF avatars/banners are size-capped; large animations need Storage later.

## Contributing

Found a bug or have an idea? Open an [Issue](https://github.com/LevaLoran/FORM/issues) with steps, expected vs actual result, device, and browser.

When changing code:

1. No build step and no npm dependencies — keep it that way.
2. Bump `CACHE` in `sw.js` whenever cached assets change.
3. Add new UI strings to **all** dictionaries in `lang-data.js`.

## License

License is not declared yet. Contact the maintainer before redistributing.

## Docs in other languages

- [Русский](README.ru.md)
- [Українська](README.uk.md)
- [Español](README.es.md)
- [Deutsch](README.de.md)
- [中文](README.zh.md)
- [日本語](README.ja.md)

Full version history: [CHANGELOG.md](CHANGELOG.md).
