# TrustLock: consolidated test guide

Everything built in this chat is in this folder (the latest zip is the full project).

## 1. Run it (one time)
1. Unzip, open a terminal in the `trustlock` folder.
2. `npm install`
3. Copy your real keys into `.env.local` (Clerk, Supabase, CRON_SECRET) as in `docs/GO-LIVE.md`. Without keys it runs in demo mode.
4. `npm run dev` then open http://localhost:3000

## 2. Checks that must pass
- `npx tsc --noEmit` (no errors)
- `npx eslint src` (0 errors; 21 warnings are known)
- `npx vitest run` (134 pass; 1 fails until you add `public/how-it-works/how-it-works.mp4`)
- `npx playwright test` (45 pass; 1 fails for the same missing mp4)

## 3. What to click through by hand
**Landing page (/)**
- New top section, guarantee headline, numbered sections, slash nav with ↗, numbered case rows, Built-by block, Talk-to-us block.
- "See it in use" screenshots (real product screens, no stock or AI people).
- EN/SW switch in the top bar and on the landing page.

**Theme**
- Top bar > Theme: Match my device / Light / Dark. Reload: the choice stays. Check every page in both.

**Swahili (whole app)**
- Switch to SW, then visit: Dashboard, Contracts, a contract, New contract, Wallet, Notifications, Profile, Admin, Mail catcher, Audit log.
- Do an action (fund, deliver, reject) and check the success/error message is Swahili.
- Check dates (e.g. "7 Nov, 09:30 UTC"), time left ("siku/saa/dak"), status pills, timeline, notifications.
- Privacy and Terms stay English on purpose.
- Have a Kenyan Swahili speaker review the wording.

**Company and legal**
- Footer, Privacy and Terms show company "TrustLock", contact trustlock@gmail.com. Group 11 wording replaced by company wording.

**Real accounts (needs keys)**
- Sign up, choose role, sign in, sign out; suspended account page; admin suspend and reactivate.
- Clerk's own forms may stay English in SW.

## 4. Still for you to do
- Add `public/how-it-works/how-it-works.mp4` (I can record one with Playwright).
- Repo secrets `APP_URL` and `CRON_SECRET` for the Scheduler workflow.
- Push: `git push` and `git push team main:marktio-trustlock`.
- Delete the old Supabase access token; set your own CRON_SECRET.
- Swahili wording review.

## 5. Extras discussed
- flow-queue extension: image generation for illustrations via Google Flow (untested here; selectors may break).
- `npx @pixel-point/toolcraft`: scaffolds small tools (screenshot framer, OG-card generator). Not built yet.
