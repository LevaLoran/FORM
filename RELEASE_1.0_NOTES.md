# FORM 1.0.0 — Release notes and deployment

## Included
- Eight UI palettes (the original Light/Dark plus six new choices), live preview, save and sync using existing user-state synchronization.
- Optional first-day theme welcome for newly registered accounts; established accounts are not prompted.
- Shared task creation requires at least one invitee in the browser; cancelled tasks are filtered from the list.
- Additional reduced-motion safeguards, Fluent-inspired transitions, updated PWA cache and version.
- SQL migration preserving `color2` in profile theme normalization, preventing loss of secondary gradient color on subsequent saves.

## Deployment
1. Back up the database and deploy the website files to GitHub Pages.
2. Compare the existing `public._theme(jsonb)` function in Supabase with the provided migration. If it matches the repository schema, apply `supabase/migrations/20261123_form_1_0_theme_color2.sql` using SQL Editor.
3. Confirm saving profile secondary color and reloading on two accounts/devices. Confirm task invites, XP, cancel/delete and RLS with separate test users.
4. Update installed PWA/Android WebView cache as appropriate.

## Not verified
Live Supabase RLS, RPC authorization, real OAuth sessions, cross-device behavior, Android APK, and browser UI were not end-to-end tested. The backend shared-task creation RPC is not included in this archive, so a direct RPC request might still allow a zero-invite task. Audit and patch the deployed function before treating that rule as server-enforced. This is a candidate release, not a security-certified production build.
