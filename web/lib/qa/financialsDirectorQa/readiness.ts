/**
 * WHAT IS TRUE RIGHT NOW, ASKED OF THE PRODUCT RATHER THAN OF THE CATALOG.
 *
 * The division of labour matters more here than anywhere else in the harness. The catalog owns the
 * QUESTIONS — identity, intent, dependencies, acceptance semantics. Financials owns the ANSWERS —
 * what is actually posted, paid, owed and expected. This module is the seam, and it only ever reads.
 *
 * Nothing below computes money. Every figure is taken from `buildFinancialsCardVM`, the same
 * authority the product's own surfaces render, so the harness can never drift into being a second
 * opinion about a family's balance. If that reader is wrong, the harness is wrong in exactly the
 * same way and the Director sees the defect rather than a number the QA tool made up.
 *
 * Starting figures are deliberately not cached or copied into the catalog: they are resolved when a
 * scenario opens. A constant written down at authoring time is a number that is true once.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

import { CATALOG_VERSION, SCENARIOS, type AccountStateCheck, type Scenario } from "./scenarioCatalog";

/** The representative household this acceptance program is written against. */
export const QA_SUBJECT = Object.freeze({
    customerId: "fd000000-0000-4000-8000-0000000c0001",
    householdLabel: "Alvarez Household (demo)",
    childWithAgreement: Object.freeze({ id: "fd000000-0000-4000-8000-0000000d0001", name: "Ana Alvarez" }),
    siblingWithoutAgreement: Object.freeze({ id: "fd000000-0000-4000-8000-0000000d0005", name: "Rio Alvarez" }),
    responsibleAdult: Object.freeze({ id: "fd000000-0000-4000-8000-0000000b0002", name: "Dana Alvarez" }),
    site: "North Campus",
    fixturePath: "certification/fixtures/financials-demo-tenant.sql",
});

export type SubjectSnapshot = {
    resolved: boolean;
    unresolvedReason: string | null;
    householdLabel: string;
    periodKey: string;
    periodLabel: string;
    grossCents: number;
    netObligationCents: number;
    outstandingCents: number;
    collectibleCents: number;
    paymentsReceivedCents: number;
    responsibilityAllocatedCents: number;
    responsibilityUnassignedCents: number;
    namedParties: string[];
    expectedFunding: Array<{ label: string; cents: number }>;
    postedCount: number;
    draftCount: number;
    reductionCount: number;
    paymentCount: number;
    billableChildren: Array<{ customerMemberId: string; displayName: string }>;
};

export type ScenarioReadiness = {
    scenarioKey: string;
    ready: boolean;
    /** Every unmet precondition, in the words the Director needs to act on it. */
    unmet: string[];
};

export type HarnessReadiness = {
    catalogVersion: string;
    deployedRevision: string;
    environment: string;
    subject: SubjectSnapshot;
    scenarios: ScenarioReadiness[];
};

/** The build this process is actually running. Unknown is reported, never guessed. */
export function deployedRevision(): string {
    return (
        process.env.VERCEL_GIT_COMMIT_SHA
        ?? process.env.ALLOY_BUILD_SHA
        ?? "unknown"
    );
}

export function environmentName(): string {
    return process.env.VERCEL_ENV === "production" ? "production" : "staging";
}

/**
 * Read the subject once, from the canonical account authority.
 *
 * A FAILED READ IS NOT A ZERO BALANCE. If the reader throws, this says so and the harness refuses to
 * start a scenario — because "we could not look" and "they owe nothing" are different answers, and
 * rendering the first as the second is the exact defect Financials spent a thread removing.
 */
export async function readSubject(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string = QA_SUBJECT.customerId,
): Promise<SubjectSnapshot> {
    const empty = (reason: string): SubjectSnapshot => ({
        resolved: false,
        unresolvedReason: reason,
        householdLabel: QA_SUBJECT.householdLabel,
        periodKey: "",
        periodLabel: "",
        grossCents: 0,
        netObligationCents: 0,
        outstandingCents: 0,
        collectibleCents: 0,
        paymentsReceivedCents: 0,
        responsibilityAllocatedCents: 0,
        responsibilityUnassignedCents: 0,
        namedParties: [],
        expectedFunding: [],
        postedCount: 0,
        draftCount: 0,
        reductionCount: 0,
        paymentCount: 0,
        billableChildren: [],
    });

    let vm: Awaited<ReturnType<typeof buildFinancialsCardVM>>;
    try {
        vm = await buildFinancialsCardVM(supabase, { orgId, customerId });
    } catch (err) {
        return empty(err instanceof Error ? err.message : "The account could not be read.");
    }

    const rows = vm.rows ?? [];
    const posted = rows.filter((r) => r.status === "posted");
    const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

    return {
        resolved: true,
        unresolvedReason: null,
        householdLabel: QA_SUBJECT.householdLabel,
        periodKey: String(vm.period?.key ?? ""),
        periodLabel: String(vm.period?.label ?? ""),
        grossCents: n(vm.reconciliation?.grossCents),
        netObligationCents: n(vm.reconciliation?.responsibilityCents),
        outstandingCents: n(vm.reconciliation?.balanceCents),
        collectibleCents: n(vm.collectible?.currentlyCollectibleCents),
        paymentsReceivedCents: n(vm.reconciliation?.paymentsCents),
        responsibilityAllocatedCents: n(vm.responsibility?.allocatedCents),
        responsibilityUnassignedCents: n(vm.responsibility?.unassignedCents),
        namedParties: (vm.responsibility?.parties ?? []).map((p) => String(p.name)),
        expectedFunding: (vm.expectedFunding ?? []).map((f) => ({
            label: String(f.label ?? ""),
            cents: n((f as Record<string, unknown>).expectedCents),
        })),
        postedCount: posted.length,
        draftCount: rows.filter((r) => r.status === "draft").length,
        reductionCount: (vm.reductions ?? []).length,
        paymentCount: (vm.payments ?? []).length,
        billableChildren: (vm.subjects ?? []).map((s) => ({
            customerMemberId: String(s.customerMemberId),
            displayName: String(s.displayName),
        })),
    };
}

/**
 * Can this named condition be satisfied by the account as it stands?
 *
 * A closed set, deliberately. A free-form predicate here would let the harness start answering
 * financial questions of its own, which is the one thing it must never do.
 */
export function checkAccountState(check: AccountStateCheck, s: SubjectSnapshot, vmExtras: VmExtras): boolean {
    switch (check) {
        case "is_financially_addressable":
            return s.resolved && s.billableChildren.length > 0;
        case "has_posted_obligation":
            return vmExtras.hasLiveObligation;
        case "has_draft":
            return s.draftCount > 0;
        case "has_no_draft":
            return s.draftCount === 0;
        case "has_obligation_with_room_to_reduce":
            return vmExtras.hasRoomToReduce;
        case "has_posted_reduction":
            return vmExtras.hasObligationAtZero;
        case "has_inbound_payment":
            return vmExtras.inboundPayments > 0;
        case "has_active_application":
            return vmExtras.activeApplications > 0;
        case "has_unapplied_money":
            return vmExtras.unappliedCents > 0;
        case "has_named_responsibility":
            return s.responsibilityAllocatedCents > 0 && s.namedParties.length > 0;
        case "has_expected_funding":
            return s.expectedFunding.length > 0;
        case "has_second_child_without_agreement":
            // The sibling exists on the household and is deliberately NOT a billable subject.
            return !s.billableChildren.some((c) => c.customerMemberId === QA_SUBJECT.siblingWithoutAgreement.id);
        default:
            return false;
    }
}

/** The few facts the snapshot flattens away but the preconditions still need. */
export type VmExtras = {
    hasLiveObligation: boolean;
    hasRoomToReduce: boolean;
    hasObligationAtZero: boolean;
    inboundPayments: number;
    activeApplications: number;
    unappliedCents: number;
};

export async function readVmExtras(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string = QA_SUBJECT.customerId,
): Promise<VmExtras> {
    const none: VmExtras = {
        hasLiveObligation: false,
        hasRoomToReduce: false,
        hasObligationAtZero: false,
        inboundPayments: 0,
        activeApplications: 0,
        unappliedCents: 0,
    };
    let vm: Awaited<ReturnType<typeof buildFinancialsCardVM>>;
    try {
        vm = await buildFinancialsCardVM(supabase, { orgId, customerId });
    } catch {
        return none;
    }
    const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
    const rows = vm.rows ?? [];
    const reductions = vm.reductions ?? [];
    const payments = vm.payments ?? [];

    /* The same net rule the product applies: gross plus every POSTED reduction against it. */
    const roomOf = (chargeId: string, amountCents: number) =>
        amountCents
        + reductions
            .filter((d) => String(d.sourceChargeId ?? "") === chargeId && String(d.chargeStatus ?? "") === "posted")
            .reduce((sum, d) => sum + n(d.amountCents), 0);

    const obligations = rows.filter(
        (r) => r.status === "posted" && !r.correctsChargeId && n(r.amountCents) > 0,
    );

    const inbound = payments.filter((p) => String(p.direction) === "inbound");

    return {
        hasLiveObligation: obligations.some((r) => !r.reversedByChargeId),
        hasRoomToReduce: obligations.some((r) => roomOf(String(r.chargeId), n(r.amountCents)) > 0),
        hasObligationAtZero: obligations.some((r) => roomOf(String(r.chargeId), n(r.amountCents)) === 0),
        inboundPayments: inbound.length,
        activeApplications: inbound.reduce(
            (sum, p) => sum + ((p.applications ?? []) as Array<Record<string, unknown>>)
                .filter((a) => String(a.status) === "active").length,
            0,
        ),
        unappliedCents: inbound.reduce((sum, p) => sum + n(p.unappliedCents), 0),
    };
}

/**
 * Which scenarios the Director can meaningfully run right now, and for the rest, what is missing.
 *
 * A scenario whose preconditions are wrong is never silently offered. Letting somebody test posting
 * a draft when no draft exists does not produce a FAIL, it produces a confused tester and a
 * worthless record.
 */
export function resolveReadiness(
    subject: SubjectSnapshot,
    extras: VmExtras,
    acceptedScenarioKeys: ReadonlySet<string>,
): ScenarioReadiness[] {
    return SCENARIOS.map((scenario: Scenario) => {
        const unmet: string[] = [];
        for (const req of scenario.requires) {
            if (req.kind === "scenario_passed") {
                if (!acceptedScenarioKeys.has(req.scenarioKey)) {
                    unmet.push(`Requires scenario "${req.scenarioKey}" to be accepted first.`);
                }
                continue;
            }
            if (!checkAccountState(req.check, subject, extras)) {
                unmet.push(`Requires ${req.describe}.`);
            }
        }
        if (!subject.resolved) {
            unmet.push(subject.unresolvedReason ?? "The account could not be read.");
        }
        return { scenarioKey: scenario.key, ready: unmet.length === 0, unmet };
    });
}

export { CATALOG_VERSION };
