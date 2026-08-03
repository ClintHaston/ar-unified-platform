# BUILD SPEC: Rep Dashboards frontend ("My Day") — ar-unified-platform
# 2026-08-02. Approved by Clint. Backend is live first (backend repo REPDASH_SPEC.md):
# /platform/my/kpis + /platform/my/activity-feed (role-scoped), dashboards +
# saved_reports visibility (private|team), rep access + forced self-scoping in
# reports/dashboards, My Day auto-provision with 'kpis' + 'activity_feed' panel
# kinds. Read the backend's newest commits to confirm exact API shapes before coding.

## Ground rules
1. Frontend-only; preview-safe. No backend changes here.
2. THE RETHEME IS LAW (commit 67e3279): light chrome, ink #1A212E, yellow #F3CE00
   fills always with ink text, --p-gold-text for small yellow text, cream hover,
   Poppins body, tokens in src/index.css. New components must use the tokens.
3. prefers-reduced-motion gating on any animation, as the shell already does.
4. npm run build must pass. Commit main + push (Vercel auto-deploys).

## Build
1. Nav: reps see Reports + Dashboards (currently admin-gated in AppSidebar and
   any route guards). Rep view hides/locks the owner filter to Mine everywhere
   (server forces it anyway; the UI must not pretend otherwise).
2. Dashboard rendering: support the two new panel kinds:
   - 'kpis': card row from GET /platform/my/kpis — open pipeline, weighted
     pipeline, win rate, avg days to close, calls, emails, tasks due today,
     stale deals. Money renders from cents via the existing fmt helpers.
     Cards use the retheme (white cards, ink numbers, small muted labels).
   - 'activity_feed': list from GET /platform/my/activity-feed — kind icon,
     subject, relative time, deep links to /deals/{id} etc. Empty state per the
     writing idiom: an invitation to act, not mood.
3. My Day: renders for every user via the existing default-dashboard flow; a
   rep landing on / with no default sees My Day. Honest-sparse is fine.
4. Dashboards index: show owner + visibility; reps can create/edit/delete THEIR
   OWN only (server enforces; UI matches). Admin can set visibility team.
5. Verify: build green, push, then curl the deployed bundle URL and confirm the
   new chunk exists. Print FINAL REPORT: what shipped, files touched, any API
   mismatches found against the backend and how resolved.
