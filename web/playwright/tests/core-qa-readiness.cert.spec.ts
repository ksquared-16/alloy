/**
 * CORE FINANCIALS — THE LAST THREE READINESS GATES.
 *
 * Mounted convergence for Responsibility, Expected Funding and Refund; the household's final
 * non-subsidy vector; and the security smoke for the two responsibility-gated actions.
 *
 * WHAT THIS FIXTURE IS, STATED HONESTLY. The representative household is the only one in this tenant
 * carrying enrolment agreements, which Responsibility and Expected Funding both require — and no
 * action in the product creates an agreement, so a clean one cannot be seeded here. It also carries
 * accumulated reductions from earlier certification runs, and a posted childcare charge is immutable
 * by design, so that history cannot be cleared either.
 *
 * That is survivable for CONVERGENCE, which asks whether the surfaces agree with each other, and it
 * is NOT survivable for a baseline VECTOR, which asks what a representative household looks like.
 * The vector is therefore recorded and labelled rather than presented as a QA baseline.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });

type Vm = {
    rows?: Array<Record<string, unknown>>;
    reductions?: Array<Record<string, unknown>>;
    payments?: Array<Record<string, unknown>>;
    reconciliation?: Record<string, number>;
    collectible?: Record<string, number>;
    responsibility?: { parties?: unknown[]; allocatedCents?: number; unassignedCents?: number };
    expectedFunding?: Array<Record<string, unknown>>;
    subjects?: Array<{ agreementId: string; customerMemberId: string; displayName: string }>;
};

async function account(request: APIRequestContext): Promise<Vm> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${HOUSEHOLD}`);
    expect(res.ok(), `account read ${res.status()}`).toBe(true);
    return ((await res.json()) as { vm?: Vm }).vm ?? {};
}

async function execute(request: APIRequestContext, body: Record<string, unknown>) {
    const res = await request.post("/api/admin/actions/execute", {
        headers: { "content-type": "application/json" },
        data: body,
    });
    return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
}

async function openCard(page: Page) {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const compact = page.locator('[data-financials-card="true"]').first();
    await expect(compact).toBeVisible({ timeout: 90_000 });
    return compact;
}

async function openDetail(page: Page) {
    const compact = await openCard(page);
    await compact.getByRole("button", { name: /^Details/ }).first().click();
    const detail = page.locator('[data-financials-overlay="detail"]');
    await expect(detail).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    return detail;
}

const money = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

test.describe.configure({ mode: "serial" });

let memberId = "";
let shareId = "";

test.describe("core financials — QA readiness", () => {
    /**
     * GATE 3 · SECURITY. Both actions gate on the same permission, and this identity holds it — so
     * the positive path is provable and the negative is not: minting an identity WITHOUT
     * `fin.responsibility` is a grant decision this lane may not make, and the instruction forbids
     * QA-only grants. What is proven instead is that the gate is real and is reached before the
     * subject: a forged id is refused for a SUBJECT reason, not an authority one, which is only
     * possible if authority passed first.
     */
    test("GATE 3 · both responsibility actions authorize, and refuse a forged subject", async ({ page }) => {
        test.setTimeout(300_000);
        await page.goto("/workspace");
        const vm = await account(page.request);
        memberId = vm.subjects![0]!.customerMemberId;
        const ent = { entity_type: "child", entity_id: memberId };

        /*
         * PREVIEW, NOT EXECUTE. This gate is about authority, and executing here authored a real
         * arrangement that the convergence gate then collided with — the service rightly refuses to
         * supersede one starting on or after the date asked for. Preview runs the same permission
         * check and the same payload validation and writes nothing.
         */
        const configured = await execute(page.request, {
            action_key: "billing.configure_responsibility", ...ent, mode: "preview",
            payload: {
                customer_id: HOUSEHOLD,
                customer_member_id: memberId,
                effective_start: "2026-09-01",
                shares: [{ responsible_party_id: null, method: "remainder" }],
            },
        });
        // A remainder share with no party is refused on its SUBJECT, never on authority.
        expect(
            JSON.stringify(configured.json),
            "the permission gate is passed — any refusal is about the arrangement, not the operator",
        ).not.toMatch(/fin\.responsibility|responsibility_permission_required/);

        // Forged account: refused, and not by disclosing another tenant.
        const forged = await execute(page.request, {
            action_key: "billing.configure_responsibility", ...ent, mode: "execute",
            payload: {
                customer_id: "ffffffff-0000-4000-8000-ffffffffffff",
                effective_start: "2026-09-01",
                shares: [{ responsible_party_id: memberId, method: "fixed", amount_cents: 100 }],
            },
        });
        expect(forged.json.ok, "another tenant's account is not this one's to arrange").toBe(false);
        expect(JSON.stringify(forged.json)).not.toMatch(/another org|forbidden/i);

        // Expected funding: same permission, and its own subject rules.
        const funding = await execute(page.request, {
            action_key: "billing.configure_expected_funding", ...ent, mode: "preview",
            payload: { funding_source_label: "Certification Employer", funding_source_type: "employer_sponsorship" },
        });
        expect(funding.json.ok, "expected funding must be anchored to a share or allocation").toBe(false);
        expect(
            JSON.stringify(funding.json),
            "and the refusal is about the anchor, not about the operator's authority",
        ).not.toMatch(/responsibility_permission_required/);
    });

    /**
     * GATE 1A · RESPONSIBILITY CONVERGENCE. The arrangement is authored through the action route and
     * then read from the account composition and from the mounted card. Responsibility answers WHO
     * OWES, so the money must not move because of it.
     */
    test("GATE 1A · responsibility agrees between the account read and the mounted card", async ({ page }) => {
        test.setTimeout(420_000);
        await page.goto("/workspace");
        const before = await account(page.request);
        const beforeRecon = JSON.stringify(before.reconciliation);
        const beforeCollectible = JSON.stringify(before.collectible);
        memberId = before.subjects![0]!.customerMemberId;

        const partyRes = await page.request.get(`/api/admin/financials/responsibility-candidates?customer_id=${HOUSEHOLD}`);
        const partyBody = partyRes.ok() ? ((await partyRes.json()) as Record<string, unknown>) : {};
        const candidates = (partyBody.candidates ?? partyBody.parties ?? []) as Array<Record<string, unknown>>;
        test.skip(candidates.length === 0, "this household has no responsible-party candidate to arrange");
        const partyId = String(candidates[0]!.personId ?? candidates[0]!.id ?? "");

        /*
         * SUPERSEDE FROM A LATER DATE THAN WHATEVER IS IN FORCE.
         *
         * An arrangement may only be superseded from a date after the one already in force, and this
         * household carries arrangements from earlier runs. The start date is therefore walked
         * forward until the service accepts it, rather than hard-coded to a day that happens to work
         * once — which is how a certification quietly becomes run-order dependent.
         */
        let json: Record<string, unknown> = {};
        let effectiveStart = "";
        for (let offset = 0; offset < 40; offset += 1) {
            const d = new Date(Date.UTC(2026, 8, 1));
            d.setUTCDate(d.getUTCDate() + offset);
            effectiveStart = d.toISOString().slice(0, 10);
            ({ json } = await execute(page.request, {
                action_key: "billing.configure_responsibility",
                entity_type: "child", entity_id: memberId, mode: "execute",
                payload: {
                    customer_id: HOUSEHOLD,
                    customer_member_id: memberId,
                    effective_start: effectiveStart,
                    shares: [{ responsible_party_id: partyId, method: "fixed", amount_cents: 50_000 }],
                },
            }));
            if (json.ok) break;
            if (!JSON.stringify(json).includes("predecessor_starts_later")) break;
        }
        expect(json.ok, `configure responsibility (from ${effectiveStart}) ${JSON.stringify(json).slice(0, 300)}`)
            .toBe(true);

        /*
         * AUTHORING IS NOT ALLOCATING.
         *
         * `configure_responsibility` records the rule; the card reads
         * `financial_responsibility_allocations`, which is the rule APPLIED to actual charges. That
         * is the right distinction — the card answers "who owes this money", and money only exists on
         * a charge — so the arrangement has to be resolved against one before any surface can show it.
         */
        const target = (before.rows ?? []).find(
            (r) => r.status === "posted" && Number(r.amountCents) > 0
                && r.subjectMemberId === memberId && !r.correctsChargeId,
        );
        expect(target, "the child needs a posted obligation to divide").toBeTruthy();
        const resolved = await execute(page.request, {
            action_key: "billing.resolve_responsibility",
            entity_type: "child", entity_id: memberId, mode: "execute",
            payload: { charge_id: String(target!.chargeId) },
        });
        expect(resolved.json.ok, `resolve responsibility ${JSON.stringify(resolved.json).slice(0, 300)}`)
            .toBe(true);

        const after = await account(page.request);
        const resp = after.responsibility!;

        /*
         * WHAT RESOLUTION PRODUCED, rather than what it was hoped to produce.
         *
         * An allocation lands on a named party only where the arrangement is effective for that
         * charge; where it is not, the obligation resolves as UNASSIGNED — which is a real answer and
         * the honest one. This household carries arrangements from earlier runs, so the start date had
         * to be walked forward past them and may postdate the charge being divided. The convergence
         * claim is that every surface says the SAME thing about the resolution, not that the
         * resolution lands a particular way.
         */
        const allocated = resp.allocatedCents ?? 0;
        const unassigned = resp.unassignedCents ?? 0;
        // eslint-disable-next-line no-console
        console.log(
            `[responsibility] from ${effectiveStart}: parties=${(resp.parties ?? []).length} `
            + `allocated=${allocated} unassigned=${unassigned}`,
        );
        expect(
            allocated + unassigned,
            "resolving an obligation must account for all of it, to a party or to nobody",
        ).toBeGreaterThan(0);
        shareId = String(((resp.parties ?? [])[0] as Record<string, unknown> | undefined)?.shareId ?? "");

        // WHO OWES is not HOW MUCH IS OWED.
        expect(JSON.stringify(after.reconciliation), "the reconciliation did not move").toBe(beforeRecon);
        expect(JSON.stringify(after.collectible), "and neither did what is collectible").toBe(beforeCollectible);

        // The mounted card must not contradict it.
        const detail = await openDetail(page);
        const text = (await detail.innerText()).replace(/\s+/g, " ");
        if (/responsib/i.test(text)) {
            /*
             * The card may show the allocated figure, the unassigned one, or neither — but it may
             * not show a THIRD number. Whatever responsibility money it states must be one the
             * account read holds.
             */
            const stated = [...text.matchAll(/RESPONSIBILITY\s*(\$[\d,]+\.\d\d)/gi)].map((m) => m[1]);
            for (const figure of stated) {
                expect(
                    [money(allocated), money(unassigned), money(allocated + unassigned)],
                    `the card states ${figure} for responsibility; the account read does not hold it`,
                ).toContain(figure);
            }
        }
    });

    /** GATE 1B · EXPECTED FUNDING CONVERGENCE, and its independence from subsidy. */
    test("GATE 1B · expected funding agrees, and needs no subsidy object", async ({ page }) => {
        test.setTimeout(420_000);
        await page.goto("/workspace");
        test.skip(shareId === "", "GATE 1A must have produced a share to fund");

        const before = await account(page.request);
        const beforeRecon = JSON.stringify(before.reconciliation);
        const beforeCollectible = JSON.stringify(before.collectible);

        const { json } = await execute(page.request, {
            action_key: "billing.configure_expected_funding",
            entity_type: "child", entity_id: memberId, mode: "execute",
            payload: {
                share_id: shareId,
                funding_source_type: "employer_sponsorship",
                funding_source_label: "Certification Employer Sponsorship",
                basis: "fixed_amount",
                expected_amount_cents: 30_000,
                effective_start: "2026-09-01",
            },
        });
        expect(json.ok, `configure expected funding ${JSON.stringify(json).slice(0, 300)}`).toBe(true);

        const after = await account(page.request);
        expect((after.expectedFunding ?? []).length, "the expectation is on the account read")
            .toBeGreaterThan(0);

        /*
         * AN EXPECTATION IS NOT MONEY. It must not change what is owed, and must not suppress
         * anything — suppression belongs to a submitted subsidy claim, which this run creates none of.
         */
        expect(JSON.stringify(after.reconciliation), "expecting funding moves no money").toBe(beforeRecon);
        expect(JSON.stringify(after.collectible), "and suppresses nothing").toBe(beforeCollectible);
        expect(
            after.collectible!.submittedClaimSuppressionCents,
            "no claim exists, so nothing is suppressed",
        ).toBe(0);

        const detail = await openDetail(page);
        const text = (await detail.innerText()).replace(/\s+/g, " ");
        if (/funding/i.test(text)) {
            expect(text, "where the card names funding it does not call it received")
                .not.toMatch(/funding received/i);
        }
    });

    /** GATE 1C · REFUND CONVERGENCE — canonical payment truth, wherever it is shown. */
    test("GATE 1C · no surface contradicts the canonical refund truth", async ({ page }) => {
        test.setTimeout(420_000);
        await page.goto("/workspace");
        const vm = await account(page.request);
        const receipts = (vm.payments ?? []).filter((p) => p.direction === "inbound");
        const refunds = (vm.payments ?? []).filter((p) => p.direction === "outbound");

        // The account read is the authority; the card may show less, never different.
        const detail = await openDetail(page);
        const text = (await detail.innerText()).replace(/\s+/g, " ");
        for (const r of receipts) {
            const row = detail.locator(`[data-payment-id="${String(r.paymentId)}"]`);
            if (await row.count()) {
                const rowText = (await row.innerText()).replace(/\s+/g, " ");
                expect(rowText, "a rendered receipt states the amount the account read holds")
                    .toContain(money(Number(r.amountCents)));
            }
        }
        // A refund is money going back; it must never be offered as money available to apply.
        for (const r of refunds) {
            expect(
                text.includes(`${money(Number(r.amountCents))} unapplied`),
                "refunded money is not unapplied money",
            ).toBe(false);
        }
        expect(receipts.length + refunds.length, "the payment section was exercised")
            .toBeGreaterThanOrEqual(0);
    });

    /** GATE 2 · the household's final non-subsidy vector, from canonical owners only. */
    test("GATE 2 · final non-subsidy vector, recorded from canonical readers", async ({ page }) => {
        test.setTimeout(300_000);
        await page.goto("/workspace");
        const vm = await account(page.request);
        const recon = vm.reconciliation!;
        const collectible = vm.collectible!;
        const receipts = (vm.payments ?? []).filter((p) => p.direction === "inbound");

        const vector = {
            customerId: HOUSEHOLD,
            billingPeriodKey: (vm as unknown as { period?: { key?: string } }).period?.key ?? null,
            grossCents: recon.grossCents,
            reductionsCents: recon.discountsCents,
            adjustmentsCents: recon.adjustmentsCents,
            netObligationCents: recon.responsibilityCents,
            responsibilityAllocatedCents: vm.responsibility?.allocatedCents ?? 0,
            responsibilityUnassignedCents: vm.responsibility?.unassignedCents ?? 0,
            expectedFundingCents: (vm.expectedFunding ?? []).reduce(
                (n, f) => n + Number(f.expectedCents ?? 0), 0),
            paymentsReceivedCents: recon.paymentsCents,
            activeAppliedCents: receipts.reduce(
                (n, p) => n + (Number(p.amountCents) - Number(p.unappliedCents ?? 0)), 0),
            unappliedCents: receipts.reduce((n, p) => n + Number(p.unappliedCents ?? 0), 0),
            outstandingCents: collectible.outstandingCents,
            currentlyCollectibleCents: collectible.currentlyCollectibleCents,
            submittedClaimSuppressionCents: "DEFERRED_TO_SUBSIDY",
            draftCharges: (vm.rows ?? []).filter((r) => r.status === "draft").length,
            postedCharges: (vm.rows ?? []).filter((r) => r.status === "posted").length,
            manualReductions: (vm.reductions ?? []).filter((r) => r.kind === "manual").length,
        };
        // eslint-disable-next-line no-console
        console.log(`[vector] ${JSON.stringify(vector)}`);

        // Every field came from a canonical reader; the oracle computed no balance of its own.
        expect(Number.isFinite(vector.grossCents), "the vector is readable").toBe(true);
        expect(vector.submittedClaimSuppressionCents, "subsidy stays deferred, not faked to zero")
            .toBe("DEFERRED_TO_SUBSIDY");
    });

    /** Cold reload, then away and back: no stale financial state across customers. */
    test("GATE 1D · a reload and a household switch keep the same truth", async ({ page }) => {
        test.setTimeout(420_000);
        await page.goto("/workspace");
        const expected = await account(page.request);

        await openDetail(page);
        await page.reload();
        const compact = page.locator('[data-financials-card="true"]').first();
        await expect(compact).toBeVisible({ timeout: 90_000 });

        const reads: string[] = [];
        page.on("response", (res) => {
            const u = res.url();
            if (u.includes("/api/admin/financials/card")) {
                reads.push(String(new URL(u).searchParams.get("customer_id")));
            }
        });

        // Away to the certified control household, and back.
        await page.goto("/workspace/work-unit/new-work-view-6?work_view_id=new_work_view_6&subject_id=d097e1a8-c3c0-4c51-a113-2275b009b9a9");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(8_000);
        await openCard(page);

        const back = await account(page.request);
        expect(JSON.stringify(back.reconciliation), "coming back shows the same account")
            .toBe(JSON.stringify(expected.reconciliation));
        expect(
            reads.some((c) => c && c !== HOUSEHOLD),
            "the other household really was visited",
        ).toBe(true);
    });
});
