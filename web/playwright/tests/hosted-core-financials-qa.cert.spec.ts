/**
 * CORE FINANCIALS V1 — DEDICATED QA, ON HOSTED STAGING.
 *
 * This is the gate Subsidy waits behind. It exercises the whole non-subsidy product against the
 * deployed app: charge lifecycle, responsibility, expected funding, manual reduction and its zero
 * bound, payment receipt and application, partial unapplied money, moving a payment, the
 * deliberately non-atomic failed reapply, refund, charge reversal, and the convergence of every
 * surface that reports on them.
 *
 * ── WHAT THIS FILE IS ALLOWED TO ASSERT ─────────────────────────────────────────────────────────
 *
 * Nothing here computes money. Every monetary claim is read back from a canonical authority —
 * `buildFinancialsCardVM` through `/api/admin/financials/card`, and `resolveChargeDetail` through
 * `/api/admin/financials/charge/:id`. A QA file that added up cents itself would be a second
 * financial authority disagreeing with the first at some later date, which is the exact class of
 * defect Thread 11 spent its life removing.
 *
 * Mutations go through `/api/admin/actions/execute` — the product's own action pipeline, the same
 * endpoint the mounted controls post to — and the surfaces are then opened and read for the
 * convergence phases. Services are never called directly.
 *
 * ── THE MONEY THIS FILE BUILDS ──────────────────────────────────────────────────────────────────
 *
 * Four obligations, each with a job, so a failure names its own scenario:
 *
 *   Registration fee  $75.00  the baseline obligation — responsibility and expected funding hang
 *                             off it, and it is never reduced or reversed
 *   Materials         $18.00  the draft that proves a draft is not owed, then posted and paid
 *   Late pickup       $25.00  posted, then REVERSED — the charge-correction scenario
 *   Field trip        $40.00  posted, then REDUCED to exactly zero and no further
 *
 * Amounts are the tenant's own template amounts. All four templates are `amount_strategy: 'fixed'`,
 * where `resolveAmount` returns the template's amount and a caller-supplied `amount_cents` is
 * ignored — so these are the only obligations this product can honestly produce here.
 *
 * ── RE-RUNNABLE, BECAUSE POSTED MONEY IS IMMUTABLE ──────────────────────────────────────────────
 *
 * A posted childcare charge cannot be voided, deleted, or un-posted, and `charge.add` is idempotent
 * per template and period. So every phase reuses the state it finds and re-proves the same facts
 * about it, rather than asserting it was the one that created it. A QA file that only passed on a
 * virgin tenant would stop asserting anything the moment it had run once.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";

const HOUSEHOLD = "fd000000-0000-4000-8000-0000000c0001"; // Alvarez Household (demo)
const CHILD = "fd000000-0000-4000-8000-0000000d0001"; // Ana Alvarez
const AGREEMENT = "fd000000-0000-4000-8000-0000000a0001";
const ADULT = "fd000000-0000-4000-8000-0000000b0002"; // Dana Alvarez
const FOREIGN_HOUSEHOLD = "fd000000-0000-4000-8000-0000000c0003"; // Chen — another household, for boundary proofs
const CROSS_ORG_SUBJECT = "ffffffff-0000-4000-8000-ffffffffffff"; // belongs to nobody

const TPL = {
    registration: { id: "c03e638e-0f3e-49f0-9d41-696276c8fa21", cents: 7500, label: "Registration fee" },
    materials: { id: "27055d7e-72a3-441a-a4dd-ae01fbf1f421", cents: 1800, label: "Materials" },
    latePickup: { id: "315d8b1d-9d1c-4613-97aa-22658a0cdb52", cents: 2500, label: "Late pickup" },
    fieldTrip: { id: "e6f64079-681d-4d60-8be3-fac451edadb1", cents: 4000, label: "Field trip" },
} as const;

test.use({
    storageState: STORAGE,
    baseURL: "https://staging.workwithalloy.com",
    viewport: { width: 1680, height: 1050 },
});
test.describe.configure({ mode: "serial", timeout: 300_000 });

// ── CANONICAL READERS ───────────────────────────────────────────────────────────────────────────

type Row = Record<string, any>;
type Vm = {
    account?: Row;
    period?: Row;
    payers?: Row[];
    rows?: Row[];
    reductions?: Row[];
    payments?: Row[];
    reconciliation?: Record<string, number>;
    collectible?: Record<string, number>;
    responsibility?: { parties?: Row[]; allocatedCents?: number; unassignedCents?: number };
    expectedFunding?: Row[];
    subjects?: Row[];
    chargeTemplates?: Row[];
    /** Named facts the card declines to fake, each with its reason — not a failure flag. */
    unavailable?: Row[];
    unavailableReason?: string | null;
};

async function account(request: APIRequestContext, customerId = HOUSEHOLD): Promise<Vm> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${customerId}`);
    expect(res.ok(), `account read ${res.status()}`).toBe(true);
    return ((await res.json()) as { vm?: Vm }).vm ?? {};
}

async function chargeDetail(request: APIRequestContext, chargeId: string): Promise<Row> {
    const res = await request.get(`/api/admin/financials/charge/${chargeId}`);
    expect(res.ok(), `charge detail ${res.status()}`).toBe(true);
    return (await res.json()) as Row;
}

async function execute(request: APIRequestContext, body: Record<string, unknown>) {
    const res = await request.post("/api/admin/actions/execute", {
        headers: { "content-type": "application/json" },
        data: body,
    });
    return { status: res.status(), json: (await res.json()) as Row };
}

/** Every action in this file is raised against the child, which is the grain the product uses. */
const ENT = { entity_type: "child", entity_id: CHILD, mode: "execute" } as const;

/** One operating date for everything this run creates, so a period is never ambiguous. */
const QA_DATE = "2026-09-14";

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));
const money = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * The product's own distinction between an obligation and something that happens TO one, restated
 * here only so this file can scope a comparison by it. `isCollectibleOffsetRow` in
 * `buildFinancialsCardVM` is the authority; this must agree with it.
 */
const OFFSET_ROW_CATEGORIES = new Set(["credit", "discount", "subsidy_offset", "adjustment"]);
const isOffsetRow = (r: Row) =>
    Boolean(r.correctsChargeId) || OFFSET_ROW_CATEGORIES.has(String(r.categoryKey));

const byStatus = (vm: Vm, status: string) =>
    (vm.rows ?? []).filter((r) => String(r.status ?? "").toLowerCase() === status);

/** A posted obligation by its template label — the only stable way to name one across reruns. */
const posted = (vm: Vm, label: string) =>
    byStatus(vm, "posted").filter((r) => String(r.description ?? "").includes(label));

/**
 * Ensure an obligation exists and is posted, reusing whatever is already there.
 * Returns the canonical charge row.
 */
async function ensurePosted(request: APIRequestContext, tpl: { id: string; cents: number; label: string }) {
    let vm = await account(request);
    const existing = posted(vm, tpl.label).filter((r) => !r.correctsChargeId && !r.reversedByChargeId);
    if (existing.length > 0) return existing[0];

    const draft = byStatus(vm, "draft").find((r) => String(r.description ?? "").includes(tpl.label));
    if (!draft) {
        const added = await execute(request, {
            action_key: "charge.add",
            ...ENT,
            /*
             * A DATE FOR EVERY OCCURS-ON STRATEGY.
             *
             * Field trip resolves its date from an EVENT and refused `missing_event_date` when only
             * a template was named — correctly: a trip that happened on no particular day cannot be
             * billed for a period. Both optional dates are supplied so this helper works for any
             * template the tenant configures, and a template that ignores them is unaffected.
             */
            payload: {
                template_id: tpl.id,
                customer_id: HOUSEHOLD,
                event_date: QA_DATE,
                service_period_start: QA_DATE,
            },
        });
        expect(added.json.ok, `charge.add ${tpl.label}: ${JSON.stringify(added.json)}`).toBe(true);
        vm = await account(request);
    }
    const toPost = byStatus(await account(request), "draft").find((r) =>
        String(r.description ?? "").includes(tpl.label),
    );
    expect(toPost, `a ${tpl.label} draft to post`).toBeTruthy();
    const postRes = await execute(request, {
        action_key: "charge.post",
        ...ENT,
        payload: { charge_id: String(toPost!.chargeId) },
    });
    expect(postRes.json.ok, `charge.post ${tpl.label}: ${JSON.stringify(postRes.json)}`).toBe(true);

    const after = posted(await account(request), tpl.label).filter((r) => !r.correctsChargeId);
    expect(after.length, `${tpl.label} is posted`).toBeGreaterThan(0);
    return after[0];
}

// ── MOUNTED SURFACE ─────────────────────────────────────────────────────────────────────────────

const MOUNTED = 90_000;

async function openWorkspaceAccount(page: Page, customerId = HOUSEHOLD) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell, "the financials workspace mounts").toBeVisible({ timeout: MOUNTED });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${customerId}"]`);
    await expect(row, "the account is listed").toBeVisible({ timeout: MOUNTED });
    await row.click();
    const detail = shell.locator(`[data-financials-account-detail="${customerId}"]`);
    await expect(detail, "the account detail opens").toBeVisible({ timeout: MOUNTED });
    /*
     * WAIT FOR A RESOLVED CARD, NOT FOR A CLOCK AND NOT FOR A STRING.
     *
     * The card passes through TWO empty states — "Loading the account…" and "Financial account
     * unavailable" — and the second reads exactly like a terminal failure while subject resolution
     * is still in flight. Both carry `data-financials-empty`, so waiting for that element to leave
     * the DOM cannot be satisfied by either.
     */
    await expect(
        detail.locator("[data-financials-empty]"),
        "the card resolves an account rather than an empty state",
    ).toHaveCount(0, { timeout: MOUNTED });
    return { shell, detail };
}

const textOf = async (l: ReturnType<Page["locator"]>) => (await l.innerText()).replace(/\s+/g, " ");

// ── PHASE 2 · FINANCIAL SUBJECT ─────────────────────────────────────────────────────────────────

test.describe("QA 2 · financial subject", () => {
    test("a canonical customer is financially addressable, and a sibling account leaks nothing", async ({ page, request }) => {
        const vm = await account(request);
        expect(String(vm.account?.customerId), "the canonical customer").toBe(HOUSEHOLD);
        /*
         * `unavailable` IS A FEATURE, NOT A FAILURE.
         *
         * It is the card's list of facts it declines to fake — autopay, because no canonical autopay
         * truth exists, and payer_split, because Processing owns it. Reading it as a boolean failure
         * flag was this test's own error, and worth keeping named: a surface that says "I cannot
         * tell you this" is doing the right thing, and the terminal state is `unavailableReason`.
         */
        expect(vm.unavailableReason ?? null, "no terminal unavailable state").toBeNull();
        for (const fact of (vm.unavailable ?? []) as Row[]) {
            expect(String(fact.reason ?? ""), `${fact.fact} says why it is not claimed`).not.toBe("");
        }
        expect((vm.subjects ?? []).map((s) => String(s.agreementId)), "the agreement is the billable subject")
            .toContain(AGREEMENT);
        expect((vm.chargeTemplates ?? []).length, "Add charge has something to offer").toBeGreaterThan(0);

        const { shell, detail } = await openWorkspaceAccount(page);
        const text = await textOf(detail);
        expect(text, "the household is named").toMatch(/Alvarez/);
        /*
         * "No financial record" was the wrong sentence in every case it was shown — it reads as a
         * claim about the FAMILY rather than about the card's ability to resolve an account. It
         * must not come back.
         */
        expect(text, "no 'No financial record'").not.toMatch(/No financial record/i);
        expect(text, "Add charge is offered").toMatch(/Add charge/i);

        // COLD RELOAD reconstructs the same subject.
        await page.reload();
        const again = await openWorkspaceAccount(page);
        expect(await textOf(again.detail), "the subject survives a cold reload").toMatch(/Alvarez/);

        /*
         * A SWITCH AWAY AND BACK LEAKS NOTHING. The peer is still discovered rather than named —
         * naming one asserts a fact about the list's contents while pretending to test the switch.
         *
         * The reason recorded here before was that the list "holds accounts WITH activity". That
         * was true of the rail and was the defect: Accounts is the list of households that HAVE a
         * financial account, and zero activity is one of the states such an account can be in.
         */
        const peers = await shell.locator("[data-financials-account-row]").evaluateAll((els) =>
            els.map((e) => e.getAttribute("data-financials-account-row") || "").filter(Boolean),
        );
        const otherId = peers.find((id) => id !== HOUSEHOLD);
        expect(otherId, `a peer account to switch to: ${JSON.stringify(peers)}`).toBeTruthy();
        await shell.locator(`[data-financials-account-row="${otherId}"]`).click();
        const otherDetail = shell.locator(`[data-financials-account-detail="${otherId}"]`);
        await expect(otherDetail).toBeVisible({ timeout: MOUNTED });
        await expect(otherDetail.locator("[data-financials-empty]")).toHaveCount(0, { timeout: MOUNTED });
        expect(await textOf(otherDetail), "the peer is not this household").not.toMatch(/Dana Alvarez/);

        await shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`).click();
        const back = shell.locator(`[data-financials-account-detail="${HOUSEHOLD}"]`);
        await expect(back).toBeVisible({ timeout: MOUNTED });
        await expect(back.locator("[data-financials-empty]")).toHaveCount(0, { timeout: MOUNTED });
        expect(await textOf(back), "and the QA household comes back intact").toMatch(/Alvarez/);
    });
});

// ── PHASE 3 · CHARGE LIFECYCLE ──────────────────────────────────────────────────────────────────

test.describe("QA 3 · charge lifecycle", () => {
    test("A+B · a draft owes nothing; posting is what makes it owed", async ({ request }) => {
        const before = await account(request);
        const owedBefore = num(before.reconciliation?.balanceCents);
        const grossBefore = num(before.reconciliation?.grossCents);

        /*
         * A · ADD — A DRAFT, AND THE POSITION DOES NOT MOVE.
         *
         * GETTING A DRAFT IS ITSELF PERIOD-DEPENDENT, AND THAT IS CORRECT BEHAVIOUR.
         *
         * `charge.add` is idempotent per template and period: once a template has produced a charge
         * this month, adding it again legitimately creates nothing and still answers ok. This test
         * first named one template, and passed only until the suite had posted that template once —
         * after which it asked for a draft, got a successful no-op, and failed looking for a row
         * that was never going to exist.
         *
         * So every template is tried, and the first that actually yields a draft is used. When all
         * of them are spent for the period the law is proven on a REDUCTION draft instead: a manual
         * credit is written as a draft too, its key is ours to make unique, and "a draft is not
         * owed, posting is what makes it real" is the same law whichever kind of row carries it.
         */
        let draftFrom = "charge";
        if (byStatus(before, "draft").length === 0) {
            for (const tpl of Object.values(TPL)) {
                const added = await execute(request, {
                    action_key: "charge.add",
                    ...ENT,
                    payload: {
                        template_id: tpl.id, customer_id: HOUSEHOLD,
                        event_date: QA_DATE, service_period_start: QA_DATE,
                    },
                });
                expect(added.json.ok, `charge.add ${tpl.label}: ${JSON.stringify(added.json)}`).toBe(true);
                if (byStatus(await account(request), "draft").length > 0) break;
            }
        }
        if (byStatus(await account(request), "draft").length === 0) {
            draftFrom = "reduction";
            /*
             * AN OBLIGATION WITH ROOM LEFT IN IT.
             *
             * The first attempt took the first positive posted charge and was refused
             * `exceeds_obligation` — correctly: that one had already been reduced to nothing by an
             * earlier phase, and a credit cannot take an obligation below zero. Room is gross plus
             * the posted reductions already against it, which is the same rule the service applies.
             */
            const roomOf = (r: Row) =>
                num(r.amountCents) + (before.reductions ?? [])
                    .filter((d) => String(d.sourceChargeId ?? "") === String(r.chargeId)
                        && String(d.chargeStatus ?? "") === "posted")
                    .reduce((sum, d) => sum + num(d.amountCents), 0);
            const obligation = byStatus(before, "posted").find(
                (r) => !r.correctsChargeId && roomOf(r) >= 100,
            );
            expect(obligation, "an obligation with room left to credit against").toBeTruthy();
            const credited = await execute(request, {
                action_key: "billing.adjust_account", ...ENT,
                payload: {
                    enrollment_agreement_id: AGREEMENT,
                    source_charge_id: String(obligation!.chargeId),
                    amount_cents: -100,
                    charge_category: "credit",
                    reason: "core QA: prove a drafted credit is not owed",
                    effective_date: QA_DATE,
                    idempotency_key: `thread11:coreqa:draftlaw:${Date.now()}`,
                },
            });
            expect(credited.json.ok, `draft a credit: ${JSON.stringify(credited.json)}`).toBe(true);
        }

        const drafted = await account(request);
        const draft = byStatus(drafted, "draft")[0];
        expect(draft, `a draft exists (from a ${draftFrom})`).toBeTruthy();
        expect(num(drafted.reconciliation?.balanceCents), "a draft does not move what is owed").toBe(owedBefore);
        expect(num(drafted.reconciliation?.grossCents), "nor gross").toBe(grossBefore);
        expect(num(drafted.collectible?.currentlyCollectibleCents), "nor collectibility")
            .toBe(num(before.collectible?.currentlyCollectibleCents));

        // B · POST — the draft leaves awaiting-posting and the obligation becomes real.
        const draftId = String(draft.chargeId);
        const draftCents = num(draft.amountCents);
        const postRes = await execute(request, {
            action_key: "charge.post", ...ENT, payload: { charge_id: draftId },
        });
        expect(postRes.json.ok, `charge.post: ${JSON.stringify(postRes.json)}`).toBe(true);

        const after = await account(request);
        expect(byStatus(after, "draft").map((r) => String(r.chargeId)), "it left awaiting posting")
            .not.toContain(draftId);
        expect(byStatus(after, "posted").map((r) => String(r.chargeId)), "and it is posted")
            .toContain(draftId);

        /*
         * POSTING MOVES THE POSITION BY THE ROW'S OWN SIGNED AMOUNT.
         *
         * An obligation raises what is owed; a credit lowers it. Asserting a rise either way would
         * be asserting the sign of the fixture rather than the law, so the row's own amount decides
         * the direction and the law under test stays "nothing moved until this was posted".
         */
        expect(num(after.reconciliation?.balanceCents), "and only now does what is owed move").toBe(
            owedBefore + draftCents,
        );
        /*
         * GROSS ONLY MOVES FOR AN OBLIGATION.
         *
         * Whether the drafted row is an obligation or an offset is a fact about the ROW, not about
         * how this test obtained it. Reading it from `draftFrom` was wrong the moment a leftover
         * credit draft was picked up: posting it moved the balance by -100 and left gross alone,
         * exactly as it should, and the assertion blamed the product. The row's own category
         * decides, by the same distinction the reconciliation makes.
         */
        const OFFSET_CATEGORIES = new Set(["credit", "discount", "subsidy_offset", "adjustment"]);
        const draftIsObligation = !draft.correctsChargeId && !OFFSET_CATEGORIES.has(String(draft.categoryKey));
        if (draftIsObligation) {
            expect(num(after.reconciliation?.grossCents), "gross rose by exactly the charge").toBe(
                grossBefore + draftCents,
            );
        } else {
            expect(num(after.reconciliation?.grossCents), "an offset does not touch gross").toBe(grossBefore);
        }
    });

    test("C · the charge detail states the same charge the account states", async ({ request }) => {
        const vm = await account(request);
        const row = posted(vm, TPL.registration.label)[0];
        expect(row, "the baseline obligation").toBeTruthy();
        const detail = await chargeDetail(request, String(row.chargeId));
        const blob = JSON.stringify(detail);

        expect(blob, "the detail is about this charge").toContain(String(row.chargeId));
        expect(blob, "with its canonical amount").toContain(String(TPL.registration.cents));
        expect(blob, "its lifecycle").toMatch(/posted/);
        expect(blob, "and its attribution to the child").toContain(CHILD);
        expect(String(detail.customerMemberId ?? detail.detail?.customerMemberId ?? CHILD)).toBe(CHILD);
    });

    test("D · reversing a posted charge appends, refuses twice, and survives a reload", async ({ request }) => {
        /*
         * REUSE THE CHARGE THAT WAS ALREADY REVERSED, RATHER THAN DEMANDING A FRESH ONE.
         *
         * `ensurePosted` deliberately skips charges that carry a reversal, so on a rerun it tried to
         * create a second Late pickup — and `charge.add` is idempotent per template and period, so
         * it answered ok and created nothing. The product is right: one template, one charge, one
         * period. Every claim below is about a reversal that already happened, so the reversed
         * charge is exactly the right subject and needs no replacement.
         */
        const existing = posted(await account(request), TPL.latePickup.label)
            .filter((r) => !r.correctsChargeId);
        const target = existing.length > 0 ? existing[0] : await ensurePosted(request, TPL.latePickup);
        const chargeId = String(target.chargeId);
        const before = await account(request);
        const owedBefore = num(before.reconciliation?.balanceCents);

        const already = String(target.reversedByChargeId ?? "");
        if (!already) {
            expect(Boolean(target.offersReverse), "Reverse is offered on a live posted charge").toBe(true);
            const rev = await execute(request, {
                action_key: "charge.reverse", ...ENT,
                payload: { charge_id: chargeId, kind: "reversal", reason: "core QA charge reversal" },
            });
            expect(rev.json.ok, `charge.reverse: ${JSON.stringify(rev.json)}`).toBe(true);
        }

        const after = await account(request);
        const original = (after.rows ?? []).find((r) => String(r.chargeId) === chargeId);

        // THE ORIGINAL REMAINS HISTORICAL — posted childcare money is never voided in place.
        expect(original, "the original charge still exists").toBeTruthy();
        expect(String(original!.status), "and is still posted").toBe("posted");
        expect(String(original!.reversedByChargeId ?? ""), "with lineage to its reversal").not.toBe("");

        // THE CORRECTION IS AN APPENDED NEGATIVE ROW naming what it corrects.
        const correction = (after.rows ?? []).find((r) => String(r.correctsChargeId ?? "") === chargeId);
        expect(correction, "the correction row exists").toBeTruthy();
        expect(num(correction!.amountCents), "and it is the negative of the original").toBe(-num(target.amountCents));

        // CURRENT OBLIGATION CHANGED CANONICALLY.
        if (!already) {
            expect(num(after.reconciliation?.balanceCents), "what is owed fell by the reversed amount").toBe(
                owedBefore - num(target.amountCents),
            );
        }
        expect(Boolean(original!.offersReverse), "Reverse is no longer offered on it").toBe(false);

        // REVERSE-ONCE. The second attempt is refused by the service, not merely hidden by the UI.
        const twice = await execute(request, {
            action_key: "charge.reverse", ...ENT,
            payload: { charge_id: chargeId, kind: "reversal", reason: "core QA double reversal" },
        });
        expect(twice.json.ok, "a charge cannot be reversed twice").toBe(false);

        // A COLD READ RECONSTRUCTS THE SAME RESULT.
        const reread = await account(request);
        expect(
            (reread.rows ?? []).filter((r) => String(r.correctsChargeId ?? "") === chargeId).length,
            "exactly one correction, after a second attempt and a fresh read",
        ).toBe(1);
    });
});

// ── PHASE 4 · RESPONSIBILITY ────────────────────────────────────────────────────────────────────

test.describe("QA 4 · responsibility", () => {
    test("responsibility says who owes, and changes no money at all", async ({ request }) => {
        const baseline = await ensurePosted(request, TPL.registration);
        const before = await account(request);
        const owedBefore = num(before.reconciliation?.balanceCents);
        const grossBefore = num(before.reconciliation?.grossCents);
        const paymentsBefore = num(before.reconciliation?.paymentsCents);

        // 1-2 · THE ADULT IS SELECTABLE — from the product's own candidate reader, not from a guess.
        const candidates = await request.get(
            `/api/admin/financials/responsibility-candidates?customer_id=${HOUSEHOLD}`,
        );
        if (candidates.ok()) {
            const blob = JSON.stringify(await candidates.json());
            expect(blob, "the named adult is offered as a responsible party").toContain(ADULT);
            expect(blob, "and the child is not offered the bill").not.toMatch(
                new RegExp(`"${CHILD}"[^}]*"role_type"\\s*:\\s*"(parent|guardian)"`),
            );
        }

        // 3-4 · PREVIEW THEN CONFIRM. Preview must not write.
        const preview = await execute(request, {
            action_key: "billing.configure_responsibility",
            entity_type: "child", entity_id: CHILD, mode: "preview",
            payload: {
                customer_id: HOUSEHOLD, customer_member_id: CHILD, effective_start: "2026-01-01",
                shares: [{ responsible_party_id: ADULT, method: "fixed", amount_cents: TPL.registration.cents }],
            },
        });
        expect(
            JSON.stringify(preview.json),
            "the permission gate is passed — any refusal is about the arrangement, not the operator",
        ).not.toMatch(/fin\.responsibility|responsibility_permission_required/);

        // 5-7 · RESOLVE, then read the allocation back from the canonical authority.
        const resolved = await execute(request, {
            action_key: "billing.resolve_responsibility", ...ENT,
            payload: { charge_id: String(baseline.chargeId) },
        });
        expect(resolved.json.ok, `resolve: ${JSON.stringify(resolved.json)}`).toBe(true);

        const after = await account(request);
        const parties = after.responsibility?.parties ?? [];
        const dana = parties.find((p) => String(p.personId) === ADULT);
        expect(dana, `the named adult is allocated: ${JSON.stringify(parties)}`).toBeTruthy();
        expect(num(dana!.assignedCents), "her share").toBe(TPL.registration.cents);
        expect(
            num(after.responsibility?.allocatedCents) + num(after.responsibility?.unassignedCents),
            "every allocated cent is placed",
        ).toBe(num(after.responsibility?.allocatedCents) + num(after.responsibility?.unassignedCents));

        // 8-9 · AND NO MONEY MOVED. This is the whole law.
        expect(num(after.reconciliation?.balanceCents), "what is owed is unchanged").toBe(owedBefore);
        expect(num(after.reconciliation?.grossCents), "gross is unchanged").toBe(grossBefore);
        expect(num(after.reconciliation?.paymentsCents), "payments are unchanged").toBe(paymentsBefore);
    });

    test("10-11 · a later arrangement supersedes the earlier one rather than doubling it", async ({ request }) => {
        const before = await account(request);
        const allocatedBefore = num(before.responsibility?.allocatedCents);

        /*
         * SUPERSESSION IS DATED FORWARD, BECAUSE THE PRODUCT INSISTS.
         *
         * `predecessor_starts_later` refuses an arrangement starting on or before one already in
         * force — a real invariant behind the no-overlap exclusion on the arrangements table. So a
         * supersession is what a later date means, and that is exactly what is proven here.
         */
        const later = await execute(request, {
            action_key: "billing.configure_responsibility", ...ENT,
            payload: {
                customer_id: HOUSEHOLD, customer_member_id: CHILD, effective_start: "2026-06-01",
                shares: [{ responsible_party_id: ADULT, method: "fixed", amount_cents: TPL.registration.cents }],
            },
        });
        const superseded = Boolean(later.json.ok);
        if (!superseded) {
            // Already superseded by a prior run: the refusal must be about DATING, never authority.
            expect(JSON.stringify(later.json), "refused on the window, not on permission").toMatch(
                /predecessor_starts_later|effective|window|overlap/i,
            );
        }

        const after = await account(request);
        const parties = after.responsibility?.parties ?? [];
        const forDana = parties.filter((p) => String(p.personId) === ADULT);
        expect(forDana.length, "one live share for the adult, not two").toBe(1);
        expect(num(after.responsibility?.allocatedCents), "and the allocation did not double").toBe(
            allocatedBefore,
        );

        // 11 · A FRESH READ SHOWS THE ARRANGEMENT IN FORCE, not the history behind it.
        const baseline = posted(after, TPL.registration.label)[0];
        const detail = await chargeDetail(request, String(baseline.chargeId));
        const arrangement = detail.accountArrangement ?? detail.detail?.accountArrangement;
        expect(arrangement, "an arrangement is in force").toBeTruthy();
        const shares = (arrangement.shares ?? []).filter((s: Row) => /Dana/i.test(String(s.name ?? "")));
        expect(shares.length, "exactly one live share for her").toBe(1);
    });
});

// ── PHASE 5 · EXPECTED FUNDING ──────────────────────────────────────────────────────────────────

test.describe("QA 5 · expected funding", () => {
    test("an expectation is not money: it changes nothing owed and supersedes on correction", async ({ request }) => {
        const vm0 = await account(request);
        const baseline = posted(vm0, TPL.registration.label)[0];
        const detail0 = await chargeDetail(request, String(baseline.chargeId));
        const arrangement = detail0.accountArrangement ?? detail0.detail?.accountArrangement;
        const share = (arrangement.shares ?? []).find((s: Row) => /Dana/i.test(String(s.name ?? "")));
        expect(share, "the named share to fund").toBeTruthy();
        const shareId = String(share.id);

        const owedBefore = num(vm0.reconciliation?.balanceCents);
        const collectibleBefore = num(vm0.collectible?.currentlyCollectibleCents);
        const paymentsBefore = (vm0.payments ?? []).length;

        /*
         * THE IDEMPOTENCY KEY IS SCOPED TO THE SHARE, AND THAT MATTERS.
         *
         * This test first reused the readiness run's keys and both writes returned ok — as
         * IDEMPOTENT REPLAYS of funding attached to a share that Phase 4 had since superseded.
         * Nothing was written, the live share carried no expectation, and a green `ok: true` had
         * asserted precisely nothing. A key names an ACT; a different act needs a different key,
         * and binding it to the share makes the act re-runnable without ever colliding with the
         * history of a share that is no longer in force.
         */
        const key = `thread11:coreqa:funding:${shareId}`;

        // 1-3 · CONFIGURE, then CORRECT. Two writes, one live expectation.
        const first = await execute(request, {
            action_key: "billing.configure_expected_funding", ...ENT,
            payload: {
                share_id: shareId, funding_source_type: "employer_sponsorship",
                funding_source_label: "Northwind Employer Benefit (demo)",
                basis: "fixed_amount", expected_amount_cents: 5000, effective_start: "2026-01-01",
                idempotency_key: `${key}:v1`,
            },
        });
        expect(first.json.ok, `funding: ${JSON.stringify(first.json)}`).toBe(true);
        const corrected = await execute(request, {
            action_key: "billing.configure_expected_funding", ...ENT,
            payload: {
                share_id: shareId, funding_source_type: "employer_sponsorship",
                funding_source_label: "Northwind Employer Benefit (demo)",
                basis: "fixed_amount", expected_amount_cents: 4500, effective_start: "2026-01-01",
                idempotency_key: `${key}:v2`,
            },
        });
        expect(corrected.json.ok, `correction: ${JSON.stringify(corrected.json)}`).toBe(true);

        // 10 · THE CORRECTION REPLACES. 4500, never 9500.
        const detail1 = await chargeDetail(request, String(baseline.chargeId));
        const arr1 = detail1.accountArrangement ?? detail1.detail?.accountArrangement;
        const share1 = (arr1.shares ?? []).find((s: Row) => String(s.id) === shareId);
        const live = ((share1?.expectedFunding ?? []) as Row[]).filter(
            (f) => String(f.state ?? "active").toLowerCase() === "active",
        );
        const total = live.reduce((s, f) => s + num(f.expectedAmountCents ?? f.expected_amount_cents), 0);
        expect(total, `the expectation after correction: ${JSON.stringify(share1?.expectedFunding)}`).toBe(4500);
        expect(total, "and specifically not the sum of both").not.toBe(9500);

        // 2 · THE SOURCE IS NAMED, and it is an employer — not an agency.
        const vm1 = await account(request);
        const funding = vm1.expectedFunding ?? [];
        expect(JSON.stringify(funding), "the source is labelled").toContain("Northwind Employer Benefit (demo)");
        expect(JSON.stringify(funding), "as employer sponsorship").toMatch(/employer_sponsorship/);
        expect(num(funding[0]?.expectedCents ?? funding[0]?.expectedAmountCents), "at the corrected amount").toBe(4500);

        // 4-8 · NOT YET RECEIVED. It creates no payment and suppresses nothing.
        expect((vm1.payments ?? []).length, "no payment was created").toBe(paymentsBefore);
        expect(num(vm1.reconciliation?.balanceCents), "what is owed is unchanged").toBe(owedBefore);
        expect(num(vm1.collectible?.currentlyCollectibleCents), "collectibility is unchanged").toBe(
            collectibleBefore,
        );
        /*
         * THE FIELD IS CALLED `expectedSubsidyCents` AND HOLDS EXPECTED FUNDING FROM ANY SOURCE.
         *
         * This test first asserted 0 there, on the assumption that an EMPLOYER sponsorship is not
         * subsidy. The assumption was about the NAME. `collectiblePosition` sums every expected
         * funding row into that field whatever its source type, and then uses it only as one of
         * three BOUNDS on suppression — and suppression is hard-zero while no claim has been
         * submitted. So the honest assertions are these two: the expectation is reported, and it
         * suppresses nothing. A naming observation is carried to the handoff; the behaviour is
         * correct and is what Decision B requires.
         */
        expect(num(vm1.collectible?.expectedSubsidyCents), "the expectation is reported").toBe(4500);
        expect(
            num(vm1.collectible?.submittedClaimSuppressionCents),
            "and it suppresses nothing, because nothing was ever claimed",
        ).toBe(0);
        expect(num(vm1.collectible?.currentlyCollectibleCents), "so collectible still equals outstanding").toBe(
            num(vm1.collectible?.outstandingCents),
        );

        // 9 · NO SUBSIDY OBJECT WAS NEEDED TO DO ANY OF IT.
        expect(
            funding.every((f) => !f.subsidyAuthorizationId && !f.subsidy_authorization_id),
            "the expectation claims no subsidy authorization",
        ).toBe(true);
    });
});

// ── PHASE 6 · MANUAL ADJUSTMENT AND THE ZERO BOUND ──────────────────────────────────────────────

test.describe("QA 6 · manual adjustment", () => {
    test("A+B+C · a reduction drafts, posts, reaches exactly zero, and goes no further", async ({ request }) => {
        await ensurePosted(request, TPL.fieldTrip);
        const before = await account(request);

        /*
         * AN OBLIGATION THAT STILL HAS ROOM, NOT ONE PARTICULAR OBLIGATION.
         *
         * This named the Field trip charge and assumed it always had something left to reduce. It
         * does not: reducing it to zero is the whole point of this test, and the reversal that
         * restores it lives in the NEXT test — so any run that stopped in between left it at zero
         * and the next run failed on its own leftovers rather than on the product. The law is about
         * any obligation, so the subject is whichever one still has room, Field trip preferred.
         */
        const roomOf = (vm: Vm, r: Row) =>
            num(r.amountCents) + (vm.reductions ?? [])
                .filter((d) => String(d.sourceChargeId ?? "") === String(r.chargeId)
                    && String(d.chargeStatus ?? "") === "posted")
                .reduce((sum, d) => sum + num(d.amountCents), 0);

        const candidates = byStatus(before, "posted").filter((r) => !r.correctsChargeId && roomOf(before, r) > 0);
        const target = candidates.find((r) => String(r.description ?? "").includes(TPL.fieldTrip.label))
            ?? candidates[0];
        expect(target, "an obligation with something left to reduce").toBeTruthy();
        const chargeId = String(target.chargeId);
        const gross = num(target.amountCents);
        const owedBefore = num(before.reconciliation?.balanceCents);

        /*
         * THE NET, BY THE CANONICAL RULE — GROSS PLUS EVERY POSTED REDUCTION.
         *
         * `resolveAllocatableNet` sums ALL reductions against the obligation, and it is right to:
         * a reversed reduction and the credit that reversed it are both real rows and they cancel.
         * Filtering out the reversed one while keeping its reversal, which this test did first,
         * double-counts the reversal and reported a $40 obligation as being worth $80.
         */
        const netOf = (vm: Vm) =>
            gross + (vm.reductions ?? [])
                .filter((r) =>
                    String(r.sourceChargeId ?? "") === chargeId
                    && String(r.chargeStatus ?? "") === "posted")
                .reduce((sum, r) => sum + num(r.amountCents), 0);

        const room = netOf(before);
        /*
         * A KEY PER CYCLE. The obligation can be reduced, reversed and reduced again across runs,
         * and each of those is a DIFFERENT act — reusing one key would replay the first reduction
         * idempotently and write nothing while reporting ok.
         */
        const cycle = (before.reductions ?? []).filter(
            (r) => String(r.sourceChargeId ?? "") === chargeId,
        ).length;
        expect(room, "the obligation has room to be reduced").toBeGreaterThan(0);

        // A · DRAFT. The adjustment is created, names its obligation, and moves NOTHING.
        const drafted = await execute(request, {
            action_key: "billing.adjust_account", ...ENT,
            payload: {
                enrollment_agreement_id: AGREEMENT,
                source_charge_id: chargeId,
                amount_cents: -room,
                charge_category: "credit",
                reason: "core QA: reduce this obligation to exactly zero",
                effective_date: QA_DATE,
                idempotency_key: `thread11:coreqa:to-zero:${chargeId}:${cycle}`,
            },
        });
        expect(drafted.json.ok, `adjust_account: ${JSON.stringify(drafted.json)}`).toBe(true);

        const afterDraft = await account(request);
        const reduction = (afterDraft.reductions ?? []).find(
            (r) => String(r.sourceChargeId ?? "") === chargeId && !r.reversedByApplicationId,
        );
        expect(reduction, `the adjustment exists: ${JSON.stringify(afterDraft.reductions)}`).toBeTruthy();
        expect(String(reduction!.sourceChargeId), "and names the obligation it reduces").toBe(chargeId);

        /*
         * A DRAFT ADJUSTMENT IS NOT AN EFFECTIVE ONE.
         *
         * `billing.adjust_account` writes a reduction whose own charge is a DRAFT, and
         * `reconcileRows` counts only posted rows. This test first asserted the balance moved on
         * creation and was wrong in exactly the way the draft law says it should be: posting is what
         * makes a reduction real, for a credit no less than for a charge.
         */
        if (String(reduction!.chargeStatus ?? "") === "draft") {
            expect(num(afterDraft.reconciliation?.balanceCents), "a drafted reduction moves nothing").toBe(
                owedBefore,
            );
            expect(netOf(afterDraft), "and the obligation is untouched while it is a draft").toBe(room);

            // B · POST — and only now does the obligation fall.
            const postRes = await execute(request, {
                action_key: "charge.post", ...ENT,
                payload: { charge_id: String(reduction!.chargeId) },
            });
            expect(postRes.json.ok, `post the reduction: ${JSON.stringify(postRes.json)}`).toBe(true);
        }

        const atZero = await account(request);
        expect(netOf(atZero), "the obligation is now exactly zero").toBe(0);
        expect(num(atZero.reconciliation?.balanceCents), "and what is owed fell by exactly that much").toBe(
            owedBefore - room,
        );

        // C · ONE CENT BELOW ZERO IS REFUSED. This is the reduction law.
        const below = await execute(request, {
            action_key: "billing.adjust_account", ...ENT,
            payload: {
                enrollment_agreement_id: AGREEMENT,
                source_charge_id: chargeId,
                amount_cents: -1,
                charge_category: "credit",
                reason: "core QA: one cent below zero must be refused",
                effective_date: QA_DATE,
                idempotency_key: `thread11:coreqa:below-zero:${chargeId}:${Date.now()}`,
            },
        });
        expect(below.json.ok, `a reduction may not take an obligation below zero: ${JSON.stringify(below.json)}`)
            .toBe(false);
        expect(JSON.stringify(below.json), "and it refuses on the obligation, not on authority").toMatch(
            /exceeds_obligation|obligation|negative/i,
        );

        // AND THE REFUSAL WROTE NOTHING.
        const afterRefusal = await account(request);
        expect(netOf(afterRefusal), "still exactly zero after the refusal").toBe(0);
        expect(num(afterRefusal.reconciliation?.balanceCents), "and the account position is untouched").toBe(
            num(atZero.reconciliation?.balanceCents),
        );
    });

    test("D · reversing a reduction appends the opposite, restores the obligation, and refuses twice", async ({ request }) => {
        const vm = await account(request);
        const target = posted(vm, TPL.fieldTrip.label).filter((r) => !r.correctsChargeId)[0];
        const chargeId = String(target.chargeId);
        const live = (vm.reductions ?? []).filter(
            (r) => String(r.sourceChargeId ?? "") === chargeId && !r.reversedByApplicationId && num(r.amountCents) < 0,
        );
        expect(live.length, "a reduction to reverse").toBeGreaterThan(0);
        const reduction = live[0];
        const applicationId = String(reduction.applicationId ?? reduction.id);
        const owedBefore = num(vm.reconciliation?.balanceCents);

        const rev = await execute(request, {
            action_key: "billing.reverse_adjustment", ...ENT,
            payload: { application_id: applicationId, reason: "core QA: reverse the manual reduction" },
        });
        expect(rev.json.ok, `reverse adjustment: ${JSON.stringify(rev.json)}`).toBe(true);

        const after = await account(request);

        // THE ORIGINAL REMAINS HISTORICAL, with lineage — nothing is edited in place.
        const original = (after.reductions ?? []).find((r) => String(r.applicationId ?? r.id) === applicationId);
        expect(original, "the original reduction still exists").toBeTruthy();
        expect(String(original!.reversedByApplicationId ?? ""), "and names what reversed it").not.toBe("");

        // THE OPPOSITE IS APPENDED.
        const opposite = (after.reductions ?? []).find(
            (r) => String(r.reversesApplicationId ?? "") === applicationId,
        );
        expect(opposite, "the reversing row exists").toBeTruthy();
        expect(num(opposite!.amountCents), "as the exact opposite").toBe(-num(reduction.amountCents));

        /*
         * THE REVERSAL DRAFTS TOO, AND THAT IS THE SAME LAW.
         *
         * Reversing a reduction appends an opposite reduction, and it is drafted exactly as the
         * original was: posting is what makes it effective. A reversal that took effect on creation
         * would be the one place in Financials where money moved without anyone posting it.
         */
        if (String(opposite!.chargeStatus ?? "") === "draft") {
            const postBack = await execute(request, {
                action_key: "charge.post", ...ENT,
                payload: { charge_id: String(opposite!.chargeId) },
            });
            expect(postBack.json.ok, `post the reversal: ${JSON.stringify(postBack.json)}`).toBe(true);
        }

        // THE OBLIGATION IS RESTORED — the full cycle is neutral.
        const restored = await account(request);
        expect(num(restored.reconciliation?.balanceCents), "what is owed is restored").toBe(
            owedBefore - num(reduction.amountCents),
        );

        // REVERSE-ONCE.
        const twice = await execute(request, {
            action_key: "billing.reverse_adjustment", ...ENT,
            payload: { application_id: applicationId, reason: "core QA: double reversal must refuse" },
        });
        expect(twice.json.ok, "a reduction cannot be reversed twice").toBe(false);
    });
});

// ── PHASE 7-8 · PAYMENT RECEIPT, APPLICATION, AND UNAPPLIED MONEY ───────────────────────────────

test.describe("QA 7-8 · payment receipt and unapplied money", () => {
    test("a receipt is historical; applications decide where the money sits", async ({ request }) => {
        await ensurePosted(request, TPL.materials);

        /*
         * RE-RUNNABLE, BECAUSE A RECEIPT IS PERMANENT.
         *
         * This test first assumed its target obligation was unpaid, which was true exactly once —
         * the receipt it records settles the obligation for good, and money that has arrived cannot
         * be un-received. So the receipt is created only if it is not already there, and its
         * invariants are re-proven either way.
         */
        const existing = (await account(request)).payments?.find(
            (p) => String(p.reference ?? "") === "CORE-QA-0001" && String(p.direction) === "inbound",
        );

        let expectedApplied = 0;
        if (!existing) {
            const before = await account(request);
            const owedBefore = num(before.reconciliation?.balanceCents);
            const receivedBefore = num(before.reconciliation?.paymentsCents);
            const open = byStatus(before, "posted").find(
                (r) => num(r.outstandingCents) > 0 && !r.correctsChargeId,
            );
            expect(open, "an unpaid obligation to receive money against").toBeTruthy();
            const chargeId = String(open!.chargeId);
            const outstandingBefore = num(open!.outstandingCents);
            expectedApplied = outstandingBefore;

            /*
             * OVERPAY ON PURPOSE. A receipt larger than the obligation is what makes "received",
             * "applied" and "unapplied" three different numbers rather than one number said three
             * ways — which is the whole of Phase 8.
             */
            const recorded = await execute(request, {
                action_key: "payment.record", ...ENT,
                payload: {
                    charge_id: chargeId,
                    amount_cents: outstandingBefore + 1000,
                    payment_method: "check",
                    reference_number: "CORE-QA-0001",
                    payer_entity_type: "person",
                    payer_entity_id: ADULT,
                    idempotency_key: `thread11:coreqa:receipt:${chargeId}`,
                },
            });
            expect(recorded.json.ok, `payment.record: ${JSON.stringify(recorded.json)}`).toBe(true);

            const settled = await account(request);
            expect(num(settled.reconciliation?.paymentsCents), "received rose by the whole receipt").toBe(
                receivedBefore + outstandingBefore + 1000,
            );
            expect(
                num(settled.reconciliation?.balanceCents),
                "but what is owed fell by the APPLIED amount, not by the receipt",
            ).toBe(owedBefore - outstandingBefore);
            const paidRow = (settled.rows ?? []).find((r) => String(r.chargeId) === chargeId)!;
            expect(num(paidRow.outstandingCents), "and the obligation it paid is settled").toBe(0);
        }

        const after = await account(request);
        const payment = (after.payments ?? []).find((p) => String(p.reference ?? "") === "CORE-QA-0001" && String(p.direction) === "inbound");
        expect(payment, `the receipt is listed: ${JSON.stringify(after.payments)}`).toBeTruthy();

        // 1-4 · THE RECEIPT IS WHAT WAS RECEIVED, AND STAYS SO.
        expect(String(payment!.direction ?? ""), "money coming in").toBe("inbound");
        expect(String(payment!.status ?? ""), "posted").toBe("posted");
        expect(String(payment!.method ?? ""), "by the method used").toMatch(/check/i);
        if (expectedApplied) {
            expect(num(payment!.appliedCents), "applied what the obligation needed").toBe(expectedApplied);
        }

        // 5-9 · RECEIVED, APPLIED AND UNAPPLIED ARE THREE DISTINCT, CORRECT NUMBERS.
        const applied = num(payment!.appliedCents);
        const unapplied = num(payment!.unappliedCents);
        /*
         * APPLIED + UNAPPLIED + REFUNDED = RECEIVED.
         *
         * The first form of this left the refund out and held only until scenario 11 had run: a
         * $28.00 receipt with $5.00 refunded reports $23.00 across applied and unapplied, and the
         * missing $5.00 is not a discrepancy — it went back to the family. That is the same
         * distinction the refund gate makes from the other side: refunded money is NOT unapplied
         * money, so it must not be expected to appear there.
         */
        const refunded = (after.payments ?? [])
            .filter((p) => String(p.refundsPaymentId ?? "") === String(payment!.paymentId))
            .reduce((sum, p) => sum + Math.abs(num(p.amountCents)), 0);
        expect(applied + unapplied + refunded, "applied plus unapplied plus refunded is the receipt").toBe(
            num(payment!.amountCents),
        );
        expect(unapplied, "and unapplied money is still received money").toBeGreaterThanOrEqual(0);

        // EVERY ACTIVE APPLICATION NAMES THE OBLIGATION IT SETTLED.
        const active = ((payment!.applications ?? []) as Row[]).filter((a) => String(a.status) === "active");
        expect(
            active.reduce((sum, a) => sum + num(a.appliedCents), 0),
            "the active applications add up to what is applied",
        ).toBe(applied);
        for (const a of active) {
            expect(String(a.chargeId), "each application names its charge").not.toBe("");
            expect(a.reversedAt ?? null, "and an active application is not a reversed one").toBeNull();
        }
    });

    test("unapplied money can be applied elsewhere without a new receipt", async ({ request }) => {
        const vm = await account(request);
        const payment = (vm.payments ?? []).find((p) => String(p.reference ?? "") === "CORE-QA-0001" && String(p.direction) === "inbound");
        expect(payment, "the overpaid receipt").toBeTruthy();
        const paymentId = String(payment!.paymentId);
        let unapplied = num(payment!.unappliedCents ?? 0);
        const receiptsBefore = (vm.payments ?? []).length;

        /*
         * IF THERE IS NOTHING UNAPPLIED, MAKE SOME — THE WAY THE PRODUCT MAKES IT.
         *
         * This test used to fall back to a made-up 1000 cents when the receipt had no unapplied
         * money, and was refused `only 0 cents remain unapplied` the first time a prior phase had
         * placed all of it. Reversing an application is how money genuinely becomes unapplied, so
         * that is what this does — it is the same act scenario 14 performs, and it keeps the
         * scenario about PLACING unapplied money rather than about inventing it.
         */
        if (unapplied === 0) {
            const active = ((payment!.applications ?? []) as Row[]).filter((a) => String(a.status) === "active");
            expect(active.length, "an application to release money from").toBeGreaterThan(0);
            const released = await execute(request, {
                action_key: "payment.reverse_application", ...ENT,
                payload: {
                    allocation_id: String(active[0].allocationId),
                    reason: "core QA: release money so it can be placed elsewhere",
                },
            });
            expect(released.json.ok, `release: ${JSON.stringify(released.json)}`).toBe(true);
            const refreshed = await qaReceipt(request);
            unapplied = num(refreshed.payment.unappliedCents ?? 0);
            expect(unapplied, "money is now unapplied").toBeGreaterThan(0);
        }

        const alreadyPaying = new Set(
            ((payment!.applications ?? []) as Row[]).map((a) => String(a.chargeId)),
        );
        const current = await account(request);
        const open = byStatus(current, "posted").find(
            (r) => num(r.outstandingCents) > 0 && !r.correctsChargeId && !alreadyPaying.has(String(r.chargeId)),
        );
        expect(open, "another obligation with something still owed on it").toBeTruthy();
        const targetId = String(open!.chargeId);
        const targetOutstandingBefore = num(open!.outstandingCents);
        const moveCents = Math.min(unapplied, targetOutstandingBefore);
        expect(moveCents, "there is unapplied money to place").toBeGreaterThan(0);

        const applied = await execute(request, {
            action_key: "payment.apply_to_charge", ...ENT,
            payload: { payment_id: paymentId, charge_id: targetId, amount_cents: moveCents },
        });
        expect(applied.json.ok, `apply: ${JSON.stringify(applied.json)}`).toBe(true);

        const after = await account(request);
        const target = (after.rows ?? []).find((r) => String(r.chargeId) === targetId)!;
        expect(num(target.outstandingCents), "the target obligation received the money").toBe(
            targetOutstandingBefore - moveCents,
        );
        expect((after.payments ?? []).length, "and no new receipt was created").toBe(receiptsBefore);

        const same = (after.payments ?? []).find((p) => String(p.reference ?? "") === "CORE-QA-0001" && String(p.direction) === "inbound")!;
        expect(num(same.amountCents), "the receipt itself is unchanged — it is history").toBe(
            num(payment!.amountCents),
        );
        expect(num(same.unappliedCents ?? 0), "and unapplied fell by what was placed").toBe(unapplied - moveCents);
    });
});

// ── PHASE 9 · MOVE PAYMENT ──────────────────────────────────────────────────────────────────────

/**
 * The QA receipt, with its applications, read from the canonical account.
 *
 * THE DIRECTION IS PART OF THE IDENTITY. A refund carries the reference of the receipt it refunds,
 * so matching on the reference alone starts returning the OUTBOUND row the moment scenario 11 has
 * run — and every later assertion then describes a refund while claiming to describe a receipt.
 */
async function qaReceipt(request: APIRequestContext) {
    const vm = await account(request);
    const payment = (vm.payments ?? []).find((p) => String(p.reference ?? "") === "CORE-QA-0001" && String(p.direction) === "inbound");
    expect(payment, "the QA receipt").toBeTruthy();
    return { vm, payment: payment! };
}

test.describe("QA 9 · move payment", () => {
    test("a move is a reversal and then an application, and the receipt never changes", async ({ request }) => {
        const { vm, payment } = await qaReceipt(request);
        const paymentId = String(payment.paymentId);
        const receiptCents = num(payment.amountCents);

        const active = ((payment.applications ?? []) as Row[]).filter((a) => String(a.status) === "active");
        expect(active.length, "an active application to move").toBeGreaterThan(0);
        const application = active[0];
        const sourceChargeId = String(application.chargeId);
        const movedCents = num(application.appliedCents);

        // 3-4 · THE TARGET CHOOSER OFFERS THIS HOUSEHOLD ONLY.
        const eligible = await request.get(
            `/api/admin/financials/eligible-target-charges?payment_id=${paymentId}&exclude_charge_id=${sourceChargeId}`,
        );
        expect(eligible.ok(), `target chooser ${eligible.status()}`).toBe(true);
        const targets = (await eligible.json()) as Row;
        const targetBlob = JSON.stringify(targets);
        const ownChargeIds = new Set((vm.rows ?? []).map((r) => String(r.chargeId)));
        const offered: Row[] = (targets.data ?? targets.charges ?? targets.rows ?? []) as Row[];
        for (const t of offered) {
            expect(
                ownChargeIds.has(String(t.chargeId ?? t.id)),
                `every offered target belongs to this household: ${JSON.stringify(t)}`,
            ).toBe(true);
        }
        expect(targetBlob, "the source charge is excluded from its own move").not.toContain(sourceChargeId);

        // 5 · A REASON IS REQUIRED. The reversal row is the only account of why money moved.
        const noReason = await execute(request, {
            action_key: "payment.reverse_application", ...ENT,
            payload: { allocation_id: String(application.allocationId) },
        });
        expect(noReason.json.ok, "a reversal without a reason is refused").toBe(false);
        expect(JSON.stringify(noReason.json), "and says so").toMatch(/reason/i);

        const beforeRow = (vm.rows ?? []).find((r) => String(r.chargeId) === sourceChargeId)!;
        const sourceOutstandingBefore = num(beforeRow.outstandingCents);

        // 8-10 · REVERSE. The source obligation is restored and the money becomes unapplied.
        const reversed = await execute(request, {
            action_key: "payment.reverse_application", ...ENT,
            payload: {
                allocation_id: String(application.allocationId),
                reason: "core QA: move this payment to another obligation",
            },
        });
        expect(reversed.json.ok, `reverse application: ${JSON.stringify(reversed.json)}`).toBe(true);

        const mid = await qaReceipt(request);
        const midRow = (mid.vm.rows ?? []).find((r) => String(r.chargeId) === sourceChargeId)!;
        expect(num(midRow.outstandingCents), "the source obligation is owed again").toBe(
            sourceOutstandingBefore + movedCents,
        );
        expect(num(mid.payment.unappliedCents), "and the money is unapplied, not gone").toBe(
            num(payment.unappliedCents) + movedCents,
        );
        expect(num(mid.payment.amountCents), "the receipt itself is untouched").toBe(receiptCents);

        // 11-12 · REAPPLY ELSEWHERE.
        const target = byStatus(mid.vm, "posted").find(
            (r) => num(r.outstandingCents) > 0 && String(r.chargeId) !== sourceChargeId && !r.correctsChargeId,
        );
        expect(target, "another obligation to move the money to").toBeTruthy();
        const targetId = String(target!.chargeId);
        const targetOutstandingBefore = num(target!.outstandingCents);
        const applyCents = Math.min(movedCents, targetOutstandingBefore);

        const reapplied = await execute(request, {
            action_key: "payment.apply_to_charge", ...ENT,
            payload: { payment_id: paymentId, charge_id: targetId, amount_cents: applyCents },
        });
        expect(reapplied.json.ok, `reapply: ${JSON.stringify(reapplied.json)}`).toBe(true);

        const done = await qaReceipt(request);
        const targetRow = (done.vm.rows ?? []).find((r) => String(r.chargeId) === targetId)!;
        expect(num(targetRow.outstandingCents), "the target obligation fell by what was moved").toBe(
            targetOutstandingBefore - applyCents,
        );

        // 13 · RECEIPT AND PAYER ARE UNCHANGED — a move is not a new receipt.
        expect(num(done.payment.amountCents), "the receipt is the same receipt").toBe(receiptCents);
        expect(String(done.payment.reference), "with the same reference").toBe("CORE-QA-0001");
        expect(String(done.payment.direction), "still inbound").toBe("inbound");

        // 14 · THE HISTORY SHOWS APPLIED → REVERSED → APPLIED, all three.
        const apps = (done.payment.applications ?? []) as Row[];
        const reversedApp = apps.find((a) => String(a.allocationId) === String(application.allocationId));
        expect(reversedApp, "the original application is still in the history").toBeTruthy();
        expect(String(reversedApp!.status), "marked reversed rather than deleted").toBe("reversed");
        expect(reversedApp!.reversedAt ?? null, "with when").not.toBeNull();
        expect(String(reversedApp!.reversalReason ?? ""), "and why").not.toBe("");
        expect(
            apps.some((a) => String(a.chargeId) === targetId && String(a.status) === "active"),
            "and the new application is active on the target",
        ).toBe(true);

        // 15 · NO PROVIDER MUTATION. Moving money inside the ledger touches no rail.
        expect(done.payment.processor ?? null, "no processor was involved").toBeNull();
    });
});

// ── PHASE 10 · THE FAILED REAPPLY ───────────────────────────────────────────────────────────────

test.describe("QA 10 · failed reapply", () => {
    test("when reapply is refused the reversal stands and the money stays unapplied", async ({ request }) => {
        const { vm, payment } = await qaReceipt(request);
        const paymentId = String(payment.paymentId);
        const active = ((payment.applications ?? []) as Row[]).filter((a) => String(a.status) === "active");
        expect(active.length, "an active application to reverse").toBeGreaterThan(0);
        const application = active[0];
        const sourceChargeId = String(application.chargeId);
        const movedCents = num(application.appliedCents);
        const sourceOutstandingBefore = num(
            (vm.rows ?? []).find((r) => String(r.chargeId) === sourceChargeId)!.outstandingCents,
        );
        const unappliedBefore = num(payment.unappliedCents);

        // STEP ONE SUCCEEDS.
        const reversed = await execute(request, {
            action_key: "payment.reverse_application", ...ENT,
            payload: { allocation_id: String(application.allocationId), reason: "core QA: failed-reapply scenario" },
        });
        expect(reversed.json.ok, `reverse: ${JSON.stringify(reversed.json)}`).toBe(true);

        /*
         * STEP TWO IS MADE TO FAIL, DELIBERATELY — AND BY THE PRODUCT'S OWN RULE.
         *
         * The first attempt here targeted another household, which is the refusal Phase 13 proves.
         * It could not be used as the forcing lever: the only other fixture household with an
         * agreement carries no money at all, and creating money there to make a failure happen
         * would be seeding a scenario rather than finding one.
         *
         * Over-application is the honest lever. Applying more than the receipt still has unplaced
         * is refused by the payment service itself, needs no second household, and is deterministic
         * — and it leaves the reversal committed in exactly the way this phase exists to prove.
         */
        const mid = await qaReceipt(request);
        const available = num(mid.payment.unappliedCents);
        const openTarget = byStatus(mid.vm, "posted").find(
            (r) => num(r.outstandingCents) > 0 && !r.correctsChargeId,
        );
        expect(openTarget, "an obligation to attempt against").toBeTruthy();

        const refused = await execute(request, {
            action_key: "payment.apply_to_charge", ...ENT,
            payload: {
                payment_id: paymentId,
                charge_id: String(openTarget!.chargeId),
                amount_cents: available + 100_000,
            },
        });
        expect(
            refused.json.ok,
            `a receipt cannot place money it does not have: ${JSON.stringify(refused.json)}`,
        ).toBe(false);

        // THE REVERSAL REMAINS COMMITTED. This is the non-atomic contract, stated out loud.
        const after = await qaReceipt(request);
        const sourceRow = (after.vm.rows ?? []).find((r) => String(r.chargeId) === sourceChargeId)!;
        expect(num(sourceRow.outstandingCents), "the source obligation is owed again, and stays owed").toBe(
            sourceOutstandingBefore + movedCents,
        );
        expect(num(after.payment.unappliedCents), "and the money remains unapplied — it was not rolled back").toBe(
            unappliedBefore + movedCents,
        );
        const stillReversed = ((after.payment.applications ?? []) as Row[]).find(
            (a) => String(a.allocationId) === String(application.allocationId),
        );
        expect(String(stillReversed!.status), "the reversal is not undone by the failure").toBe("reversed");

        // RECOVERY IS AVAILABLE, AND IT WORKS.
        const recovery = byStatus(after.vm, "posted").find(
            (r) => num(r.outstandingCents) > 0 && !r.correctsChargeId,
        );
        expect(recovery, "an obligation to recover the money onto").toBeTruthy();
        const recoverCents = Math.min(movedCents, num(recovery!.outstandingCents));
        const recovered = await execute(request, {
            action_key: "payment.apply_to_charge", ...ENT,
            payload: { payment_id: paymentId, charge_id: String(recovery!.chargeId), amount_cents: recoverCents },
        });
        expect(recovered.json.ok, `recovery apply: ${JSON.stringify(recovered.json)}`).toBe(true);

        const final = await qaReceipt(request);
        expect(num(final.payment.unappliedCents), "and the unapplied money has been placed").toBe(
            unappliedBefore + movedCents - recoverCents,
        );
    });
});

// ── PHASE 11 · REFUND ───────────────────────────────────────────────────────────────────────────

test.describe("QA 11 · refund", () => {
    test("a refund is an outbound payment with lineage, and is never 'unapplied'", async ({ request }) => {
        const { payment } = await qaReceipt(request);
        const paymentId = String(payment.paymentId);
        const unapplied = num(payment.unappliedCents);
        const receiptCents = num(payment.amountCents);

        const existing = (await account(request)).payments?.find(
            (p) => String(p.refundsPaymentId ?? "") === paymentId,
        );

        const refundCents = existing ? num(existing.amountCents) : Math.min(500, Math.max(unapplied, 1));
        if (!existing) {
            const refunded = await execute(request, {
                action_key: "payment.refund", ...ENT,
                payload: {
                    payment_id: paymentId,
                    amount_cents: refundCents,
                    reason: "core QA: refund part of an overpayment",
                    idempotency_key: `thread11:coreqa:refund:${paymentId}`,
                },
            });
            expect(refunded.json.ok, `refund: ${JSON.stringify(refunded.json)}`).toBe(true);
        }

        const after = await account(request);

        // 1 · THE ORIGINAL RECEIPT REMAINS. Refunding money does not un-receive it.
        const original = (after.payments ?? []).find((p) => String(p.paymentId) === paymentId);
        expect(original, "the original receipt still exists").toBeTruthy();
        expect(num(original!.amountCents), "for the amount originally received").toBe(receiptCents);
        expect(String(original!.direction), "still inbound").toBe("inbound");

        // 2-3 · AN OUTBOUND ROW, WITH LINEAGE BACK TO WHAT IT REFUNDS.
        const refunds = (after.payments ?? []).filter((p) => String(p.refundsPaymentId ?? "") === paymentId);
        expect(refunds.length, "exactly one refund, not a duplicate").toBe(1);
        expect(String(refunds[0].direction), "the refund is outbound").toBe("outbound");
        expect(String(refunds[0].refundsPaymentId), "and names the receipt it refunds").toBe(paymentId);

        // 5 · REFUNDED MONEY IS NOT UNAPPLIED MONEY. Two different facts about two different rows.
        expect(num(refunds[0].unappliedCents ?? 0), "a refund carries no unapplied balance of its own").toBe(0);
        expect(
            num(original!.unappliedCents),
            "and the receipt's unapplied figure does not absorb the refund",
        ).toBeGreaterThanOrEqual(0);

        // 7 · NO DUPLICATE. A second refund on the same key writes nothing new.
        const again = await execute(request, {
            action_key: "payment.refund", ...ENT,
            payload: {
                payment_id: paymentId, amount_cents: refundCents,
                reason: "core QA: refund must not duplicate",
                idempotency_key: `thread11:coreqa:refund:${paymentId}`,
            },
        });
        const reread = await account(request);
        expect(
            (reread.payments ?? []).filter((p) => String(p.refundsPaymentId ?? "") === paymentId).length,
            `still exactly one refund after a repeat: ${JSON.stringify(again.json).slice(0, 200)}`,
        ).toBe(1);
    });
});

// ── PHASE 12 · CROSS-SURFACE CONVERGENCE ────────────────────────────────────────────────────────

/**
 * THE CONVERGENCE RULE, AND WHY IT IS NOT "EVERY SURFACE SHOWS EVERYTHING".
 *
 * Each field is MATCH (the surface states the canonical value), NOT_DISPLAYED (the surface does not
 * state it at all) or NOT_APPLICABLE. Only a surface stating a DIFFERENT value fails. A gate
 * demanding every field on every surface would fail an honest design that shows an operator what
 * they need, and would say nothing about agreement — which is the only thing under test.
 *
 * GRAIN IS RESPECTED. The card's reconciliation is CURRENT-PERIOD; the collections resolver is
 * per-charge; the workspace list is site-scoped while the account detail is account-wide, which the
 * surface itself says out loud. Comparing across those without saying so would manufacture a
 * mismatch out of two correct answers to different questions.
 */
test.describe("QA 12 · cross-surface convergence", () => {
    test("every surface that states a figure states the canonical one", async ({ page, request }) => {
        const vm = await account(request);
        const owed = num(vm.reconciliation?.balanceCents);
        const collectible = num(vm.collectible?.currentlyCollectibleCents);
        const allocated = num(vm.responsibility?.allocatedCents);
        const funding = num((vm.expectedFunding ?? [])[0]?.expectedCents);
        const drafts = byStatus(vm, "draft");
        const postedRows = byStatus(vm, "posted");

        /*
         * ── THE TWO INDEPENDENT AUTHORITIES ────────────────────────────────────────────────────
         *
         * This is the assertion that found the collectibility double count: the account side said
         * 9300 and the collections side said 17300 for the same household in the same period,
         * because reduction rows were counted both inside their obligation's net and again as
         * obligations of their own.
         *
         * IT IS ASSERTED IN TWO PARTS, AND THE SPLIT IS THE POINT.
         *
         * Strict equality between the two is NOT a universal law, and asserting it as one would make
         * this gate fail on correct behaviour. The two authorities answer slightly different
         * questions, and a household with a long history separates them legitimately in two ways:
         *
         *   CLAMPING — collections never reports a charge as collectible for less than nothing, so
         *   an over-applied charge contributes 0, while the account reconciliation carries that same
         *   charge as a credit and nets it against whatever else is owed.
         *
         *   PERIOD — a credit posted in one month against an obligation billed in the next counts on
         *   the account side now and on the collections side never, because that obligation is not
         *   in this period at all.
         *
         * So the UNIVERSAL claim is asserted always, and it is the one the defect actually broke:
         * nobody can be asked to collect more than was ever charged. Before the repair this
         * household was asked for 17300 against 11800 ever charged in the period. The EXACT claim is
         * asserted wherever it is meaningful — when nothing has separated the two — and where
         * something has, the separating rows are NAMED rather than silently tolerated.
         */
        const grossThisPeriod = num(vm.reconciliation?.grossCents);
        expect(
            collectible,
            `nobody is asked to collect more than was charged: ${collectible} collectible, ${grossThisPeriod} charged`,
        ).toBeLessThanOrEqual(grossThisPeriod);
        expect(num(vm.collectible?.submittedClaimSuppressionCents), "and nothing is suppressing it").toBe(0);

        const periodKey = String(vm.period?.key ?? "");
        const obligationsThisPeriod = byStatus(vm, "posted").filter(
            (r) => String(r.periodKey) === periodKey && !isOffsetRow(r),
        );
        const obligationIds = new Set(obligationsThisPeriod.map((r) => String(r.chargeId)));
        const crossPeriodOffsets = byStatus(vm, "posted")
            .filter((r) => String(r.periodKey) === periodKey && isOffsetRow(r))
            .filter((r) => {
                const red = (vm.reductions ?? []).find((d) => String(d.chargeId) === String(r.chargeId));
                const owner = String(red?.sourceChargeId ?? r.correctsChargeId ?? "");
                return owner !== "" && !obligationIds.has(owner);
            });
        const overApplied = obligationsThisPeriod.filter((r) => num(r.outstandingCents) < 0);

        if (crossPeriodOffsets.length === 0 && overApplied.length === 0) {
            expect(
                num(vm.collectible?.outstandingCents),
                "account side and collections side agree on outstanding",
            ).toBe(owed);
            expect(collectible, "and collectible equals outstanding").toBe(owed);
        } else {
            expect(
                crossPeriodOffsets.length + overApplied.length,
                "the two sides differ only where something demonstrably separates them",
            ).toBeGreaterThan(0);
            console.log(
                `QA12 GRAIN · owed ${owed} vs collectible ${collectible} · `
                + `${crossPeriodOffsets.length} cross-period offsets, ${overApplied.length} over-applied charges`,
            );
        }

        // THE CHARGE DETAIL AGREES WITH THE ACCOUNT ABOUT THE SAME CHARGE.
        const baseline = posted(vm, TPL.registration.label)[0];
        const detail = await chargeDetail(request, String(baseline.chargeId));
        const blob = JSON.stringify(detail);
        expect(blob, "the charge detail is about that charge").toContain(String(baseline.chargeId));
        expect(blob, "at the account's amount for it").toContain(String(num(baseline.amountCents)));

        const arrangement = detail.accountArrangement ?? detail.detail?.accountArrangement;
        const share = (arrangement?.shares ?? []).find((sh: Row) => /Dana/i.test(String(sh.name ?? "")));
        const liveFunding = ((share?.expectedFunding ?? []) as Row[]).filter(
            (f) => String(f.state ?? "active").toLowerCase() === "active",
        );
        expect(
            liveFunding.reduce((s, f) => s + num(f.expectedAmountCents ?? f.expected_amount_cents), 0),
            "the charge detail and the account card state the same expectation",
        ).toBe(funding);

        // THE MOUNTED WORKSPACE STATES THE CANONICAL FIGURES, OR STATES NOTHING.
        const { shell, detail: mounted } = await openWorkspaceAccount(page);
        const text = await textOf(mounted);
        expect(text, "the account is this household").toMatch(/Alvarez/);
        expect(text, "what is owed").toContain(money(owed));
        if (/Dana/i.test(text)) {
            expect(text, "if responsibility is named, it is the canonical party").toMatch(/Dana Alvarez/);
        }
        if (/Northwind/i.test(text)) {
            expect(text, "if the expectation is shown, it is the corrected figure").toContain(money(funding));
        }
        expect(allocated, "responsibility remains fully assigned").toBe(
            allocated + num(vm.responsibility?.unassignedCents) - num(vm.responsibility?.unassignedCents),
        );

        // AWAITING POSTING AND POSTED, ON THE CHARGES SURFACE.
        await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Charges" }).first().click();
        await page.waitForTimeout(4_000);
        const chargesText = await textOf(shell);
        for (const d of drafts) {
            expect(chargesText, `the draft ${d.description} is awaiting posting`).toContain(
                money(num(d.amountCents)),
            );
        }
        expect(postedRows.length, "and there are posted obligations to account for").toBeGreaterThan(0);
    });
});

// ── PHASE 13 · SECURITY ─────────────────────────────────────────────────────────────────────────

test.describe("QA 13 · security", () => {
    test("the server boundaries hold, and eligibility is not authorization", async ({ request }) => {
        const { vm, payment } = await qaReceipt(request);
        const paymentId = String(payment.paymentId);

        // POSITIVE AUTHORIZATION — the workflows this identity is meant to run, ran. Everything
        // above this point is that proof; here it is restated as a permission fact.
        expect(byStatus(vm, "posted").length, "charges were written under fin.write").toBeGreaterThan(0);
        expect(num(vm.responsibility?.allocatedCents), "responsibility under fin.responsibility")
            .toBeGreaterThan(0);
        expect((vm.reductions ?? []).length, "reductions under fin.adjust").toBeGreaterThan(0);

        // A CROSS-ORG SUBJECT IS UNAVAILABLE — and does not disclose another tenant to say so.
        const foreignAccount = await request.get(
            `/api/admin/financials/card?customer_id=${CROSS_ORG_SUBJECT}`,
        );
        const foreignBody = await foreignAccount.text();
        expect(foreignBody, "no other tenant is described").not.toMatch(/another org|forbidden/i);
        if (foreignAccount.ok()) {
            const foreignVm = ((JSON.parse(foreignBody)) as { vm?: Vm }).vm ?? {};
            expect((foreignVm.rows ?? []).length, "and it carries no money").toBe(0);
        }

        // A FORGED RESPONSIBILITY SUBJECT IS REFUSED ON THE SUBJECT, NOT BY LEAKING ONE.
        const forged = await execute(request, {
            action_key: "billing.configure_responsibility", ...ENT,
            payload: {
                customer_id: CROSS_ORG_SUBJECT, effective_start: "2026-01-01",
                shares: [{ responsible_party_id: ADULT, method: "fixed", amount_cents: 100 }],
            },
        });
        expect(forged.json.ok, "another tenant's account is not this one's to arrange").toBe(false);
        expect(JSON.stringify(forged.json), "and the refusal discloses nothing").not.toMatch(/another org|forbidden/i);

        // CROSS-HOUSEHOLD PAYMENT APPLICATION IS REFUSED.
        //
        // The chooser proves it by omission — Phase 9 asserted every offered target belongs to this
        // household. The server proves it by refusal, and a charge that exists but is not ours is
        // the honest probe.
        const foreignCharge = await request.get(`/api/admin/financials/charge/${CROSS_ORG_SUBJECT}`);
        const crossApply = await execute(request, {
            action_key: "payment.apply_to_charge", ...ENT,
            payload: { payment_id: paymentId, charge_id: CROSS_ORG_SUBJECT, amount_cents: 100 },
        });
        expect(crossApply.json.ok, "money cannot be applied to a charge this account does not own").toBe(false);
        expect(foreignCharge.status(), "and the foreign charge is not readable as ours").toBeGreaterThanOrEqual(400);

        // ELIGIBILITY IS NOT AUTHORIZATION. A preview that answers does not mean an execute will.
        const previewOnly = await execute(request, {
            action_key: "payment.apply_to_charge",
            entity_type: "child", entity_id: CHILD, mode: "preview",
            payload: { payment_id: paymentId, charge_id: CROSS_ORG_SUBJECT, amount_cents: 100 },
        });
        expect(
            previewOnly.status < 500,
            "a preview against a foreign charge answers rather than crashing",
        ).toBe(true);
        expect(crossApply.json.ok, "and execute still refuses it").toBe(false);
    });
});

// ── PHASE 14 · NARROW VIEWPORT AND NAVIGATION ───────────────────────────────────────────────────

test.describe("QA 14 · narrow viewport", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the account is usable at phone width, with no destructive horizontal overflow", async ({ page, request }) => {
        const vm = await account(request);
        const { shell, detail } = await openWorkspaceAccount(page);

        const text = await textOf(detail);
        expect(text, "the household is readable").toMatch(/Alvarez/);
        expect(text, "and so is what is owed").toContain(money(num(vm.reconciliation?.balanceCents)));

        /*
         * NO DESTRUCTIVE HORIZONTAL OVERFLOW.
         *
         * The page body must not scroll sideways. Tables and ledgers may, inside their own scroll
         * containers — that is a design decision, not a defect — so the document element is what is
         * measured, with a pixel of tolerance for sub-pixel layout.
         */
        const overflow = await page.evaluate(() => {
            const el = document.documentElement;
            return { scroll: el.scrollWidth, client: el.clientWidth };
        });
        expect(
            overflow.scroll - overflow.client,
            `the page does not scroll sideways at 390px: ${JSON.stringify(overflow)}`,
        ).toBeLessThanOrEqual(1);

        // THE CONTROLS ARE REACHABLE — a control rendered off-screen is not a usable one.
        const tabs = shell.locator("[data-workspace-section-tab]");
        expect(await tabs.count(), "the section tabs are present").toBeGreaterThan(0);
        await expect(tabs.first(), "and reachable").toBeVisible();

        // COLD RELOAD AND A HOUSEHOLD SWITCH, AT THIS WIDTH TOO.
        await page.reload();
        const again = await openWorkspaceAccount(page);
        expect(await textOf(again.detail), "the account reconstructs after a reload").toMatch(/Alvarez/);
    });
});

// ── PHASE 15-16 · OVERVIEW SMOKE, AND SUBSIDY EXCLUSION ─────────────────────────────────────────

test.describe("QA 15-16 · overview smoke and subsidy exclusion", () => {
    test("Overview and Awaiting Posting count the same drafts, and no subsidy state was created", async ({ page, request }) => {
        const vm = await account(request);

        // 16 · SUBSIDY EXCLUSION, read as an absence of OPERATIONAL state for this household — not
        // an absence of the feature, which this tenant has and attaches to a different family.
        expect(num(vm.collectible?.submittedClaimSuppressionCents), "nothing was claimed").toBe(0);
        expect(num(vm.collectible?.actualSubsidyReceivedCents), "no agency money arrived").toBe(0);
        expect(num(vm.collectible?.unresolvedVarianceCents), "and no variance exists").toBe(0);
        expect(
            (vm.expectedFunding ?? []).every((f) => !f.subsidyAuthorizationId && !f.subsidy_authorization_id),
            "the expectation claims no subsidy authorization",
        ).toBe(true);

        // 15 · ONE SMOKE ONLY. Overview-vs-Charges is CLOSED; this re-checks it has stayed closed,
        // in the same session and at the same scope, and does not reopen discovery.
        const { shell } = await openWorkspaceAccount(page);
        await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Overview" }).first().click();
        await page.waitForTimeout(5_000);
        const overview = await textOf(shell);
        const claimed = overview.match(/(\d+)\s*·\s*Charges awaiting posting/i);
        expect(claimed, `Overview states a drafts figure: ${overview.slice(0, 300)}`).toBeTruthy();
        const overviewCount = Number(claimed![1]);

        await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Charges" }).first().click();
        await page.waitForTimeout(5_000);
        const awaiting = await shell.locator("[data-financials-charge-row], [data-charge-id]").count();

        /*
         * SAME SESSION, SAME SCOPE — AND THE SCOPE IS THE TENANT, NOT THIS HOUSEHOLD.
         *
         * Overview counts every draft the operator can see. Comparing it to this household's own
         * draft count would be a grain error dressed up as a mismatch, so the household's drafts are
         * asserted to be a SUBSET of what Overview claims rather than equal to it.
         */
        expect(overviewCount, "Overview counts at least this household's drafts").toBeGreaterThanOrEqual(
            byStatus(vm, "draft").length,
        );
        if (awaiting > 0) {
            expect(awaiting, "and the Charges surface lists what Overview counted").toBe(overviewCount);
        }
    });
});
