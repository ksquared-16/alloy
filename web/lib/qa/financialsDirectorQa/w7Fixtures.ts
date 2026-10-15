/**
 * THE W7 QA FIXTURE SET — which household each Director scenario is run against (W7-F012).
 *
 * The walkthrough used to run against Alvarez and whatever else staging happened to hold, so a
 * scenario's starting figures depended on months of other people's QA residue. These households
 * exist only for W7, are built by the governed fixture `certification/fixtures/financials-demo-
 * tenant.sql` (its W7 section, insert-only, ids in the fixture's own `fd000000-…-0000007…` block),
 * and each has one job.
 *
 * Every scenario names its fixture here, so the Director never has to guess which household is
 * safe to use. One scenario family stays on an existing evidence household deliberately: Autopay
 * reads Certhouse's genuine W5 consent history, which is READ-ONLY evidence, not a subject to spend.
 */

export type W7FixtureKey = "w7_monthly" | "w7_weekly" | "w7_west" | "w7_multi_site" | "w7_split" | "w7_tuition";

/** Where a scenario is run: a W7 household, organization-level configuration, or read-only evidence. */
export type ScenarioFixtureKey = W7FixtureKey | "organization" | "certhouse" | "certopp";

export type W7Person = { id: string; name: string };

export type W7Fixture = {
    key: W7FixtureKey;
    customerId: string;
    householdLabel: string;
    children: ReadonlyArray<W7Person & { campus: string }>;
    campuses: readonly string[];
    /** How this household's billing period is resolved, in the Director's words. */
    billingResolution: string;
    /** The standing arrangement the fixture creates. */
    responsibility: string;
    responsibleAdults: readonly W7Person[];
    /** Adults on the account who are eligible to be made responsible and currently are not. */
    eligibleNotResponsible: readonly W7Person[];
    purpose: string;
};

const id = (block: string, n: number) => `fd000000-0000-4000-8000-0000007${block}${String(n).padStart(4, "0")}`;

export const W7_FIXTURES: readonly W7Fixture[] = Object.freeze([
    {
        key: "w7_monthly",
        customerId: id("c", 1),
        householdLabel: "W7 QA · Monthly Family",
        children: [{ id: id("d", 1), name: "Milo Monthly", campus: "North Campus" }],
        campuses: ["North Campus"],
        billingResolution: "Monthly — North Campus calendar; no account override",
        responsibility: "100% Mara Monthly",
        responsibleAdults: [{ id: id("b", 1), name: "Mara Monthly" }],
        eligibleNotResponsible: [],
        purpose: "The standard monthly account. Charges, drafts, posting, adjustments, payments and recurring tuition.",
    },
    {
        key: "w7_weekly",
        customerId: id("c", 2),
        householdLabel: "W7 QA · Weekly Family",
        children: [{ id: id("d", 2), name: "Willa Weekly", campus: "South Campus" }],
        campuses: ["South Campus"],
        billingResolution: "Weekly · Wed–Tue — South Campus location override",
        responsibility: "100% Wes Weekly",
        responsibleAdults: [{ id: id("b", 2), name: "Wes Weekly" }],
        eligibleNotResponsible: [],
        purpose: "A location override. Weekly periods, and a charge dated into next week.",
    },
    {
        key: "w7_west",
        customerId: id("c", 3),
        householdLabel: "W7 QA · West Family",
        children: [{ id: id("d", 3), name: "Wyatt Westbrook", campus: "West Campus" }],
        campuses: ["West Campus"],
        billingResolution: "Weekly · Mon–Sun — West Campus location override (a different anchor)",
        responsibility: "100% Wren Westbrook",
        responsibleAdults: [{ id: id("b", 3), name: "Wren Westbrook" }],
        eligibleNotResponsible: [],
        purpose: "An alternate weekly anchor, and an account with no money at all.",
    },
    {
        key: "w7_multi_site",
        customerId: id("c", 4),
        householdLabel: "W7 QA · Multi-Site Family",
        children: [
            { id: id("d", 4), name: "Mika Multisite", campus: "North Campus" },
            { id: id("d", 5), name: "Max Multisite", campus: "South Campus" },
        ],
        campuses: ["North Campus", "South Campus"],
        billingResolution: "Monthly — explicit ACCOUNT billing calendar (children attend two campuses)",
        responsibility: "Morgan Multisite 50% · Sam Multisite 50%",
        responsibleAdults: [
            { id: id("b", 4), name: "Morgan Multisite" },
            { id: id("b", 5), name: "Sam Multisite" },
        ],
        eligibleNotResponsible: [],
        purpose: "Children at two locations: per-child attribution and the account-level billing-calendar path.",
    },
    {
        key: "w7_split",
        customerId: id("c", 5),
        householdLabel: "W7 QA · Split Family",
        children: [{ id: id("d", 6), name: "Sasha Split", campus: "North Campus" }],
        campuses: ["North Campus"],
        billingResolution: "Monthly — North Campus calendar; no account override",
        responsibility: "Dana Split 50% · Rosa Split 50%",
        responsibleAdults: [
            { id: id("b", 6), name: "Dana Split" },
            { id: id("b", 7), name: "Rosa Split" },
        ],
        eligibleNotResponsible: [{ id: id("b", 8), name: "Gale Split" }],
        purpose: "Responsibility: a standing 50/50 arrangement, plus an eligible adult for “+ Add responsible member”.",
    },
    /*
     * W7 Scenario 9: the one household with an enrolment ASSIGNMENT and accepted monthly tuition —
     * Toddler · full-time · 3 days at North Campus, resolved by the canonical pricing resolver to the
     * organization's authored $1,200.00 monthly rate and accepted through `enrollment.pricing.accept`,
     * effective Nov 1, 2026. No charges, payments or other money until the Director generates
     * November's tuition through Financials → Charges.
     */
    {
        key: "w7_tuition",
        customerId: id("c", 6),
        householdLabel: "W7 QA · Tuition Family",
        children: [{ id: id("d", 7), name: "Tilly Tuition", campus: "North Campus" }],
        campuses: ["North Campus"],
        billingResolution: "Monthly — North Campus calendar; no account override",
        responsibility: "100% Tess Tuition",
        responsibleAdults: [{ id: id("b", 9), name: "Tess Tuition" }],
        eligibleNotResponsible: [],
        purpose: "Recurring tuition: one accepted monthly term ($1,200.00 from Nov 1, 2026) for Generate tuition to bill.",
    },
] satisfies W7Fixture[]);

/** The W7 Tuition Family's accepted monthly term, as Scenario 9 expects the preview to bill it. */
export const W7_TUITION_TERM = Object.freeze({
    child: "Tilly Tuition",
    program: "Toddler · full-time · 3 days a week · North Campus",
    cadence: "monthly",
    amountCents: 120000,
    effectiveStart: "2026-11-01",
    source: "Organization tuition rate: Toddler · full-time · 3 days · monthly · private pay",
});

export function w7Fixture(key: W7FixtureKey): W7Fixture {
    return W7_FIXTURES.find((f) => f.key === key)!;
}

/** The household a scenario that names no other is run against. */
export const W7_DEFAULT_FIXTURE: W7FixtureKey = "w7_monthly";

/** Read-only evidence fixtures, named in words the Director recognises. */
export const EVIDENCE_FIXTURE_LABEL: Record<"organization" | "certhouse" | "certopp", string> = {
    organization: "Organization settings — no household",
    certhouse: "Certhouse — read-only Autopay evidence",
    certopp: "Certopp — read-only bank-method evidence",
};

/**
 * EVERY SCENARIO, AND THE FIXTURE IT IS RUN AGAINST.
 *
 * Explicit rather than defaulted, so adding a scenario without deciding its household is a test
 * failure rather than a silent fall-through. Scenarios that chain (`scenario_passed`) share one
 * household — a draft posted in one scenario is the draft the next one reads.
 */
export const SCENARIO_FIXTURE: Readonly<Record<string, ScenarioFixtureKey>> = Object.freeze({
    // Organization configuration — no household.
    billing_configuration_reads_resolved: "organization",
    billing_override_inheritance: "organization",
    billing_scheduled_change: "organization",
    accounting_period_independence: "organization",
    organization_financial_configuration: "organization",
    provider_readiness: "organization",
    subsidy_processing: "organization",

    // The standard monthly account — the main charge → post → pay chain.
    billing_period_membership: "w7_monthly",
    invoice_date_derivation: "w7_monthly",
    due_date_derivation: "w7_monthly",
    late_current_period_charge: "w7_monthly",
    add_charge_preview_commit_parity: "w7_monthly",

    add_charge_honours_review_boundary: "w7_monthly",
    draft_moves_nothing: "w7_monthly",
    post_charge: "w7_monthly",
    awaiting_posting_says_why: "w7_monthly",
    charge_detail_attribution: "w7_monthly",
    adjustment_draft: "w7_monthly",
    adjustment_post: "w7_monthly",
    reduction_zero_bound: "w7_monthly",
    reverse_adjustment: "w7_monthly",
    payment_receipt: "w7_monthly",
    apply_payment: "w7_monthly",
    partial_unapplied: "w7_monthly",
    move_payment: "w7_monthly",
    failed_reapply_recovery: "w7_monthly",
    refund: "w7_monthly",
    reverse_charge: "w7_monthly",
    cross_surface_consistency: "w7_monthly",
    reload_switch_viewport: "w7_monthly",
    overview_smoke: "w7_monthly",
    tuition_chain: "w7_monthly",
    discount_vs_adjustment: "w7_monthly",
    card_collection: "w7_monthly",
    ach_processing: "w7_monthly",
    provider_return: "w7_monthly",
    payment_method_on_file: "w7_monthly",
    accounting_period: "w7_monthly",
    billing_period: "w7_monthly",
    billing_preview_reachable: "w7_monthly",
    accept_recurring_terms: "w7_monthly",
    recurring_preview_is_the_run: "w7_monthly",
    recurring_generation_bills_the_accepted_price: "w7_monthly",
    recurring_rerun_is_honest: "w7_monthly",
    recurring_term_lifecycle: "w7_monthly",
    recurring_discount_reduces_net: "w7_monthly",
    discount_rerun_and_veto: "w7_monthly",
    discount_exception: "w7_monthly",
    recurring_due_date: "w7_monthly",
    prepaid_available_and_applied: "w7_monthly",
    held_deposit_take_and_hold: "w7_monthly",
    held_deposit_apply: "w7_monthly",
    held_deposit_release: "w7_monthly",
    held_deposit_refund: "w7_monthly",
    held_deposit_non_refundable: "w7_monthly",
    held_deposit_card_rail_refund: "w7_monthly",
    duplicate_charge_notice: "w7_monthly",
    ach_uncovered_obligation: "w7_monthly",
    financial_activity_language: "w7_monthly",
    bank_setup_request: "w7_monthly",
    bank_setup_payer_authorization: "w7_monthly",
    bank_setup_visual_review: "w7_monthly",
    // Chained after bank_setup_payer_authorization, so it reads the method THAT scenario created.
    bank_method_operator_projection: "w7_monthly",

    // Recurring tuition: the one household with an accepted monthly term (W7 Scenario 9).
    generated_billing_parity: "w7_tuition",

    // A weekly location override: a charge dated into a period that has not begun.
    future_period_charge: "w7_weekly",

    // An alternate weekly anchor, and an account with no money at all.
    financial_subject: "w7_west",

    // Two children at two campuses, one account calendar.
    multi_child_attribution: "w7_multi_site",

    // Responsibility: 50/50 standing, Gale eligible and not responsible.
    manage_responsibility: "w7_split",
    responsibility_supersession: "w7_split",
    expected_funding: "w7_split",
    expected_funding_correction: "w7_split",
    subsidy_exclusion: "w7_split",
    actual_payer_is_not_responsibility: "w7_split",
    child_responsibility_and_partial: "w7_split",

    // Read-only evidence that cannot be re-created by re-running it.
    autopay_enrollment: "certhouse",
    autopay_card_collection: "certhouse",
    autopay_bank_processing: "certhouse",
    autopay_failure: "certhouse",
    autopay_retry: "certhouse",
    autopay_pause: "certhouse",
    autopay_resume: "certhouse",
    autopay_revoke: "certhouse",
    autopay_method_invalidated: "certhouse",
});

export function fixtureForScenario(scenarioKey: string): ScenarioFixtureKey {
    return SCENARIO_FIXTURE[scenarioKey] ?? W7_DEFAULT_FIXTURE;
}

/** The household label a scenario's "Fixture:" line reads. */
export function fixtureLabel(key: ScenarioFixtureKey): string {
    return key === "organization" || key === "certhouse" || key === "certopp"
        ? EVIDENCE_FIXTURE_LABEL[key]
        : w7Fixture(key).householdLabel;
}

export function isW7FixtureKey(key: ScenarioFixtureKey): key is W7FixtureKey {
    return W7_FIXTURES.some((f) => f.key === key);
}
