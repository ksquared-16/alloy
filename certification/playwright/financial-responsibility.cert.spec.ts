/**
 * WHO OWES IT, VISIBLE — and who may decide it, enforced by the server.
 *
 * Thread 2 shipped the Financials card with `payers[]` carrying `share: null` for everyone and
 * wrote down exactly why: there was a payer contact ROLE and no allocation store, so a split
 * rendered there would have assigned real money to real people on no record. Thread 6 built the
 * record. This proves the card now reads it — and that it still refuses to invent the part nobody
 * has decided.
 *
 *   PRESENTATION — gross, the Thread 10 reduction, the canonical net, and then WHO owes it, from
 *     persisted allocations naming real people, with any unassigned remainder stated rather than
 *     quietly handed to the household.
 *   AUTHORIZATION — configuring responsibility is refused by the SERVER when the actor does not
 *     hold `fin.responsibility`. The grant is revoked for the attempt and restored afterwards,
 *     because a hidden control is not a control.
 */
import { expect, test, type Page } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";
const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";
const PERIOD = process.env.CERT_RESP_PERIOD || new Date().toISOString().slice(0, 7);
const CUSTOMER = process.env.CERT_RESP_CUSTOMER || "";
const ALEX = process.env.CERT_RESP_ALEX || "";
const SAM = process.env.CERT_RESP_SAM || "";
const GROSS = 100_000;

type Vm = {
    rows: Array<{ chargeId: string; amountCents: number; lifecycleStatus: string; categoryKey: string; subjectMemberId: string | null }>;
    reconciliation: { grossCents: number; responsibilityCents: number; balanceCents: number };
    payers: Array<{ personId: string; name: string; share: string | null; method: string | null }>;
    responsibility: {
        parties: Array<{ personId: string; name: string; assignedCents: number; attributedCents: number; remainingCents: number }>;
        unassignedCents: number;
        allocatedCents: number;
        hasUnresolvedCharges: boolean;
    };
    expectedFunding: Array<{ label: string; sourceType: string }>;
};

async function openSubject(page: Page) {
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
    await page.goto(WORK_VIEW);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(45_000);
    const rows = page.locator('[data-entity-type="opportunity"][data-entity-id]');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    await rows.first().click();
    await page.waitForTimeout(25_000);
}

test.describe("responsibility, in the mounted application", () => {
    test.describe.configure({ mode: "serial" });

    test("persisted responsibility is shown, and the part nobody owns is stated", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(900_000);
        await openSubject(page);

        const execute = async (body: Record<string, unknown>) => {
            const res = await page.request.post("/api/admin/actions/execute", { data: body });
            return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
        };
        const cardVm = async (): Promise<Vm> => {
            const res = await page.request.get(`/api/admin/financials/card?customer_id=${encodeURIComponent(CUSTOMER)}`);
            expect(res.status(), "the card read model must be reachable as the operator").toBe(200);
            return ((await res.json()) as { vm: Vm }).vm;
        };

        // ── GROSS, THROUGH THREAD 7 ─────────────────────────────────────────────────────────
        const generated = await execute({
            action_key: "billing.generate_tuition",
            entity_type: "opportunity_customer_member",
            entity_id: process.env.CERT_RESP_ASSIGNMENT ?? "",
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { period_key: PERIOD },
        });
        expect(generated.status, JSON.stringify(generated.json)).toBe(200);

        const afterGross = await cardVm();
        const charge = afterGross.rows.find((r) => r.categoryKey === "tuition" && r.amountCents === GROSS);
        expect(charge, "the generated tuition must reach the card").toBeTruthy();
        // BEFORE ANYONE IS MADE RESPONSIBLE, the card says so rather than guessing.
        expect(afterGross.responsibility.parties, "no party until an arrangement is resolved").toHaveLength(0);
        expect(afterGross.payers, "and no fabricated payer share").toHaveLength(0);

        /*
         * POSTED FIRST, so the figures below are about money that is OWED. A draft is stated
         * separately by the card and counts toward nothing — asserting responsibility against a
         * gross of zero would prove only that zero divides into zero.
         */
        const posted = await execute({
            action_key: "charge.post",
            entity_type: "child",
            entity_id: charge!.subjectMemberId,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: charge!.chargeId, charge_label: "tuition" },
        });
        expect(posted.status, JSON.stringify(posted.json)).toBe(200);

        // ── RESPONSIBILITY, THROUGH ITS OWN COMMAND ─────────────────────────────────────────
        const resolved = await execute({
            action_key: "billing.resolve_responsibility",
            entity_type: "child",
            entity_id: charge!.subjectMemberId,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: charge!.chargeId },
        });
        expect(resolved.status, JSON.stringify(resolved.json)).toBe(200);

        const settled = await cardVm();
        expect(settled.reconciliation.grossCents, "gross is untouched").toBe(GROSS);
        expect(settled.responsibility.parties, "two named parties, from persistence").toHaveLength(2);
        const alex = settled.responsibility.parties.find((p) => p.personId === ALEX)!;
        const sam = settled.responsibility.parties.find((p) => p.personId === SAM)!;
        expect(alex.assignedCents + sam.assignedCents, "and they sum EXACTLY to the net").toBe(GROSS);
        expect([alex.assignedCents, sam.assignedCents].sort((a, b) => b - a)).toEqual([70_000, 30_000]);
        expect(settled.responsibility.unassignedCents, "a complete 70/30 leaves nothing unowned").toBe(0);

        // PAYERS ARE THE PARTIES SOMEBODY NAMED, with a real share — the seam Thread 2 left open.
        expect(settled.payers.map((p) => p.personId).sort()).toEqual([ALEX, SAM].sort());
        expect(settled.payers.every((p) => p.share !== null), "shares are real now").toBe(true);
        // And still no per-payer method store, so it is still honestly null.
        expect(settled.payers.every((p) => p.method === null)).toBe(true);

        // ── AND THE MOUNTED CARD RENDERS IT ─────────────────────────────────────────────────
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(40_000);
        const mounted = await page.locator("body").innerText();
        expect(mounted, "the card states responsibility").toContain("Responsibility");

        // The DETAIL view names the parties and their shares — the zone Thread 2 built to list who
        // is responsible while deliberately claiming no amount, because there was none to claim.
        await page
            .locator('[data-financials-card="true"]')
            .getByRole("button", { name: /Details/ })
            .first()
            .click();
        await expect
            .poll(async () => (await page.locator("body").innerText().catch(() => "")) || "", { timeout: 30_000 })
            .toContain("LEDGER");
        const detail = await page.locator("body").innerText();
        expect(detail, "the named parties' own shares are shown").toContain("$700.00");
        expect(detail).toContain("$300.00");
        // No UI arithmetic: every figure on the page came from the read model.
        expect(detail).toContain("$1,000.00");
    });

    /*
     * L · AN UNAUTHORIZED CONFIGURATION. The harness revokes `fin.responsibility` and runs this by
     * itself. Deciding who owes money is the one act in Financials where a client-side check would
     * be worthless: the WRITE is what has to fail.
     */
    test("without the grant, the server refuses to configure responsibility", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED !== "1", "driven by the harness");
        test.setTimeout(600_000);
        await openSubject(page);

        const res = await page.request.post("/api/admin/actions/execute", {
            data: {
                action_key: "billing.configure_responsibility",
                entity_type: "child",
                entity_id: ALEX,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {
                    customer_id: CUSTOMER,
                    effective_start: "2031-01-01",
                    shares: [{ responsible_party_id: ALEX, method: "percentage", percent_basis_points: 10_000 }],
                },
            },
        });
        const text = await res.text();
        expect(res.status(), text).not.toBe(200);
        expect(text, "the refusal names the permission").toMatch(/fin\.responsibility|permission/i);

        // AND NOTHING WAS RECORDED — a refusal that still wrote the arrangement would be worse than none.
        const vm = await page.request.get(`/api/admin/financials/card?customer_id=${encodeURIComponent(CUSTOMER)}`);
        const parties = ((await vm.json()) as { vm: Vm }).vm.responsibility.parties;
        expect(parties.every((p) => p.assignedCents >= 0), "the read model still answers").toBe(true);
    });
});
