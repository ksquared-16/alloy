/**
 * SUBSIDY, THROUGH THE RUNNING APPLICATION — and the one number a family actually sees.
 *
 * The approved policy says a SUBMITTED claim may suppress family collection for its attributed
 * amount. This drives that from the operator's own session and reads the result back through the
 * card's own model: outstanding does not move, and what the family is asked for does.
 *
 * The refusal case matters as much. Recording an authorization decides how much an agency is
 * expected to cover, which under this policy decides what a family is billed this month — so it is
 * refused by the SERVER when the actor does not hold `fin.subsidy`, not by a hidden button.
 */
import { expect, test, type Page } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";
const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";
const PERIOD = process.env.CERT_SUBSIDY_PERIOD || new Date().toISOString().slice(0, 7);
const CUSTOMER = process.env.CERT_SUBSIDY_CUSTOMER || "";
const MEMBER = process.env.CERT_SUBSIDY_MEMBER || "";
const GROSS = 100_000;
const EXPECTED = 90_000;

type Vm = {
    rows: Array<{ chargeId: string; amountCents: number; lifecycleStatus: string; categoryKey: string; subjectMemberId: string | null }>;
    reconciliation: { grossCents: number; responsibilityCents: number; balanceCents: number };
    responsibility: { parties: Array<{ personId: string; assignedCents: number }>; unassignedCents: number };
    expectedFunding: Array<{ label: string; sourceType: string }>;
    collectible: {
        outstandingCents: number;
        expectedSubsidyCents: number;
        submittedClaimSuppressionCents: number;
        actualSubsidyReceivedCents: number;
        unresolvedVarianceCents: number;
        currentlyCollectibleCents: number;
    };
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

function findDetail(body: unknown): Record<string, unknown> {
    const seen = new Set<unknown>();
    const walk = (node: unknown): Record<string, unknown> | null => {
        if (!node || typeof node !== "object" || seen.has(node)) return null;
        seen.add(node);
        const obj = node as Record<string, unknown>;
        // Every id these commands report. Missing one silently returned an empty object and the
        // next command was called with `undefined` for a required field — which reads like a
        // validation bug in the product rather than a gap in this walk.
        for (const key of ["authorization_id", "program_id", "agency_id", "claimId", "remittanceId", "varianceId", "application_id"]) {
            if (typeof obj[key] === "string") return obj;
        }
        for (const value of Object.values(obj)) {
            const found = walk(value);
            if (found) return found;
        }
        return null;
    };
    return walk(body) ?? {};
}

test.describe("subsidy, in the mounted application", () => {
    test.describe.configure({ mode: "serial" });

    test("a submitted claim changes what the family is asked for, and nothing else", async ({ page }) => {
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
        const command = async (key: string, payload: Record<string, unknown>) => {
            const result = await execute({
                action_key: key,
                entity_type: "child",
                entity_id: MEMBER,
                mode: "execute",
                confirmation: { confirmed: true },
                payload,
            });
            expect(result.status, `${key}: ${JSON.stringify(result.json)}`).toBe(200);
            return findDetail(result.json);
        };

        // ── A POSTED OBLIGATION, DIVIDED, THROUGH THE EXISTING THREADS ──────────────────────
        await execute({
            action_key: "billing.generate_tuition",
            entity_type: "opportunity_customer_member",
            entity_id: process.env.CERT_SUBSIDY_ASSIGNMENT ?? "",
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { period_key: PERIOD },
        });
        let vm = await cardVm();
        const charge = vm.rows.find((r) => r.categoryKey === "tuition" && r.amountCents === GROSS)!;
        expect(charge, "the generated tuition must reach the card").toBeTruthy();
        await command("charge.post", { charge_id: charge.chargeId, charge_label: "tuition" });
        await command("billing.resolve_responsibility", { charge_id: charge.chargeId });

        // ── AGENCY, PROGRAMME, AUTHORIZATION ────────────────────────────────────────────────
        const agency = await command("subsidy.configure_agency", { agency_key: "cert-browser-agency", name: "State Child Care Assistance" });
        const program = await command("subsidy.configure_program", {
            agency_id: agency.agency_id, program_key: "cert-browser-erdc", name: "Employment Related Day Care",
        });
        const authorization = await command("subsidy.record_authorization", {
            program_id: program.program_id,
            customer_id: CUSTOMER,
            customer_member_id: MEMBER,
            coverage_start: "2026-01-01",
            authorized_amount_cents: EXPECTED,
            family_copay_cents: GROSS - EXPECTED,
        });
        expect(authorization.authorization_id).toBeTruthy();

        // Expected funding is attached through Thread 6's seam by the live suite; here the point is
        // what the CARD does with the claim, so the expectation is read back from the read model.
        vm = await cardVm();
        expect(vm.collectible.outstandingCents, "the obligation is owed in full").toBe(GROSS);

        // ── BUILD, THEN SUBMIT — and only the second one changes anything ───────────────────
        const built = await command("subsidy.build_claim", {
            authorization_id: authorization.authorization_id, period_key: PERIOD,
        });
        vm = await cardVm();
        expect(vm.collectible.submittedClaimSuppressionCents, "a draft claim suppresses nothing").toBe(0);
        expect(vm.collectible.currentlyCollectibleCents).toBe(GROSS);

        await command("subsidy.submit_claim", { claim_id: built.claimId });
        vm = await cardVm();
        expect(vm.collectible.outstandingCents, "Thread 8's outstanding did NOT move").toBe(GROSS);
        expect(vm.collectible.actualSubsidyReceivedCents, "and no money was invented").toBe(0);
        expect(vm.collectible.submittedClaimSuppressionCents, "the submitted claim suppresses its amount").toBe(EXPECTED);
        expect(vm.collectible.currentlyCollectibleCents, "so the family is asked for their copay").toBe(GROSS - EXPECTED);
        // Responsibility is untouched: the family is still contractually responsible for the whole net.
        expect(vm.responsibility.parties.reduce((a, p) => a + p.assignedCents, 0)).toBe(GROSS);

        // ── AND THE MOUNTED CARD SAYS SO ────────────────────────────────────────────────────
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(40_000);
        // The card scopes itself to the CHILD when the panel is about one, so the figure it renders
        // comes from that read — asserted here so a mismatch names itself instead of looking like a
        // missing line.
        const scoped = ((await (await page.request.get(
            `/api/admin/financials/card?customer_member_id=${encodeURIComponent(MEMBER)}`,
        )).json()) as { vm: Vm }).vm;
        expect(scoped.collectible.submittedClaimSuppressionCents, JSON.stringify(scoped.collectible)).toBe(EXPECTED);

        const body = await page.locator("body").innerText();
        expect(body, "the card states what to collect now").toContain("Collectible now");
        expect(body, "and it is the copay, not the whole obligation").toContain("$100.00");
    });

    /*
     * L · AN UNAUTHORIZED AUTHORIZATION. Under this policy, recording one decides what a family is
     * billed this month, so a client-side check would be worthless: the WRITE has to fail.
     */
    test("without the grant, the server refuses to record an authorization", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED !== "1", "driven by the harness");
        test.setTimeout(600_000);
        await openSubject(page);

        const before = ((await (await page.request.get(
            `/api/admin/financials/card?customer_id=${encodeURIComponent(CUSTOMER)}`,
        )).json()) as { vm: Vm }).vm.collectible;

        const res = await page.request.post("/api/admin/actions/execute", {
            data: {
                action_key: "subsidy.record_authorization",
                entity_type: "child",
                entity_id: MEMBER,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {
                    program_id: "00000000-0000-4000-8000-000000000000",
                    customer_id: CUSTOMER,
                    customer_member_id: MEMBER,
                    coverage_start: "2033-01-01",
                },
            },
        });
        const text = await res.text();
        expect(res.status(), text).not.toBe(200);
        expect(text, "the refusal names the permission").toMatch(/fin\.subsidy|permission/i);

        /*
         * AND NOTHING CHANGED BECAUSE OF IT. The account may legitimately already carry subsidy from
         * the authorized run — asserting "no suppression exists" would be asserting the harness tore
         * down between two runs it deliberately does not. What must be true is that the refused
         * command moved nothing.
         */
        const after = ((await (await page.request.get(
            `/api/admin/financials/card?customer_id=${encodeURIComponent(CUSTOMER)}`,
        )).json()) as { vm: Vm }).vm.collectible;
        expect(after, "a refused command changes no figure on the card").toEqual(before);
    });
});
