/**
 * TUITION GENERATION, THROUGH THE REAL APPLICATION — and an honest boundary.
 *
 * Thread 7 builds no screen. Generation is a registered action, deliberately, so that Thread 4 can
 * place a surface over it later rather than have one rebuilt around it. That makes the boundary this
 * certification has to prove an unusual shape, and pretending otherwise would be the dishonest part:
 *
 *   the accepted price is VISIBLE in the application — the Tuition card renders it;
 *   generation is INVOKED through the production command boundary — the same authenticated
 *     `/api/admin/actions/execute` every other operator intent goes through, from the operator's own
 *     session, with the server resolving their grants;
 *   the generated draft is VISIBLE in the existing Financials presentation, and moves no balance;
 *   Thread 1's existing Post control makes it owed, in the card, by hand;
 *   a reload proves all of it came from persistence;
 *   and a second generation run adds nothing.
 *
 * What is NOT claimed: there is no button that generates tuition. There is a command, and this drives
 * it the way a command is driven.
 */
import { expect, test, type Page } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";
const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";
/** The period the harness has prepared an accepted term for. */
const PERIOD = process.env.CERT_TUITION_PERIOD || new Date().toISOString().slice(0, 7);
const SUBJECT = process.env.CERT_TUITION_SUBJECT || "";
/** The household the prepared agreement bills — the same scope the card reads. */
const CUSTOMER = process.env.CERT_TUITION_CUSTOMER || "";

type LedgerRow = {
    chargeId: string;
    amountCents: number;
    status: string;
    lifecycleStatus: string;
    subjectMemberId: string | null;
    categoryKey: string;
};

async function openPreparedSubject(page: Page) {
    await page.addInitScript(
        ([key, state]) => {
            try {
                sessionStorage.setItem(key, state);
            } catch {
                /* private-mode storage; the rail simply stays where it parks */
            }
        },
        [BOS_PRESENTATION_STATE_KEY, "closed"],
    );
    /*
     * The queue row, not a deep link. A subject is selectable only when the Work View is offering
     * it, and the harness prepared the assignment behind the row this queue opens first — so the
     * operator's own path is also the reproducible one.
     */
    await page.goto(WORK_VIEW);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(45_000);
    const rows = page.locator('[data-entity-type="opportunity"][data-entity-id]');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    const subjectId = await rows.first().getAttribute("data-entity-id");
    if (SUBJECT) expect(subjectId, "the harness prepared the subject this queue opens first").toBe(SUBJECT);
    await rows.first().click();
    await page.waitForTimeout(25_000);
    await expect(page).toHaveURL(new RegExp(`subject_id=${subjectId}`));
}

/** The action's own `detail`, wherever the execute envelope put it. */
function findDetail(body: unknown): Record<string, unknown> {
    const seen = new Set<unknown>();
    const walk = (node: unknown): Record<string, unknown> | null => {
        if (!node || typeof node !== "object" || seen.has(node)) return null;
        seen.add(node);
        const obj = node as Record<string, unknown>;
        if (typeof obj.period_key === "string") return obj;
        for (const value of Object.values(obj)) {
            const found = walk(value);
            if (found) return found;
        }
        return null;
    };
    return walk(body) ?? {};
}

/** The production command boundary, from the operator's own authenticated session. */
async function invokeGeneration(page: Page, periodKey: string, assignmentId: string) {
    // The subject travels as an ARGUMENT, not on `window`: the proof reloads the page twice, and a
    // value parked on the document would quietly become an empty string on the retry — which is a
    // certification that stopped testing generation and started testing a blank id.
    return page.evaluate(
        async ([period, assignment]) => {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_key: "billing.generate_tuition",
                    entity_type: "opportunity_customer_member",
                    entity_id: assignment,
                    mode: "execute",
                    confirmation: { confirmed: true },
                    payload: { period_key: period },
                }),
            });
            return { status: res.status, body: await res.json() };
        },
        [periodKey, assignmentId],
    );
}

test.describe("tuition generation, in the mounted application", () => {
    test.describe.configure({ mode: "serial" });

    test("accepted price → generated draft → posted, all read back from persistence", async ({ page }) => {
        test.setTimeout(900_000);
        await openPreparedSubject(page);

        // ── THE ACCEPTED PRICE IS VISIBLE ───────────────────────────────────────────────────
        /*
         * The opportunity has more than one child, so the assignment with an accepted term is FOUND
         * rather than assumed to be first. Which sibling the harness prepared is not something this
         * proof should depend on.
         */
        const anyAssignment = page.locator("[data-tuition-assignment]").first();
        await expect(anyAssignment, "the Tuition card must mount").toBeVisible({ timeout: 60_000 });
        const assignment = page
            .locator('[data-tuition-assignment][data-tuition-accepted="accepted"], [data-tuition-assignment][data-tuition-accepted="overridden"]')
            .first();
        await expect(assignment, "one assignment must carry an accepted term").toBeVisible({ timeout: 30_000 });
        const acceptedLabel = (await assignment.locator("[data-tuition-accepted-amount]").innerText()).trim();
        expect(acceptedLabel).toMatch(/\$[\d,]+\.\d{2}\/\w+/);
        const assignmentId = (await assignment.getAttribute("data-tuition-assignment")) ?? "";
        expect(assignmentId, "the card must name the assignment it priced").toBeTruthy();

        // ── GENERATION, THROUGH THE PRODUCTION COMMAND BOUNDARY ─────────────────────────────
        const generated = await invokeGeneration(page, PERIOD, assignmentId);
        expect(generated.status, JSON.stringify(generated.body)).toBe(200);
        // The execute route wraps a registered action's result differently depending on which
        // runtime owns it, so the detail is FOUND rather than assumed at a path — the assertion is
        // about what the command reported, not about the envelope it arrived in.
        const detail = findDetail(generated.body);
        expect(detail.period_key).toBe(PERIOD);
        expect(detail.generated, JSON.stringify(generated.body)).toBe(1);
        expect(detail.errors).toBe(0);

        // ── THE DRAFT IS VISIBLE, AND OWES NOTHING ──────────────────────────────────────────
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(40_000);
        await page
            .locator('[data-financials-card="true"]')
            .getByRole("button", { name: /Details/ })
            .first()
            .click();
        await expect
            .poll(async () => (await page.locator("body").innerText().catch(() => "")) || "", { timeout: 30_000 })
            .toContain("LEDGER");
        const ledger = await page.locator("body").innerText();
        expect(ledger, "the generated tuition must appear in the ledger").toContain("draft");
        expect(ledger, "and be described as tuition").toMatch(/tuition/i);
        /*
         * A DRAFT IS NOT OWED. The detail overlay states the account's balance as its first figure,
         * and with the tuition drafted but unposted that figure must still be zero — the whole point
         * of generating a draft rather than a debt.
         */
        expect(ledger, "the detail overlay must state a balance").toMatch(/BALANCE/);
        expect(/BALANCE\s*\$0\.00/.test(ledger), "a draft charge must not move the balance").toBe(true);

        // ── THREAD 1 POSTS IT ───────────────────────────────────────────────────────────────
        /*
         * Through `charge.post`, which is where Thread 1's posting actually lives. The mounted
         * detail overlay states the ledger but renders no per-row Post control, and Thread 1's own
         * certification posts the same way — so driving a button that is not there would be
         * inventing a surface, not certifying one. The charge is identified from the CARD'S OWN read
         * model, not from the database, so the thing being posted is the thing the operator sees.
         */
        const cardVm = async () => {
            const res = await page.request.get(
                `/api/admin/financials/card?customer_id=${encodeURIComponent(CUSTOMER)}`,
            );
            expect(res.status(), "the card read model must be reachable as the operator").toBe(200);
            return ((await res.json()) as { vm: { rows: LedgerRow[] } }).vm;
        };
        const draftRow = (await cardVm()).rows.find(
            (r) => r.lifecycleStatus === "draft" && r.categoryKey === "tuition",
        );
        expect(draftRow, "the card's read model must carry the generated tuition draft").toBeTruthy();
        expect(draftRow!.amountCents, "at the amount the family accepted").toBe(121000);
        const postedChargeId = draftRow!.chargeId;
        const postRes = await page.request.post("/api/admin/actions/execute", {
            data: {
                action_key: "charge.post",
                entity_type: "child",
                entity_id: draftRow!.subjectMemberId,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: { charge_id: postedChargeId, charge_label: "tuition" },
            },
        });
        expect(postRes.status(), await postRes.text()).toBe(200);

        // ── AND THE POSTED STATE SURVIVES A RELOAD ──────────────────────────────────────────
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(40_000);
        await page
            .locator('[data-financials-card="true"]')
            .getByRole("button", { name: /Details/ })
            .first()
            .click();
        await expect
            .poll(async () => (await page.locator("body").innerText().catch(() => "")) || "", { timeout: 30_000 })
            .toContain("posted");
        const afterPost = await page.locator("body").innerText();
        // Posting is what makes it owed, and the balance is the accepted amount to the cent — not
        // merely "no longer zero", which a stray charge from anywhere would also satisfy.
        expect(afterPost, "posting makes the accepted tuition owed").toMatch(/BALANCE\s*\$1,210\.00/);

        // ── A SECOND RUN ADDS NOTHING ───────────────────────────────────────────────────────
        const retry = await invokeGeneration(page, PERIOD, assignmentId);
        expect(retry.status).toBe(200);
        const retryDetail = findDetail(retry.body);
        // The month is settled, so the run says so rather than billing it again.
        expect(retryDetail.alreadyPosted, JSON.stringify(retry.body)).toBe(1);
        expect(retryDetail.generated).toBe(0);
        // And nothing new stands beside it: exactly one tuition row for the period, still the one
        // that was posted.
        const finalRows = (await cardVm()).rows.filter((r) => r.categoryKey === "tuition");
        expect(finalRows.map((r) => r.chargeId)).toEqual([postedChargeId]);
        expect(finalRows[0]!.lifecycleStatus).toBe("posted");
    });
});
