"""scripts/verify_mobile.py — render the four phone screens at device
emulation dimensions and measure them.

WHY A STUBBED API AND NOT A LOGIN. Every screen here is behind AuthGuard, and
the only way to get past it for real is a live account. Minting one would put a
fixture user back into the roster we just spent the cleanup rider emptying, and
signing in as a real rep would write sessions and audit rows for work nobody
did. So every /api/** call is answered in the browser by ROUTES below. What is
being verified is the layout, the breakpoint branch and the touch targets —
which is exactly what the stubs leave untouched.

WHAT THIS IS NOT. Chrome device emulation, not a phone. It gets the viewport,
the DPR, the touch flags and the pointer media query right; it does not get
iOS Safari's dynamic viewport, the real home indicator, or how a glove behaves
on glass. No real-device claim is made anywhere off the back of it.

Service workers are BLOCKED for this run: a cache-first worker in front of a
route-stubbed origin would serve the stub to the next assertion and hide a
regression. The worker is verified separately, against the deploy.

    python scripts/verify_mobile.py            # writes screenshots + a report
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import Route, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "verification"
PORT = 4173
BASE = f"http://localhost:{PORT}"

# iPhone 14 / 15 CSS pixels. 390 is the width the mobile branch has to work at;
# 844 is what decides how much of a list a rep sees without scrolling.
PHONE = {"width": 390, "height": 844}
DESKTOP = {"width": 1440, "height": 900}

USER = {"id": "u-1", "email": "rep@example.test", "name": "Dana Reyes",
        "role": "rep", "must_change_password": False}

TODAY = "2026-08-04"


def _kpis() -> dict:
    return {
        "scope": "mine", "window_days": 30,
        "open_pipeline_cents": 486_000_00, "weighted_pipeline_cents": 212_400_00,
        "stale_deals": 4, "won": 3, "lost": 1,
        "won_prev": 2, "lost_prev": 2,
        "won_value_cents": 128_000_00, "won_value_prev_cents": 96_000_00,
        "calls_prev": 31, "emails_prev": 12,
        "win_rate": 0.75, "avg_days_to_close": 41.0,
        "calls": 38, "emails": 17, "tasks_due_today": 3,
    }


def _funnel_panel() -> dict:
    stages = [
        ("New", 42, None, None), ("Qualified", 30, 12, 71),
        ("Quoted", 18, 12, 60), ("Negotiating", 11, 7, 61),
        ("Closed Won", 6, 5, 55),
    ]
    return {
        "kind": "report", "saved_report_id": "r-1", "size": "half",
        "name": "Sell funnel",
        "definition": {"source": "deals"},
        "result": {"viz": "funnel", "columns": [], "rows": [], "pipelines": [{
            "pipeline_id": "p-1", "pipeline_name": "Default sell pipeline",
            "stages": [{
                "stage_id": f"s-{i}", "name": n, "position": i, "reached": reached,
                "drop_from_prev": drop, "conversion_from_prev_pct": conv,
                "completed_visits": reached, "avg_days_in_stage": 6.2,
                "median_days_in_stage": 5,
            } for i, (n, reached, drop, conv) in enumerate(stages)],
        }]},
    }


def _upnext() -> dict:
    return {"scope": "mine", "items": [
        {"id": "t-1", "title": "Call Ridgeline Excavating about the 336F",
         "due_at": f"{TODAY}T14:00:00Z", "overdue": False,
         "deal_id": "d-1", "contact_id": None},
        {"id": "t-2", "title": "Send the Peterbilt 389 spec sheet",
         "due_at": "2026-08-01T17:00:00Z", "overdue": True,
         "deal_id": None, "contact_id": "c-2"},
        {"id": "t-3", "title": "Confirm transport for the Volvo A40G",
         "due_at": f"{TODAY}T21:00:00Z", "overdue": False,
         "deal_id": "d-2", "contact_id": None},
    ]}


CONTACTS = [
    ("c-1", "Marcus Whitfield", "marcus@ridgeline-exc.test", "(432) 555-0117",
     "buyer", "Ridgeline Excavating"),
    ("c-2", "Priya Raman", "priya@basinhaul.test", "(806) 555-0182",
     "seller", "Basin Haul & Rigging"),
    ("c-3", "Danny Okafor", "danny@caprockdirt.test", None,
     "buyer", "Caprock Dirtworks"),
    ("c-4", "Sam Delgado", "sam@permianlift.test", "(915) 555-0143",
     "consigner_contact", "Permian Lift Services"),
    ("c-5", "Terri Lockhart", "terri@sandhillsagg.test", "(325) 555-0198",
     "buyer", "Sandhills Aggregate"),
]


def _contact_rows() -> list[dict]:
    return [{
        "id": cid, "name": name, "first_name": name.split()[0],
        "last_name": name.split()[-1], "email": email, "phone": phone,
        "contact_type": ctype, "hunting_for": None, "industries": [],
        "equipment_types": [], "source": "rep", "company_id": f"co-{cid}",
        "company_name": company, "owner_id": "u-1", "owner_name": "Dana Reyes",
        "sales_lead_status": None, "last_activity_at": f"{TODAY}T12:00:00Z",
        "created_at": "2026-05-02T09:00:00Z",
    } for cid, name, email, phone, ctype, company in CONTACTS]


def _tasks() -> dict:
    return {"tasks": [
        {"id": "t-1", "title": "Call Ridgeline Excavating about the 336F",
         "due_at": f"{TODAY}T14:00:00Z", "deal_id": "d-1",
         "deal_name": "Ridgeline — CAT 336F", "unit_id": None, "unit_title": None},
        {"id": "t-2", "title": "Send the Peterbilt 389 spec sheet",
         "due_at": "2026-08-01T17:00:00Z", "deal_id": None, "deal_name": None,
         "unit_id": "un-9", "unit_title": "2019 Peterbilt 389"},
        {"id": "t-3", "title": "Confirm transport for the Volvo A40G",
         "due_at": f"{TODAY}T21:00:00Z", "deal_id": "d-2",
         "deal_name": "Sandhills — Volvo A40G", "unit_id": None, "unit_title": None},
        {"id": "t-4", "title": "Chase the signed consignment agreement",
         "due_at": None, "deal_id": None, "deal_name": None,
         "unit_id": None, "unit_title": None},
    ]}


# path suffix -> payload. Matched by "endswith the path part", longest first,
# so /dashboards/default cannot be swallowed by /dashboards.
ROUTES: dict[str, object] = {
    "/platform/auth/refresh": {"access_token": "stub", "user": USER},
    "/platform/auth/me": USER,
    "/platform/meta": {"preview": False, "company_name": "Asset Resource"},
    "/platform/dashboards/default": {"default": {"dashboard_id": "d1", "name": "My Day"}},
    "/platform/dashboards/d1/run": {
        "id": "d1", "name": "My Day", "default_filters": {}, "favorited": True,
        "chart_theme": "brand",
        "panels": [
            {"kind": "kpis", "size": "full", "result": _kpis()},
            _funnel_panel(),
            {"kind": "tasks", "size": "third", "result": _upnext()},
            {"kind": "activity_feed", "size": "third", "result": {
                "scope": "mine", "items": [
                    {"id": "a-1", "kind": "call", "subject": "Marcus Whitfield",
                     "call_outcome": "connected", "occurred_at": f"{TODAY}T13:10:00Z",
                     "deal_id": "d-1", "contact_id": "c-1", "unit_id": None,
                     "buyer_opportunity_id": None},
                    {"id": "a-2", "kind": "note", "subject": "Wants a walkaround video",
                     "call_outcome": None, "occurred_at": f"{TODAY}T11:02:00Z",
                     "deal_id": None, "contact_id": "c-2", "unit_id": None,
                     "buyer_opportunity_id": None},
                ]}},
        ]},
    "/platform/dashboards/d1": {
        "id": "d1", "name": "My Day", "layout": [
            {"kind": "kpis", "size": "full"},
            {"kind": "report", "saved_report_id": "r-1", "size": "half"},
            {"kind": "tasks", "size": "third"},
            {"kind": "activity_feed", "size": "third"},
        ],
        "default_filters": {}, "favorited": True, "can_edit": True,
        "chart_theme": "brand"},
    "/platform/dashboards": {"dashboards": [
        {"id": "d1", "name": "My Day", "favorited": True, "system_key": "my_day"}]},
    "/platform/contacts/owners": {"owners": [
        {"id": "u-1", "name": "Dana Reyes", "is_active": True}]},
    "/platform/contacts": {"total": 5, "page": 1, "page_size": 50,
                           "contacts": _contact_rows()},
    "/platform/tasks": _tasks(),
    "/platform/notifications": {"notifications": [], "unread": 0},
    "/platform/activity": {"items": []},
}
ROUTE_KEYS = sorted(ROUTES, key=len, reverse=True)

CONTACT_DETAIL = re.compile(r"/platform/contacts/(c-\d+)$")


def _contact_detail(cid: str) -> dict:
    row = next((r for r in _contact_rows() if r["id"] == cid), _contact_rows()[0])
    return {
        "contact": {**row, "lead_status": None, "legacy_source": None},
        "deals": [{"id": "d-1", "name": "Ridgeline — CAT 336F",
                   "value_cents": 186_000_00, "outcome": None,
                   "pipeline_name": "Default sell", "stage_name": "Quoted"}],
        "activities": [{"id": "a-1", "kind": "call", "subject": "Left a voicemail",
                        "body": "Chasing the 336F quote.",
                        "occurred_at": f"{TODAY}T13:10:00Z",
                        "call_outcome": "voicemail", "rep_name": "Dana Reyes"}],
        "tasks": [{"id": "t-1", "title": "Call about the 336F",
                   "due_at": f"{TODAY}T14:00:00Z", "done_at": None,
                   "owner_name": "Dana Reyes"}],
        "buy_opps": [], "offers": [], "consignment": None,
    }


def handle(route: Route) -> None:
    path = route.request.url.split("?")[0].split("/api", 1)[-1]
    detail = CONTACT_DETAIL.search(path)
    if detail:
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(_contact_detail(detail.group(1))))
        return
    for key in ROUTE_KEYS:
        if path == key or path.endswith(key):
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(ROUTES[key]))
            return
    # An unstubbed endpoint answers empty rather than hanging: the screens under
    # test degrade gracefully on a failed side-call by design, and a pending
    # request would freeze the screenshot instead of proving that.
    route.fulfill(status=200, content_type="application/json", body="{}")


def box(page, selector: str) -> tuple[float, float] | None:
    el = page.query_selector(selector)
    if el is None:
        return None
    b = el.bounding_box()
    return (round(b["width"], 1), round(b["height"], 1)) if b else None


def main() -> int:
    SHOTS.mkdir(exist_ok=True)
    server = subprocess.Popen(
        ["npm.cmd", "run", "preview", "--", "--port", str(PORT), "--strictPort"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    findings: list[str] = []
    failures: list[str] = []
    try:
        time.sleep(4)
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(
                viewport=PHONE, device_scale_factor=3, is_mobile=True,
                has_touch=True, service_workers="block",
                user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 "
                            "Mobile/15E148 Safari/604.1"))
            errors: list[str] = []
            ctx.on("weberror", lambda e: errors.append(str(e.error)))
            page = ctx.new_page()
            page.route("**/api/**", handle)

            # ── My Day ──────────────────────────────────────────────────────
            page.goto(BASE + "/", wait_until="networkidle")
            page.wait_for_selector(".ws-tabbar", timeout=15000)
            page.wait_for_selector(".kpi-card", timeout=15000)
            page.screenshot(path=str(SHOTS / "phone-1-myday.png"), full_page=False)

            rail = page.eval_on_selector(".kpi-row", """el => ({
                scrollW: el.scrollWidth, clientW: el.clientWidth,
                overflowX: getComputedStyle(el).overflowX,
                snap: getComputedStyle(el).scrollSnapType })""")
            findings.append(f"My Day KPI rail: {rail}")
            if rail["scrollW"] <= rail["clientW"]:
                failures.append("KPI rail does not overflow — nothing to swipe")
            if rail["overflowX"] not in ("auto", "scroll"):
                failures.append(f"KPI rail overflow-x is {rail['overflowX']}")

            # The point of My Day on a phone is seeing a number without
            # scrolling. If the header chrome pushes the first KPI off screen,
            # the screen has not been delivered however well it reflows.
            fold = page.eval_on_selector(".kpi-card", """el => ({
                top: Math.round(el.getBoundingClientRect().top),
                vh: window.innerHeight })""")
            findings.append(f"first KPI card top vs fold: {fold}")
            if fold["top"] >= fold["vh"]:
                failures.append(
                    f"first KPI card is below the fold (top {fold['top']}, viewport {fold['vh']})")

            # The composing controls and raw date pickers are desk-only.
            hidden = page.eval_on_selector_all(
                ".dash-head-actions, .dash-dates, .dash-head .back-link",
                "els => els.map(e => ({c: e.className.toString().slice(0, 24), "
                "vis: e.getBoundingClientRect().height > 0}))")
            findings.append(f"dashboard header chrome (all must be hidden): {hidden}")
            for h in hidden:
                if h["vis"]:
                    failures.append(f"dashboard header chrome still visible: {h['c']}")

            panels = page.eval_on_selector_all(
                ".dash-panel", "els => els.map(e => Math.round(e.getBoundingClientRect().width))")
            findings.append(f"My Day panel widths: {panels}")
            if len(set(panels)) > 1:
                failures.append(f"panels are not all full width on a phone: {panels}")

            stage = box(page, ".fnl-hit")
            findings.append(f"funnel stage hit area: {stage}")
            if stage and stage[1] < 44:
                failures.append(f"funnel stage is {stage[1]}px tall (< 44)")

            tabs = page.eval_on_selector_all(
                ".ws-tab", "els => els.map(e => ({t: e.innerText.trim(), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width)}))")
            findings.append(f"tab bar: {tabs}")
            if len(tabs) != 4:
                failures.append(f"expected 4 tabs, found {len(tabs)}")
            for t in tabs:
                if t["h"] < 44 or t["w"] < 44:
                    failures.append(f"tab {t['t']} is {t['w']}x{t['h']} (< 44)")

            if page.query_selector(".ws-sidebar"):
                failures.append("desktop sidebar is still rendered on a phone")
            search = box(page, ".ws-miconbtn")
            findings.append(f"topbar search button: {search}")

            # ── Contacts ────────────────────────────────────────────────────
            page.goto(BASE + "/contacts", wait_until="networkidle")
            page.wait_for_selector(".mc-list", timeout=15000)
            page.screenshot(path=str(SHOTS / "phone-2-contacts.png"))
            if page.query_selector(".plat-table"):
                failures.append("contacts still renders the desktop table on a phone")
            call = box(page, ".mc-call")
            openrow = box(page, ".mc-main")
            findings.append(f"contacts: call target {call}, open-row target {openrow}")
            if call and call[1] < 44:
                failures.append(f"tel: target is {call[1]}px tall (< 44)")
            if openrow and openrow[1] < 44:
                failures.append(f"contact open target is {openrow[1]}px tall (< 44)")

            # ── Contact detail: card over timeline ──────────────────────────
            page.goto(BASE + "/contacts/c-1", wait_until="networkidle")
            page.wait_for_selector(".crecord-col", timeout=15000)
            page.wait_for_timeout(400)
            page.screenshot(path=str(SHOTS / "phone-3-contact-detail.png"))
            cols = page.eval_on_selector_all(
                ".crecord-col", "els => els.map(e => Math.round(e.getBoundingClientRect().top))")
            findings.append(f"contact detail column tops (stacked if ascending): {cols}")
            if len(cols) > 1 and cols != sorted(cols):
                failures.append(f"contact detail is not stacked: {cols}")

            # ── Tasks ───────────────────────────────────────────────────────
            page.goto(BASE + "/tasks", wait_until="networkidle")
            page.wait_for_selector(".upnext-list", timeout=15000)
            page.screenshot(path=str(SHOTS / "phone-4-tasks.png"))
            if page.query_selector(".plat-table"):
                failures.append("tasks still renders the desktop table on a phone")
            # The checkbox's HIT area is bigger than its box (an invisible
            # ::after), so measuring the box would understate it. Probe the
            # corners of the intended 44x44 instead: what a thumb actually hits
            # is whatever elementFromPoint returns there.
            checks = page.eval_on_selector_all(".upnext-check", """els => els.map(e => {
                const r = e.getBoundingClientRect()
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2
                const corners = [[-20, -20], [20, -20], [-20, 20], [20, 20]]
                const hits = corners.every(([dx, dy]) => {
                    const t = document.elementFromPoint(cx + dx, cy + dy)
                    return t === e || e.contains(t)
                })
                return {box: [Math.round(r.width), Math.round(r.height)], hits44: hits} })""")
            rows = page.eval_on_selector_all(
                ".upnext-row", "els => els.map(e => Math.round(e.getBoundingClientRect().width))")
            findings.append(f"tasks: {len(rows)} rows at width {set(rows)}, "
                            f"checkbox {checks[0] if checks else None}")
            for c in checks:
                if not c["hits44"]:
                    failures.append(f"task checkbox does not receive taps across 44x44 (box {c['box']})")

            # ── Quick Log via the Log tab ───────────────────────────────────
            page.click(".ws-tab-log")
            page.wait_for_selector(".ql-modal", timeout=10000)
            page.wait_for_timeout(400)
            page.screenshot(path=str(SHOTS / "phone-5-quicklog.png"))
            sheet = page.eval_on_selector(".ql-modal", """el => {
                const r = el.getBoundingClientRect()
                return {w: Math.round(r.width), h: Math.round(r.height),
                        vw: window.innerWidth, vh: window.innerHeight} }""")
            findings.append(f"quick-log sheet: {sheet}")
            if sheet["w"] < sheet["vw"] - 1:
                failures.append(f"quick-log sheet is {sheet['w']}px wide, viewport {sheet['vw']}")
            if sheet["h"] < sheet["vh"] - 1:
                failures.append(f"quick-log sheet is {sheet['h']}px tall, viewport {sheet['vh']}")
            foot = page.eval_on_selector(".ql-scrim .ws-modal-foot", """el => {
                const r = el.getBoundingClientRect()
                return {bottom: Math.round(r.bottom), vh: window.innerHeight} }""")
            findings.append(f"quick-log action bar vs viewport bottom: {foot}")
            if foot["vh"] - foot["bottom"] > 24:
                failures.append(
                    f"quick-log actions float {foot['vh'] - foot['bottom']}px above the bottom")
            head = page.inner_text(".ws-modal-head h3")
            findings.append(f"quick-log opened on: {head!r}")
            if head.strip() != "Log a call":
                failures.append(f"Log tab did not pre-select call (opened {head!r})")
            chips = page.eval_on_selector_all(
                ".ql-chip", "els => els.map(e => Math.round(e.getBoundingClientRect().height))")
            findings.append(f"outcome chip heights: {sorted(set(chips))}")
            for h in chips:
                if h < 44:
                    failures.append(f"an outcome chip is {h}px tall (< 44)")

            ctx.close()

            # ── Desktop, unchanged ──────────────────────────────────────────
            dctx = browser.new_context(viewport=DESKTOP, service_workers="block")
            dctx.on("weberror", lambda e: errors.append("desktop: " + str(e.error)))
            dpage = dctx.new_page()
            dpage.route("**/api/**", handle)
            dpage.goto(BASE + "/", wait_until="networkidle")
            dpage.wait_for_selector(".ws-sidebar", timeout=15000)
            dpage.screenshot(path=str(SHOTS / "desktop-myday.png"))
            if dpage.query_selector(".ws-tabbar"):
                failures.append("the mobile tab bar leaked onto the desktop layout")
            if not dpage.query_selector(".ws-cmd"):
                failures.append("desktop command bar is missing")
            drail = dpage.eval_on_selector(".kpi-row", """el => ({
                wrap: getComputedStyle(el).flexWrap,
                overflowX: getComputedStyle(el).overflowX })""")
            findings.append(f"desktop KPI row (must stay wrapped): {drail}")
            if drail["wrap"] != "wrap":
                failures.append(f"desktop KPI row is no longer wrapping: {drail}")
            dctx.close()
            browser.close()

            if errors:
                failures.extend(f"page error: {e}" for e in errors)
    finally:
        server.terminate()

    print("── verification notes " + "─" * 46)
    print(f"emulation: Chrome device emulation, {PHONE['width']}x{PHONE['height']} CSS px, "
          "DPR 3, touch, iOS UA. Not a real device.")
    for f in findings:
        print("  " + f)
    print()
    if failures:
        print(f"FAIL ({len(failures)}):")
        for f in failures:
            print("  ✗ " + f)
        return 1
    print("PASS — all mobile assertions held, desktop unchanged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
