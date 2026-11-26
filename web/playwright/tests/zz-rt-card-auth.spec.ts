import { test } from "@playwright/test";

/**
 * SHARED RUNTIME — WHAT DOES CARD AUTH COST NOW, ON pdx1?
 *
 * Financials card AUTH was ~217-223ms while subjects and position resolved theirs in ~2ms, and the
 * two paths are genuinely different: subjects/position go through loadAdminRouteGate, while card
 * runs requireAdminOrOps beside getAdminContextCached and getAdminAuthCached. That gap was measured
 * before the iad1 to pdx1 move, and ~220ms is suspiciously close to two of the old ~112ms remote
 * hops — so the first question is not how to close it but whether it still exists.
 *
 * All three routes publish the same two spans on the same clock: auth is admission plus access
 * resolution, perm is the capability check. Comparing them needs no new instrumentation and no
 * subtraction across origins.
 *
 * PRIVACY. The probe reads one opaque customer id out of the cohort so it can issue a legitimate
 * card request. No name, no contact, no figure and no business payload leaves the page - only span
 * durations, byte counts and status codes.
 */
const ROUNDS = Number(process.env.AUTH_ROUNDS ?? "8");

test("shared runtime card auth", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(14_000);

    const out = await page.evaluate(`(async (rounds) => {
        const sha = await (async () => {
            try { const r = await fetch("/api/build-info", { cache: "no-store" }); return ((await r.json()) || {}).gitSha || null; }
            catch (e) { return null; }
        })();
        let siteLocationId = null;
        try {
            const r = await fetch("/api/admin/locations?hierarchy=1", { credentials: "include" });
            const m = JSON.stringify(await r.json()).match(/"id":"([0-9a-f-]{36})"/);
            siteLocationId = m ? m[1] : null;
        } catch (e) { /* null is reported */ }
        if (!siteLocationId) return { sha, error: "no_site_location" };

        // One opaque subject id, so the card request is a real one. Never a name or a figure.
        let customerId = null, customerMemberId = null;
        try {
            const r = await fetch("/api/admin/financials/subjects?siteLocationId=" + encodeURIComponent(siteLocationId), { credentials: "include" });
            const j = await r.json();
            const rows = (j && (j.subjects || j.rows || j.items || j.cohort)) || [];
            const first = Array.isArray(rows) ? rows[0] : null;
            if (first) {
                customerId = first.customer_id || first.customerId || null;
                customerMemberId = first.customer_member_id || first.customerMemberId || null;
            }
            if (!customerId && !customerMemberId) {
                const m = JSON.stringify(j).match(/"customer_id":"([0-9a-f-]{36})"/);
                customerId = m ? m[1] : null;
            }
        } catch (e) { /* null is reported */ }

        const parse = (h) => {
            const o = {};
            if (!h) return o;
            for (const part of h.split(",")) {
                const m = part.trim().match(/^([A-Za-z0-9_\\-]+);dur=([0-9.]+)/);
                if (m) o[m[1]] = Number(m[2]);
            }
            return o;
        };
        const cardQ = customerId ? "customer_id=" + encodeURIComponent(customerId)
                    : customerMemberId ? "customer_member_id=" + encodeURIComponent(customerMemberId) : null;
        const ROUTES = [
            { key: "subjects", url: "/api/admin/financials/subjects?siteLocationId=" + encodeURIComponent(siteLocationId), guard: "loadAdminRouteGate" },
            { key: "position", url: "/api/admin/financials/position?siteLocationId=" + encodeURIComponent(siteLocationId), guard: "loadAdminRouteGate" },
            { key: "card",     url: cardQ ? "/api/admin/financials/card?" + cardQ : null, guard: "requireAdminOrOps+getAdminContextCached+getAdminAuthCached" },
        ];

        const samples = [];
        for (let round = 0; round < rounds; round += 1) {
            for (const r of ROUTES) {
                if (!r.url) { samples.push({ round, key: r.key, skipped: "no_subject_id" }); continue; }
                const t0 = performance.now();
                let status = null, st = {}, bytes = null, err = null;
                try {
                    const res = await fetch(r.url, { credentials: "include", cache: "no-store" });
                    status = res.status;
                    st = parse(res.headers.get("server-timing"));
                    bytes = (await res.text()).length;
                } catch (e) { err = String((e && e.name) || e).slice(0, 60); }
                samples.push({
                    round, key: r.key, guard: r.guard, status, err, bytes,
                    wall: Math.round(performance.now() - t0),
                    auth: st.auth ?? null, perm: st.perm ?? null, total: st.total ?? null,
                    spans: st,
                });
            }
        }
        return { sha, samples, haveSubjectId: !!cardQ };
    })(${ROUNDS})`);

    console.log(`[auth] ${JSON.stringify(out)}`);
});
