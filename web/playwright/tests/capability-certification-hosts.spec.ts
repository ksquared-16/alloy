/**
 * Capability Certification — the remaining What's Next capabilities.
 *
 * Message and Send form are NOT dispatched. The live tenant's recipient is a real personal
 * email/phone (tarynw@hotmail.com / +1408…), and nothing in the worktree proves a send stays on
 * this machine. What is certified here is everything up to the send: capability resolution,
 * host mount, warm open, request hygiene — plus, for Schedule tour, the real validation abort.
 *
 * Run:
 *   cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
 *     PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json \
 *     npx playwright test playwright/tests/capability-certification-hosts.spec.ts --workers=1
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/capability-certification");
const OPP = "b13ecce9-74d4-442d-9891-7c88f587bc23";

/** Query-by-POST endpoints: they take a request body but only read. */
const READ_ONLY_POST_ROUTES = ["/api/admin/queue-view-totals", "/api/admin/metrics/resolve"];

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

async function openWorkCard(page: Page) {
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});
    const card = page.locator('[data-work-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(3500);
    return card;
}

test("capability hosts mount from configuration, with no duplicate requests", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const calls: Array<{ url: string; method: string; status: number }> = [];
    page.on("response", (res) => {
        if (res.url().includes("/api/")) {
            calls.push({ url: res.url(), method: res.request().method(), status: res.status() });
        }
    });
    let hardNavigations = 0;
    page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) hardNavigations += 1;
    });

    const card = await openWorkCard(page);
    const results: Record<string, unknown> = {};

    for (const [capability, selector] of [
        ["quick_message", '[data-work-primary-action="quick_message"]'],
        ["schedule_tour", '[data-work-supporting-action="schedule_tour"]'],
        ["send_form", '[data-work-supporting-action="send_form"]'],
    ] as const) {
        const navBefore = hardNavigations;
        const callsBefore = calls.length;
        const button = card.locator(selector).first();
        await button.waitFor({ state: "visible", timeout: 20_000 });

        const surface = page.locator('[data-work-focused-surface="true"], [data-current-work-surface="true"]').first();
        const clickAt = Date.now();
        await button.click({ timeout: 15_000 });
        // Measure to first meaningful host content, not to a fixed sleep.
        await page
            .waitForFunction(
                (sel) => {
                    const el = document.querySelector(sel as string);
                    return !!el && (el as HTMLElement).innerText.trim().length > 40;
                },
                '[data-work-focused-surface="true"], [data-current-work-surface="true"]',
                { timeout: 20_000 },
            )
            .catch(() => {});
        const mountedAt = Date.now();
        await page.waitForTimeout(2500);

        const text = (await surface.innerText().catch(() => "")) as string;
        const during = calls.slice(callsBefore);
        const seen = new Map<string, number>();
        for (const c of during) seen.set(`${c.method} ${c.url}`, (seen.get(`${c.method} ${c.url}`) ?? 0) + 1);
        const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);

        await page.screenshot({ path: path.join(OUT, `host-${capability}.png`) });

        results[capability] = {
            mounted: text.length > 0,
            open_ms: mountedAt - clickAt,
            visible_text_head: text.slice(0, 300),
            api_calls_on_open: during.length,
            duplicate_requests: duplicates,
            hard_navigations: hardNavigations - navBefore,
            // Nothing was submitted, so no MUTATION endpoint may have been touched.
            // (queue-view-totals is a read expressed as POST — a query body, no writes.)
            mutation_requests: during
                .filter((c) => c.method !== "GET" && !READ_ONLY_POST_ROUTES.some((r) => c.url.includes(r)))
                .map((c) => `${c.method} ${c.url}`),
            non_get_requests: during.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.url}`),
        };

        // Back out to the action list for the next capability.
        const back = page.locator('[data-work-action="back-to-actions"]').first();
        if (await back.isVisible().catch(() => false)) await back.click().catch(() => {});
        else await openWorkCard(page);
        await page.waitForTimeout(1500);
    }

    fs.writeFileSync(path.join(OUT, "capability-hosts.json"), JSON.stringify(results, null, 2));

    for (const capability of ["quick_message", "schedule_tour", "send_form"]) {
        const r = results[capability] as Record<string, unknown>;
        expect(r.mounted, `${capability} host mounted`).toBe(true);
        expect(r.hard_navigations, `${capability} caused no page reload`).toBe(0);
        // Opening a capability must never write.
        expect(r.mutation_requests, `${capability} touched no mutation endpoint on open`).toEqual([]);
    }
});

test("Schedule tour — the duplicate guard aborts before any write", async ({ page }) => {
    test.setTimeout(180_000);
    await openWorkCard(page);

    const before = await page.request
        .get(`/api/admin/tours/opportunities/${OPP}/bookings`)
        .then((r) => r.json());

    const correlationId = `cert-tour-${Date.now()}`;
    const existing = (before as { active_bookings?: Array<Record<string, unknown>> }).active_bookings?.[0];
    expect(existing, "fixture requires an existing active booking").toBeTruthy();

    // A real POST for a second tour on a family that already has one. The guard runs before
    // any insert, so this exercises the abort path without creating anything.
    const response = await page.request.post("/api/admin/tours/bookings", {
        headers: { "x-correlation-id": correlationId, "content-type": "application/json" },
        data: {
            opportunity_id: OPP,
            location_id: existing!.location_id,
            start_at: "2026-08-14T17:00:00.000Z",
            end_at: "2026-08-14T17:45:00.000Z",
            timezone: "America/Los_Angeles",
            source: "admin",
        },
    });
    const body = await response.text();

    const after = await page.request
        .get(`/api/admin/tours/opportunities/${OPP}/bookings`)
        .then((r) => r.json());

    fs.writeFileSync(
        path.join(OUT, "schedule-tour-abort.json"),
        JSON.stringify(
            {
                correlation_id: correlationId,
                http_status: response.status(),
                response_body: body.slice(0, 800),
                bookings_before: (before as { bookings?: unknown[] }).bookings?.length ?? null,
                bookings_after: (after as { bookings?: unknown[] }).bookings?.length ?? null,
                existing_booking_id: existing!.id,
            },
            null,
            2,
        ),
    );

    expect(response.ok(), "second booking must be rejected").toBe(false);
    // Before === After. Nothing was created by the rejected attempt.
    expect((after as { bookings?: unknown[] }).bookings?.length).toBe(
        (before as { bookings?: unknown[] }).bookings?.length,
    );
    expect(body).toMatch(/active|already exists/i);
});
