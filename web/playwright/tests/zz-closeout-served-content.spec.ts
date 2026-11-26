import { test } from "@playwright/test";

/**
 * CLOSEOUT — SERVED CONTENT CONTAINMENT.
 *
 * Proves the DEPLOYED bundle contains each behavioural repair of this programme by CONTENT,
 * not by SHA equality, because peers promote frequently and a matching SHA is not a matching
 * product. It collects every JS and CSS body the adminV2 workspace route actually loads and
 * counts the markers each repair leaves in minified output.
 *
 * Not a latency probe: nothing here is timed and nothing is asserted about duration.
 *
 * PRIVACY: counts, URL paths and build metadata only. No names, no business values.
 */
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });

test("served content contains every repair", async ({ page }) => {
    const bodies = new Map<string, string>();
    page.on("response", async (res) => {
        const u = res.url();
        if (!/\.(js|css)(\?|$)/.test(u)) return;
        try { bodies.set(u, await res.text()); } catch { /* opaque or aborted */ }
    });

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const landedAt = new URL(page.url()).pathname;
    const authed = !/\/login|\/sign-in/.test(landedAt);
    // Enter a Work Unit so the focus-panel and financials chunks are demanded too.
    const row = page.locator('[data-work-unit-row], [data-queue-row], a[href*="/adminV2/workspace/"]').first();
    if (await row.count()) {
        await row.click({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(8000);
    }
    for (const tab of ["Financials", "Accounts", "Details"]) {
        const t = page.getByRole("tab", { name: tab }).or(page.getByRole("link", { name: tab })).first();
        if (await t.count()) { await t.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3500); }
    }

    const all = [...bodies.values()].join("\n");
    const count = (needle: string) => all.split(needle).length - 1;

    const sha = await page.evaluate(async () => {
        try {
            const r = await fetch("/api/build-info");
            const j = await r.json();
            return String(j.gitSha || "").slice(0, 9);
        } catch { return "unreadable"; }
    });

    const markers: Record<string, number> = {
        // Repair 3 — reload floor origin predicate (PR 1313).
        originPathname: count("originPathname"),
        normalizeSoftNavReloadPathname: count("normalizeSoftNavReloadPathname"),
        // Repairs 1 and 2 — reuse redelivery + hover speculative authority (PR 1293/1296).
        speculative: count("speculative"),
        provisioningKey: count("provisioningKey"),
        // Cell readiness instrument (PR 1289/1290).
        "data-focus-panel-cell-readiness": count("data-focus-panel-cell-readiness"),
        "data-focus-panel-cell-settled-reason": count("data-focus-panel-cell-settled-reason"),
        phase_settled_unresolved: count("phase_settled_unresolved"),
        // Accounts Details scroll shrink contract (PR 1299).
        "financials-surface-role": count("financials-surface-role"),
        "alloy-os-billing--detail": count("alloy-os-billing--detail"),
    };

    // POSITIVE CONTROL. These strings exist in the adminV2 client bundle on ANY build of this
    // product. If they are absent the collection failed and every zero above is the probe's own
    // fault, not a missing repair.
    const control: Record<string, number> = {
        adminV2: count("adminV2"),
        focusPanel: count("focusPanel"),
        workUnit: count("workUnit"),
    };
    const collectionWorked = authed && Object.values(control).some((n) => n > 0);

    console.log("CLOSEOUT_SERVED " + JSON.stringify({
        servedSha: sha,
        landedAt,
        authed,
        assets: bodies.size,
        bytes: all.length,
        collectionWorked,
        control,
        markers: collectionWorked ? markers : "NOT_MEASURED_COLLECTION_FAILED",
    }));
    console.log("CLOSEOUT_DONE");
});
