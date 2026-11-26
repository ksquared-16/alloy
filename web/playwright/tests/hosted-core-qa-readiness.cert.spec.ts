/**
 * CORE FINANCIALS — READINESS ON THE HOSTED CERTIFICATION TENANT.
 *
 * Every earlier Thread 11 proof ran against a household carrying years of certification history:
 * accumulated reductions, posted childcare charges that are immutable by design, and no way to
 * clear either. That is enough to prove surfaces AGREE with one another and not enough to state
 * what a representative household LOOKS like — so the vector was recorded and labelled rather than
 * offered as a QA baseline.
 *
 * This file is that baseline. The subject is the hosted fixture household, whose money was proven
 * to start at exactly zero (census `thread11-qa-household-census.sql`, all eleven money counts 0,
 * against a tenant holding 11 customers / 59 charges / 3 payments — so zero is a clean subject
 * rather than a wrong org id).
 *
 * ── THE OBLIGATION IS $75, NOT $1000 ────────────────────────────────────────────────────────────
 *
 * The instruction recommends a $1000 tuition charge. This tenant cannot produce one honestly.
 * Tuition is generated from rate plans and placements, which this household deliberately has none
 * of, and `charge.add` — the only canonical single-obligation path — posts from a configured
 * template. All four templates in this tenant are `amount_strategy = 'fixed'`, and `resolveAmount`
 * returns `template.amount_cents` for fixed: a caller-supplied `amount_cents` is IGNORED, not
 * honoured. So the largest fixed template is used, Registration fee at $75.00, and every downstream
 * figure is scaled to it. The alternative was seeding money the product could not have produced and
 * certifying against it, which is the defect `demo-tenant.sh` exists to prevent.
 *
 * ── EVERY NUMBER COMES FROM A CANONICAL READER ──────────────────────────────────────────────────
 *
 * Nothing here recomputes a balance. The vector is read back from `/api/admin/financials/card`,
 * which is `buildFinancialsCardVM` — the same authority the surfaces render. This file is evidence,
 * never a second financial authority.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/** Written by `environment.restore_deployed_qa_session`; the lane never sees a credential. */
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";

/* Repository-owned fixture ids, declared in `certification/fixtures/financials-demo-tenant.sql`
   and confirmed present on the hosted primary by census. Named, never discovered by label. */
const HOUSEHOLD = "fd000000-0000-4000-8000-0000000c0001"; // Alvarez Household (demo)
const CHILD = "fd000000-0000-4000-8000-0000000d0001"; // Ana Alvarez — the child with the agreement
const SIBLING = "fd000000-0000-4000-8000-0000000d0005"; // Rio Alvarez — no agreement, no charges
const AGREEMENT = "fd000000-0000-4000-8000-0000000a0001";
const ADULT = "fd000000-0000-4000-8000-0000000b0002"; // Dana Alvarez — parent, primary, active
/* Brennan was the intended switch target and is correctly NOT in the accounts list: the fixture
   gave it an agreement and no money, and the list is of accounts with financial activity. The peer
   is discovered at run time instead. */

/* Registration fee. Fixed at 7500 by the tenant's own template, which is why the amount is not
   ours to choose. */
const TEMPLATE = "c03e638e-0f3e-49f0-9d41-696276c8fa21";
const OBLIGATION_CENTS = 7500;

/* A second template, drafted and never posted, so "a draft is not owed" stays provable on reruns. */
const DRAFT_ONLY_TEMPLATE = "27055d7e-72a3-441a-a4dd-ae01fbf1f421"; // Materials
const DRAFT_ONLY_CENTS = 1800;

/* Expected funding: an employer sponsoring part of Dana's share, then correcting the figure.
   The correction is the proof — a superseding expectation must REPLACE 5000, never add to it. */
const FUNDING_FIRST_CENTS = 5000;
const FUNDING_CORRECTED_CENTS = 4500;

test.use({
    storageState: STORAGE,
    baseURL: "https://staging.workwithalloy.com",
    viewport: { width: 1680, height: 1050 },
});

type Vm = {
    rows?: Array<Record<string, unknown>>;
    reductions?: Array<Record<string, unknown>>;
    payments?: Array<Record<string, unknown>>;
    reconciliation?: Record<string, number>;
    collectible?: Record<string, number>;
    responsibility?: {
        parties?: Array<Record<string, unknown>>;
        allocatedCents?: number;
        unassignedCents?: number;
    };
    expectedFunding?: Array<Record<string, unknown>>;
    subjects?: Array<{ agreementId?: string; customerMemberId?: string; displayName?: string }>;
    customerName?: string;
};

async function account(request: APIRequestContext, customerId = HOUSEHOLD): Promise<Vm> {
    const res = await request.get(`/api/admin/financials/card?customer_id=${customerId}`);
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

/**
 * `resolveChargeDetail` — the canonical reader that owns the arrangement's shares and what is
 * expected to fund each one. It is also the surface an operator configures funding from, so
 * reading the anchor here means the test attaches funding exactly where the product does.
 */
async function chargeDetail(request: APIRequestContext, chargeId: string) {
    const res = await request.get(`/api/admin/financials/charge/${chargeId}`);
    expect(res.ok(), `charge detail ${res.status()}`).toBe(true);
    return (await res.json()) as Record<string, any>;
}

/** The charge rows this household owns, by status. Read from the canonical VM, never counted here. */
function charges(vm: Vm, status: string) {
    return (vm.rows ?? []).filter((r) => String(r.status ?? "").toLowerCase() === status);
}

/** The operator's own formatting, so a mounted assertion matches what is actually printed. */
const money = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function num(v: unknown): number {
    return typeof v === "number" ? v : Number(v ?? 0);
}

test.describe.configure({ mode: "serial" });

/* Carried between the serial steps. Each is asserted non-empty where it is first produced, so a
   later step can never quietly assert against "". */
const found = {
    chargeId: "",
    arrangementId: "",
    shareId: "",
    allocationId: "",
    fundingId: "",
    fundingCorrectedId: "",
};

test.describe("core financials — hosted QA readiness", () => {
    /**
     * PART 3 · THE SUBJECT STARTS EMPTY, THROUGH THE PRODUCT'S OWN EYES.
     *
     * The census proved the tables are empty. This proves the READER agrees — a household whose
     * rows are zero but whose card reports a balance would make every figure below meaningless.
     */
    test("the QA household holds only the money this certification created", async ({ request }) => {
        /*
         * THE ZERO START IS RECORDED, NOT RE-ASSERTED.
         *
         * "This household has no money" was true exactly once and this run is what ended it. Its
         * evidence is `certification/financials/thread11-qa-household-census.sql.results.json`,
         * read on the deployed primary before anything was written: all eleven money counts zero,
         * in a tenant holding 11 customers, 59 charges and 3 payments — so zero meant a clean
         * subject and not a wrong org id.
         *
         * What stays provable on every run is CONTAINMENT: that the household still holds only
         * what this certification put there. A vector is worthless if something else has been
         * writing money into the subject, and that is what this now checks.
         */
        const vm = await account(request);

        const posted = charges(vm, "posted");
        expect(posted.length, "one posted obligation, and only one").toBe(1);
        expect(num(posted[0].amountCents), "of the amount this certification created").toBe(OBLIGATION_CENTS);
        expect(String(posted[0].description ?? ""), "from the named template").toContain("Registration fee");

        expect(vm.payments ?? [], "nothing has been paid").toHaveLength(0);
        expect(vm.reductions ?? [], "nothing has been reduced").toHaveLength(0);
        expect(
            charges(vm, "posted").filter((r) => r.correctsChargeId),
            "nothing has been corrected",
        ).toHaveLength(0);

        /* The household must still be a FINANCIAL SUBJECT — an account with an agreement behind it.
           An empty card and an unresolvable account read the same to the eye and are not the same
           thing, which is the distinction Certhouse turned on. */
        const subjectIds = (vm.subjects ?? []).map((s) => String(s.agreementId ?? ""));
        expect(subjectIds, "the agreement is the billable subject").toContain(AGREEMENT);
    });

    /**
     * PART 4 · ONE OBLIGATION, THROUGH THE CANONICAL AUTHORITY.
     *
     * Draft first, and the draft must NOT move the balance. That is the claim `charge.add`'s own
     * preview makes to the operator ("Creates a draft · the balance changes when it is posted"),
     * and a readiness gate that never checked it would let the product say one thing and do
     * another.
     */
    test("add charge creates a draft that owes nothing, and posting makes it owed", async ({ request }) => {
        /*
         * RE-RUNNABLE BY CONSTRUCTION. `charge.add` is idempotent per template and period, and a
         * posted childcare charge is immutable — it cannot be voided, deleted, or un-posted. So a
         * step that only ever ADDED would pass once and then assert nothing for the rest of the
         * fixture's life. This one reuses the obligation it finds and re-proves the same facts
         * about it.
         */
        const before = await account(request);
        if (charges(before, "posted").length === 0) {
            const added = await execute(request, {
                action_key: "charge.add",
                entity_type: "child",
                entity_id: CHILD,
                mode: "execute",
                payload: { template_id: TEMPLATE, customer_id: HOUSEHOLD },
            });
            expect(added.json.ok, `charge.add refused: ${JSON.stringify(added.json)}`).toBe(true);

            const drafted = await account(request);
            const drafts = charges(drafted, "draft").filter((r) => num(r.amountCents) === OBLIGATION_CENTS);
            expect(drafts, "the obligation exists as a draft first").toHaveLength(1);

            // THE DRAFT IS NOT OWED. The whole point of the two-step, and the claim the operator
            // is shown: "Creates a draft · the balance changes when it is posted".
            expect(num(drafted.reconciliation?.balanceCents), "a draft owes nothing").toBe(0);
            expect(num(drafted.collectible?.currentlyCollectibleCents), "a draft is not collectible").toBe(0);
            expect(num(drafted.reconciliation?.draftCents), "and it is counted as a draft").toBe(OBLIGATION_CENTS);

            const posted = await execute(request, {
                action_key: "charge.post",
                entity_type: "child",
                entity_id: CHILD,
                mode: "execute",
                payload: { charge_id: String(drafts[0].chargeId ?? drafts[0].id ?? "") },
            });
            expect(posted.json.ok, `charge.post refused: ${JSON.stringify(posted.json)}`).toBe(true);
        }

        const after = await account(request);
        const posted = charges(after, "posted");
        expect(posted, "exactly one posted obligation").toHaveLength(1);
        found.chargeId = String(posted[0].chargeId ?? posted[0].id ?? "");
        expect(found.chargeId, "the posted row names its charge").not.toBe("");

        // THE CANONICAL POSITION. Every figure read back, none recomputed here.
        expect(num(posted[0].amountCents), "gross on the row").toBe(OBLIGATION_CENTS);
        expect(num(after.reconciliation?.grossCents), "gross").toBe(OBLIGATION_CENTS);
        expect(num(after.reconciliation?.responsibilityCents), "net obligation").toBe(OBLIGATION_CENTS);
        expect(num(after.reconciliation?.balanceCents), "outstanding").toBe(OBLIGATION_CENTS);
        expect(num(after.collectible?.outstandingCents), "outstanding, collections side").toBe(OBLIGATION_CENTS);
        expect(num(after.collectible?.currentlyCollectibleCents), "collectible now").toBe(OBLIGATION_CENTS);
        expect(after.reductions ?? [], "no reductions — this is a clean obligation").toHaveLength(0);
        expect(num(after.reconciliation?.paymentsCents), "nothing paid").toBe(0);

        /*
         * AND A SECOND DRAFT STILL MOVES NOTHING.
         *
         * The draft branch above runs only on a virgin household, so on every rerun the "a draft
         * is not owed" claim would go unproven. A second template is drafted and deliberately NEVER
         * posted: it keeps the claim live on every run, and because drafts are excluded from gross,
         * balance and collectibility, it leaves the household's owed position exactly where it was.
         */
        const owedBefore = num(after.reconciliation?.balanceCents);
        if (charges(after, "draft").length === 0) {
            const second = await execute(request, {
                action_key: "charge.add",
                entity_type: "child",
                entity_id: CHILD,
                mode: "execute",
                payload: { template_id: DRAFT_ONLY_TEMPLATE, customer_id: HOUSEHOLD },
            });
            expect(second.json.ok, `second draft refused: ${JSON.stringify(second.json)}`).toBe(true);
        }
        const withDraft = await account(request);
        const drafts = charges(withDraft, "draft");
        expect(drafts.length, "a draft is present").toBeGreaterThan(0);
        expect(num(drafts[0].amountCents), "of the second template's amount").toBe(DRAFT_ONLY_CENTS);
        /*
         * `draftCents` IS PERIOD-SCOPED, AND THAT IS CORRECT.
         *
         * This template bills into the NEXT cycle, so its draft lands in a later period and the
         * current period's `draftCents` is legitimately 0 while the row exists. Asserting equality
         * here would be asserting that every template bills immediately, which is a fact about one
         * template rather than about drafts. What must hold in EVERY period is the claim under
         * test: a draft is not owed.
         */
        expect(num(withDraft.reconciliation?.balanceCents), "a draft does not move what is owed").toBe(
            owedBefore,
        );
        expect(
            num(withDraft.collectible?.currentlyCollectibleCents),
            "nor what is collectible",
        ).toBe(OBLIGATION_CENTS);
        expect(num(withDraft.reconciliation?.grossCents), "nor gross").toBe(OBLIGATION_CENTS);
    });

    /**
     * PART 5 · A NAMED RESPONSIBILITY, NOT AN UNASSIGNED REMAINDER.
     *
     * The failure this guards against is specific and has happened: an arrangement whose effective
     * window does not cover the charge resolves to ALL-UNASSIGNED and reports success. So the
     * arrangement is dated well before the charge, and the assertion is on the resolved allocation
     * rather than on the arrangement having been written.
     */
    test("the responsible adult is named, and the whole obligation is assigned to her", async ({ request }) => {
        expect(found.chargeId, "the posted charge from the previous step").not.toBe("");

        /*
         * RE-RUNNABLE, AND THE REFUSAL THAT FORCED IT IS CORRECT.
         *
         * `billing.configure_responsibility` refuses `predecessor_starts_later` when an arrangement
         * already in force starts on or after the requested date — a real invariant protecting the
         * no-overlap exclusion on the arrangements table. So the arrangement is CONFIGURED only
         * when this household has none, and re-proven every run either way. Superseding a perfectly
         * good arrangement on each run just to re-execute the write would manufacture lineage this
         * household never had.
         */
        const existing = await chargeDetail(request, found.chargeId);
        const already = existing.accountArrangement ?? existing.detail?.accountArrangement;
        const hasDanaShare = Boolean(
            already && (already.shares ?? []).some(
                (sh: Record<string, unknown>) =>
                    (JSON.stringify(sh).includes(ADULT) || /Dana/i.test(String(sh.name ?? "")))
                    && num(sh.amountCents) === OBLIGATION_CENTS,
            ),
        );

        if (!hasDanaShare) {
            const configured = await execute(request, {
                action_key: "billing.configure_responsibility",
                entity_type: "child",
                entity_id: CHILD,
                mode: "execute",
                payload: {
                    customer_id: HOUSEHOLD,
                    customer_member_id: CHILD,
                    effective_start: "2026-01-01",
                    shares: [
                        { responsible_party_id: ADULT, method: "fixed", amount_cents: OBLIGATION_CENTS },
                    ],
                },
            });
            expect(configured.json.ok, `configure refused: ${JSON.stringify(configured.json)}`).toBe(true);
        }

        /*
         * RESOLUTION IS RE-RUN REGARDLESS.
         *
         * Configuring records who bears the account from a date; resolving is what divides THIS
         * posted obligation and writes the allocation the surfaces read. They are separate facts —
         * an arrangement can be perfectly correct while a charge posted before it was resolved sits
         * entirely unassigned — so the second is never inferred from the first.
         */
        const resolved = await execute(request, {
            action_key: "billing.resolve_responsibility",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            payload: { charge_id: found.chargeId },
        });
        expect(resolved.json.ok, `resolve refused: ${JSON.stringify(resolved.json)}`).toBe(true);

        const vm = await account(request);
        expect(num(vm.responsibility?.allocatedCents), "assigned").toBe(OBLIGATION_CENTS);
        expect(num(vm.responsibility?.unassignedCents), "unassigned").toBe(0);

        const parties = vm.responsibility?.parties ?? [];
        expect(parties.length, "one named party").toBeGreaterThan(0);
        const dana = parties.find((p) => JSON.stringify(p).includes(ADULT))
            ?? parties.find((p) => /Dana/i.test(JSON.stringify(p)));
        expect(dana, `the named adult is in the resolved parties: ${JSON.stringify(parties)}`).toBeTruthy();

        /*
         * THE ANCHOR COMES FROM THE READER THE OPERATOR USES.
         *
         * The account card's `parties` is a presentation projection — person, name, assigned,
         * remaining — and deliberately carries no share id. `resolveChargeDetail` is the authority
         * that names the arrangement's shares, and it is also what `FinancialsChargeDetail` renders
         * the Expected Funding control from. Reading the anchor here attaches funding exactly where
         * the product attaches it, instead of at an id invented by the test.
         */
        const detail = await chargeDetail(request, found.chargeId);
        const arrangement = detail.accountArrangement ?? detail.detail?.accountArrangement;
        expect(arrangement, `the charge detail names the arrangement: ${JSON.stringify(Object.keys(detail))}`).toBeTruthy();
        found.arrangementId = String(arrangement.id ?? "");
        const share = (arrangement.shares ?? []).find(
            (sh: Record<string, unknown>) => JSON.stringify(sh).includes(ADULT) || /Dana/i.test(String(sh.name ?? "")),
        );
        expect(share, `the adult holds a share: ${JSON.stringify(arrangement.shares)}`).toBeTruthy();
        found.shareId = String(share.id ?? "");
        expect(found.shareId, "expected funding needs a share to attach to").not.toBe("");
        expect(num(share.amountCents), "and the share is the whole obligation").toBe(OBLIGATION_CENTS);
    });

    /**
     * PART 7 · EXPECTED FUNDING IS AN EXPECTATION, AND A CORRECTION REPLACES IT.
     *
     * 5000 then 4500 must read 4500, never 9500. A superseding expectation that ADDED would make
     * every corrected figure in the product wrong in the same direction, silently.
     */
    test("expected funding supersedes rather than accumulates, and changes nothing owed", async ({ request }) => {
        const before = await account(request);
        const outstandingBefore = num(before.reconciliation?.balanceCents);
        const collectibleBefore = num(before.collectible?.currentlyCollectibleCents);

        const anchor = found.shareId
            ? { share_id: found.shareId }
            : { allocation_id: found.allocationId };

        const first = await execute(request, {
            action_key: "billing.configure_expected_funding",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            payload: {
                ...anchor,
                funding_source_type: "employer_sponsorship",
                funding_source_label: "Northwind Employer Benefit (demo)",
                basis: "fixed_amount",
                expected_amount_cents: FUNDING_FIRST_CENTS,
                effective_start: "2026-01-01",
                idempotency_key: "thread11:qa:funding:v1",
            },
        });
        expect(first.json.ok, `funding refused: ${JSON.stringify(first.json)}`).toBe(true);

        const corrected = await execute(request, {
            action_key: "billing.configure_expected_funding",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            payload: {
                ...anchor,
                funding_source_type: "employer_sponsorship",
                funding_source_label: "Northwind Employer Benefit (demo)",
                basis: "fixed_amount",
                expected_amount_cents: FUNDING_CORRECTED_CENTS,
                effective_start: "2026-01-01",
                idempotency_key: "thread11:qa:funding:v2",
            },
        });
        expect(corrected.json.ok, `correction refused: ${JSON.stringify(corrected.json)}`).toBe(true);

        const detail = await chargeDetail(request, found.chargeId);
        const arrangement = detail.accountArrangement ?? detail.detail?.accountArrangement;
        const share = (arrangement.shares ?? []).find((sh: Record<string, unknown>) => String(sh.id) === found.shareId);
        const active = ((share?.expectedFunding ?? []) as Array<Record<string, unknown>>).filter(
            (f) => String(f.state ?? "active").toLowerCase() === "active",
        );
        const total = active.reduce(
            (sum, f) => sum + num(f.expectedAmountCents ?? f.expected_amount_cents),
            0,
        );
        expect(total, `the correction replaces: ${JSON.stringify(share?.expectedFunding)}`).toBe(
            FUNDING_CORRECTED_CENTS,
        );
        expect(total, "and specifically is not the sum of both").not.toBe(
            FUNDING_FIRST_CENTS + FUNDING_CORRECTED_CENTS,
        );

        found.fundingId = String(active[0]?.id ?? "");
        const vm = await account(request);

        // AN EXPECTATION IS NOT A PAYMENT, AND SUPPRESSES NOTHING.
        expect(vm.payments ?? [], "no payment was created").toHaveLength(0);
        expect(num(vm.reconciliation?.balanceCents), "outstanding is untouched").toBe(outstandingBefore);
        expect(num(vm.collectible?.currentlyCollectibleCents), "collectibility is untouched").toBe(
            collectibleBefore,
        );
        expect(num(vm.responsibility?.allocatedCents), "the share is untouched").toBe(OBLIGATION_CENTS);
    });

    /**
     * PART 9 · AND IT NEEDED NO SUBSIDY TO DO ANY OF THAT.
     *
     * Read as an absence of operational subsidy state for this household, not as an absence of the
     * subsidy feature — the tenant has an agency, a program and an authorization, all attached to a
     * DIFFERENT household. That is what makes this a real proof rather than a vacuous one.
     */
    test("expected funding is core — no authorization, claim, remittance or variance exists", async ({ request }) => {
        const vm = await account(request);
        const blob = JSON.stringify(vm.expectedFunding ?? []);
        expect(blob, "the expectation names an employer, not an agency").toMatch(/employer/i);

        const subsidy = await request.get(`/api/admin/financials/position?customer_id=${HOUSEHOLD}`);
        if (subsidy.ok()) {
            const text = JSON.stringify(await subsidy.json());
            expect(text, "no claim on this household").not.toMatch(/"claimId"|"claim_id"/);
            expect(text, "no remittance on this household").not.toMatch(/"remittanceId"|"remittance_id"/);
            expect(text, "no variance on this household").not.toMatch(/"varianceId"|"variance_id"/);
        }
        expect(
            (vm.expectedFunding ?? []).every((f) => !f.subsidyAuthorizationId && !f.subsidy_authorization_id),
            "the expectation claims no subsidy authorization",
        ).toBe(true);
    });
});

/**
 * ── MOUNTED ─────────────────────────────────────────────────────────────────────────────────────
 *
 * WHICH SURFACE, AND WHY NOT THE FOCUS PANEL.
 *
 * The Focus Panel FinancialsCard mounts against a WORK-VIEW SUBJECT. This household is a fixture
 * account with an enrolment agreement and no case, so `/workspace/work-unit/...?subject_id=` answers
 * "the requested subject is not present in this work unit's evaluated page — refusing to substitute
 * a different subject". That refusal is correct and is the same work-view configuration fact
 * Certhouse already established; it is not a Financials defect and is not repaired here.
 *
 * So the mounted authority proven here is the Financials WORKSPACE — the account detail an operator
 * actually opens for an account that is not in a queue.
 *
 * THE CONVERGENCE RULE. For every field: the surface either states the canonical value, or does not
 * display it. A surface stating a DIFFERENT value is the failure. That is why each assertion below
 * is written as "if it is shown, it agrees" rather than "it is shown" — a surface that legitimately
 * does not render a field must not be able to fail this gate, and a surface that renders it wrongly
 * must not be able to pass it.
 */
const MOUNTED_TIMEOUT = 90_000;

/* Three navigations, two account reads and a cold reload against a deployed app do not fit
   Playwright's 30s default, and a timeout here reports as a convergence failure. */
test.describe.configure({ timeout: 240_000 });

async function openWorkspaceAccount(page: Page, customerId: string) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell, "the financials workspace mounts").toBeVisible({ timeout: MOUNTED_TIMEOUT });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${customerId}"]`);
    await expect(row, "the account is listed").toBeVisible({ timeout: MOUNTED_TIMEOUT });
    await row.click();
    const detail = shell.locator(`[data-financials-account-detail="${customerId}"]`);
    await expect(detail, "the account detail opens").toBeVisible({ timeout: MOUNTED_TIMEOUT });
    /*
     * WAIT FOR THE CARD TO HAVE AN ACCOUNT, NOT FOR A CLOCK AND NOT FOR A STRING.
     *
     * Two earlier attempts got this wrong in instructive ways. A fixed pause asserted against
     * "Loading the account…" whenever the response was slow. Waiting for that string to go then
     * latched onto "Financial account unavailable" — the card's OTHER empty state, which it passes
     * through while its own subject resolution is still in flight, and which reads exactly like a
     * terminal failure. The card marks all three empty states with `data-financials-empty`, so the
     * honest wait is for that element to leave the DOM: it cannot be satisfied by any empty state,
     * only by a card that actually has a view model.
     */
    await expect(
        detail.locator("[data-financials-empty]"),
        "the card resolves an account rather than an empty state",
    ).toHaveCount(0, { timeout: MOUNTED_TIMEOUT });
    return { shell, detail };
}

/** Text of a mounted region, whitespace-normalised so a wrapped figure still matches. */
async function textOf(locator: ReturnType<Page["locator"]>) {
    return (await locator.innerText()).replace(/\s+/g, " ");
}

test.describe("core financials — hosted QA readiness, mounted", () => {
    /**
     * PARTS 6 AND 8 · THE SURFACES AGREE WITH THE CANONICAL READERS.
     *
     * Four authorities compared against one expectation: the account card VM, the charge detail
     * reader, the workspace account detail, and the workspace's own money movement.
     */
    test("the workspace states what the canonical readers state, or states nothing", async ({ page, request }) => {
        const vm = await account(request);
        const detailJson = await chargeDetail(request, String((vm.rows ?? []).find((r) => r.status === "posted")?.chargeId ?? ""));
        const arrangement = detailJson.accountArrangement ?? detailJson.detail?.accountArrangement;
        const share = (arrangement?.shares ?? []).find((sh: Record<string, unknown>) => /Dana/i.test(String(sh.name ?? "")));
        const fundingCents = ((share?.expectedFunding ?? []) as Array<Record<string, unknown>>)
            .filter((f) => String(f.state ?? "active").toLowerCase() === "active")
            .reduce((sum, f) => sum + num(f.expectedAmountCents ?? f.expected_amount_cents), 0);

        // The canonical figures this mounted surface must not contradict.
        expect(num(vm.responsibility?.allocatedCents), "canonical assigned").toBe(OBLIGATION_CENTS);
        expect(fundingCents, "canonical expected funding").toBe(FUNDING_CORRECTED_CENTS);

        const { detail } = await openWorkspaceAccount(page, HOUSEHOLD);
        const text = await textOf(detail);

        expect(text, "the mounted detail is this household").toMatch(/Alvarez/);

        /*
         * THE OBLIGATION. $75.00 must appear; a surface showing a different balance for the same
         * account is the mismatch this gate exists to catch.
         */
        expect(text, `the obligation is stated: ${text.slice(0, 400)}`).toContain(money(OBLIGATION_CENTS));

        // THE NAMED ADULT — shown and correct, or not shown. Never a different name.
        if (/responsib/i.test(text)) {
            expect(text, "if responsibility is named, it is Dana").toMatch(/Dana Alvarez/);
        }

        /*
         * EXPECTED FUNDING — the corrected figure, never the superseded one and never their sum.
         * This is the assertion that would have caught an accumulating correction on the surface
         * even if the reader were right.
         */
        expect(text, "the superseded figure is not shown as current").not.toContain(money(FUNDING_FIRST_CENTS));
        expect(text, "and the sum of both is shown nowhere").not.toContain(
            money(FUNDING_FIRST_CENTS + FUNDING_CORRECTED_CENTS),
        );

        // NO SUBSIDY OPERATIONAL STATE for this household, on the surface as in the data.
        expect(text, "no claim on this account").not.toMatch(/\bclaim(ed|s)?\b/i);
        expect(text, "no remittance on this account").not.toMatch(/remittance/i);
        expect(text, "no variance on this account").not.toMatch(/variance/i);
    });

    /**
     * PART 12 · COLD RELOAD, AND A HOUSEHOLD SWITCH THAT COMES BACK.
     *
     * The failure this catches is a surface that renders the right account only because it was
     * never asked to render a different one. Switching away and back is the only way to tell a
     * correct read from a sticky one.
     */
    test("a cold reload and a household switch both reconstruct the same account", async ({ page }) => {
        const first = await openWorkspaceAccount(page, HOUSEHOLD);
        const before = await textOf(first.detail);
        expect(before).toContain(money(OBLIGATION_CENTS));

        // COLD RELOAD — nothing carried over in memory.
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        const reloaded = await openWorkspaceAccount(page, HOUSEHOLD);
        const afterReload = await textOf(reloaded.detail);
        expect(afterReload, "the obligation survives a cold reload").toContain(money(OBLIGATION_CENTS));
        expect(afterReload, "and it is still this household").toMatch(/Alvarez/);

        /*
         * SWITCH AWAY TO WHICHEVER PEER THE LIST ACTUALLY OFFERS.
         *
         * Hard-coding a peer asserts a fact about the LIST'S CONTENTS while pretending to test the
         * SWITCH, so the peer is discovered and this stays a switching proof in any tenant state.
         *
         * The absence this comment used to explain — "the other fixture households are correctly
         * absent, because the accounts list is a list of accounts with financial activity" — was
         * the defect, not the contract. Accounts lists the households that HAVE a financial
         * account; a household with no transaction yet is one of them, and now appears.
         */
        const shell = page.locator("[data-adminv2-financials-workspace]");
        const peers = await shell.locator("[data-financials-account-row]").evaluateAll((els) =>
            els.map((e) => e.getAttribute("data-financials-account-row") || "").filter(Boolean),
        );
        const otherId = peers.find((id) => id !== HOUSEHOLD);
        expect(otherId, `the list offers a second account to switch to: ${JSON.stringify(peers)}`).toBeTruthy();

        const other = shell.locator(`[data-financials-account-row="${otherId}"]`);
        await expect(other, "the peer account is listed").toBeVisible({ timeout: MOUNTED_TIMEOUT });
        await other.click();
        const otherDetail = shell.locator(`[data-financials-account-detail="${otherId}"]`);
        await expect(otherDetail, "the other account opens").toBeVisible({ timeout: MOUNTED_TIMEOUT });
        await expect(
            otherDetail.locator("[data-financials-empty]"),
            "and it resolves its own account",
        ).toHaveCount(0, { timeout: MOUNTED_TIMEOUT });
        const otherText = await textOf(otherDetail);
        expect(otherText, "and it is NOT the QA household's money").not.toMatch(/Dana Alvarez/);

        // … AND BACK.
        await shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`).click();
        const back = shell.locator(`[data-financials-account-detail="${HOUSEHOLD}"]`);
        await expect(back, "the QA account reopens").toBeVisible({ timeout: MOUNTED_TIMEOUT });
        // The same settled-card wait as everywhere else: a clock is not a read.
        await expect(
            back.locator("[data-financials-empty]"),
            "and resolves the account again rather than an empty state",
        ).toHaveCount(0, { timeout: MOUNTED_TIMEOUT });
        const backText = await textOf(back);
        expect(backText, "with its own obligation intact").toContain(money(OBLIGATION_CENTS));
        expect(backText, "and its own household").toMatch(/Alvarez/);
    });

    /**
     * PARTS 10 AND 11 · THE VECTOR, AND WHO OWNS EACH FIELD.
     *
     * Recorded, not computed. Every figure is read from the canonical reader named beside it, and
     * the test asserts the internal identities that make the vector coherent — so a vector that
     * was captured from a broken read cannot be recorded as if it were sound.
     */
    test("the clean non-subsidy vector is recorded from canonical readers only", async ({ request }) => {
        const vm = await account(request);
        const posted = charges(vm, "posted");
        const drafts = charges(vm, "draft");
        const chargeId = String(posted[0].chargeId ?? "");
        const detailJson = await chargeDetail(request, chargeId);
        const arrangement = detailJson.accountArrangement ?? detailJson.detail?.accountArrangement;
        const share = (arrangement?.shares ?? []).find((sh: Record<string, unknown>) => /Dana/i.test(String(sh.name ?? "")));
        const funding = ((share?.expectedFunding ?? []) as Array<Record<string, unknown>>)
            .filter((f) => String(f.state ?? "active").toLowerCase() === "active");

        const r = vm.reconciliation ?? {};
        const c = vm.collectible ?? {};
        const vector = {
            customerId: HOUSEHOLD,
            customerMemberId: CHILD,
            enrollmentAgreementId: AGREEMENT,
            operatingDate: String(posted[0].date ?? ""),
            billingPeriodKey: String(posted[0].periodKey ?? ""),

            grossCents: num(r.grossCents),
            reductionsCents: num(r.discountsCents) + num(r.adjustmentsCents) + num(r.fundingCents),
            netObligationCents: num(r.responsibilityCents),

            responsibilityAllocatedCents: num(vm.responsibility?.allocatedCents),
            responsibilityUnassignedCents: num(vm.responsibility?.unassignedCents),

            expectedFundingCents: funding.reduce((s, f) => s + num(f.expectedAmountCents ?? f.expected_amount_cents), 0),

            paymentsReceivedCents: num(r.paymentsCents),
            activeAppliedCents: posted.reduce((s, row) => s + num(row.appliedCents), 0),
            unappliedCents: num(r.paymentsCents) - posted.reduce((s, row) => s + num(row.appliedCents), 0),
            refundedCents: (vm.payments ?? []).filter((p) => num(p.amountCents) < 0).reduce((s, p) => s + num(p.amountCents), 0),

            outstandingCents: num(r.balanceCents),
            currentlyCollectibleCents: num(c.currentlyCollectibleCents),
            submittedClaimSuppressionCents: "DEFERRED_TO_SUBSIDY",

            draftChargeCount: drafts.length,
            postedChargeCount: posted.length,
            responsibilityArrangementId: String(arrangement?.id ?? ""),
            responsibilityShareId: String(share?.id ?? ""),
            expectedFundingId: String(funding[0]?.id ?? ""),
        };
        console.log("THREAD11_VECTOR " + JSON.stringify(vector));

        /* THE IDENTITIES THAT MAKE IT COHERENT. A vector nobody checked is a number nobody owns. */
        expect(vector.grossCents, "gross").toBe(OBLIGATION_CENTS);
        expect(vector.reductionsCents, "no reductions").toBe(0);
        expect(vector.netObligationCents, "net = gross - reductions").toBe(
            vector.grossCents + vector.reductionsCents,
        );
        expect(vector.outstandingCents, "outstanding = net - payments").toBe(
            vector.netObligationCents - vector.paymentsReceivedCents,
        );
        expect(vector.responsibilityAllocatedCents + vector.responsibilityUnassignedCents, "every cent is placed").toBe(
            vector.netObligationCents,
        );
        expect(vector.responsibilityUnassignedCents, "none of it is unassigned").toBe(0);
        expect(vector.currentlyCollectibleCents, "an expectation suppresses nothing").toBe(vector.outstandingCents);
        expect(vector.expectedFundingCents, "the corrected expectation").toBe(FUNDING_CORRECTED_CENTS);
        expect(vector.expectedFundingCents, "which is less than what is owed, and does not reduce it").toBeLessThan(
            vector.outstandingCents,
        );
        expect(vector.paymentsReceivedCents, "nothing received").toBe(0);
        expect(vector.refundedCents, "nothing refunded").toBe(0);
        expect(vector.postedChargeCount, "one obligation").toBe(1);
        expect(vector.responsibilityShareId, "the share is identified").not.toBe("");
        expect(vector.expectedFundingId, "the expectation is identified").not.toBe("");
    });
});
