/**
 * TOURS / BOOKINGS AUTHORITY V1 — setting the hours is not booking the family.
 *
 * All nine Tour mutations answered to `requireAdminOrOps()`, which resolves PORTAL ADMISSION and no
 * role. Anyone who could reach the portal could rewrite the organization's tour availability, and
 * could confirm, cancel or no-show any family's tour. This file proves three things:
 *
 *   1. each key opens its OWN family and nothing else — a configurer cannot cancel a tour, a booker
 *      cannot change availability;
 *   2. the near-misses open nothing: `scheduling.write` is the key most likely to be mistaken for
 *      tour availability, and a role LABELLED "Tour Administrator" carries no authority at all;
 *   3. the seeded packages behave as approved — admin and ops both hold both keys.
 *
 * 403 is the gate refusing; anything else is the gate admitting, because every gate runs before the
 * handler reads its body. A 400 or 404 is therefore a PASS for an authorized persona.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "tours-authority");
const PASSWORD = "alloy-local-cert";

/** Deliberately absent ids: the gate runs first, so a refusal is authority and never data. */
const NO_RULE = "99999999-0000-4000-8000-000000000501";
const NO_BOOKING = "99999999-0000-4000-8000-000000000502";

const PERSONAS = {
    configurer: { email: "cert.tourconfig@northwind.invalid" },
    booker: { email: "cert.tourbooker@northwind.invalid" },
    titular: { email: "cert.tourtitular@northwind.invalid" },
    scheduler: { email: "cert.toursched@northwind.invalid" },
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
} as const;

/*
 * The seeded operator administrator is `qa.operator@northwind.invalid` — there is no
 * `cert.admin@…`. A first run silently skipped the admin half because the sign-in failed and the
 * loop simply continued, so PHASE 4 proved only ops while reporting green. The skip is now an
 * explicit failure.
 */
const SEEDED = { admin: { email: "qa.operator@northwind.invalid" }, ops: { email: "cert.ops@northwind.invalid" } };

type Door =
    | "ruleCreate" | "ruleEdit" | "ruleDelete"
    | "bookingCreate" | "confirm" | "cancel" | "complete" | "noShow" | "reschedule";

type Session = { page: Page; request: APIRequestContext; signedIn: boolean; close: () => Promise<void> };

async function signIn(browser: Browser, email: string): Promise<Session> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let signedIn = true;
    try {
        await page.waitForURL("**/workspace**", { timeout: 90_000 });
    } catch {
        signedIn = false;
    }
    return { page, request: page.request, signedIn, close: () => context.close() };
}

async function knock(r: APIRequestContext, door: Door): Promise<number> {
    const no = { data: {}, failOnStatusCode: false } as const;
    const B = `/api/admin/tours/bookings/${NO_BOOKING}`;
    switch (door) {
        case "ruleCreate": return (await r.post("/api/admin/tours/availability-rules", no)).status();
        case "ruleEdit": return (await r.patch(`/api/admin/tours/availability-rules/${NO_RULE}`, no)).status();
        case "ruleDelete": return (await r.delete(`/api/admin/tours/availability-rules/${NO_RULE}`, { failOnStatusCode: false })).status();
        case "bookingCreate": return (await r.post("/api/admin/tours/bookings", no)).status();
        case "confirm": return (await r.post(`${B}/confirm`, no)).status();
        case "cancel": return (await r.post(`${B}/cancel`, no)).status();
        case "complete": return (await r.post(`${B}/complete`, no)).status();
        case "noShow": return (await r.post(`${B}/no-show`, no)).status();
        case "reschedule": return (await r.post(`${B}/reschedule`, no)).status();
    }
}

const admitted = (s: number) => s !== 403;
const CONFIGURE: Door[] = ["ruleCreate", "ruleEdit", "ruleDelete"];
const BOOK: Door[] = ["bookingCreate", "confirm", "cancel", "complete", "noShow", "reschedule"];
const ALL: Door[] = [...CONFIGURE, ...BOOK];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Tours authority — two powers, independently delegable", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — each key opens its own family and no other", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            configurer: CONFIGURE,
            booker: BOOK,
            titular: [],
            scheduler: [],
            portalOnly: [],
        };
        for (const [name, p] of Object.entries(PERSONAS) as [keyof typeof PERSONAS, { email: string }][]) {
            const s = await signIn(browser, p.email);
            expect(s.signedIn, `${name} could not sign in`).toBe(true);
            for (const door of ALL) {
                const status = await knock(s.request, door);
                record(name, door, status);
                const expected = owns[name].includes(door);
                expect(
                    admitted(status),
                    `${name} at ${door}: expected ${expected ? "ADMITTED" : "REFUSED (403)"}, got ${status}`,
                ).toBe(expected);
            }
            await s.close();
        }
    });

    test("PHASE 2 — availability is not a schedule, and the nearest key proves it", async ({ browser }) => {
        /*
         * `scheduling.write` is the borrowing this slice most plausibly could have made. If it
         * opened availability, the two keys would be one key with extra steps.
         */
        const s = await signIn(browser, PERSONAS.scheduler.email);
        for (const door of CONFIGURE) {
            expect(await knock(s.request, door), `scheduling.write must not open ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 3 — the role LABEL carries nothing", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.titular.email);
        expect(s.signedIn, "the titular admin must still reach the portal").toBe(true);
        for (const door of ALL) {
            expect(await knock(s.request, door), `a role NAMED Tour Administrator must be refused at ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 4 — the seeded packages hold both keys, as approved", async ({ browser }) => {
        for (const [name, p] of Object.entries(SEEDED)) {
            const s = await signIn(browser, p.email);
            // A persona that cannot sign in must FAIL this phase, never skip it: a silent skip is
            // how a package goes unproven while the suite reports green.
            expect(s.signedIn, `seeded ${name} could not sign in; PHASE 4 cannot prove its package`).toBe(true);
            for (const door of ALL) {
                const status = await knock(s.request, door);
                record(`default_${name}`, door, status);
                expect(admitted(status), `default ${name} holds both Tours keys and must reach ${door}; got ${status}`).toBe(true);
            }
            await s.close();
        }
    });
});
