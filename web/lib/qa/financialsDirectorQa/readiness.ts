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
import { resolveFinancialSubjectCohort } from "@/lib/financials/workspace/resolveFinancialSubjects";

import { CATALOG_VERSION, SCENARIOS, type AccountStateCheck, type Scenario } from "./scenarioCatalog";
import { fixtureForScenario, isW7FixtureKey, w7Fixture, W7_DEFAULT_FIXTURE, type W7FixtureKey } from "./w7Fixtures";

/**
 * THE DEFAULT W7 HOUSEHOLD — W7 QA · Monthly Family (W7-F012).
 *
 * This was Alvarez Household (demo), a household carrying months of earlier QA charges and payments
 * that no scenario could account for. Every scenario now names its own W7 fixture
 * (`w7Fixtures.ts`); this is the one a scenario that names no other is read against, and the
 * subject the route reports first.
 */
export const QA_SUBJECT = Object.freeze({
    customerId: w7Fixture(W7_DEFAULT_FIXTURE).customerId,
    householdLabel: w7Fixture(W7_DEFAULT_FIXTURE).householdLabel,
    childWithAgreement: Object.freeze({
        id: w7Fixture(W7_DEFAULT_FIXTURE).children[0]!.id,
        name: w7Fixture(W7_DEFAULT_FIXTURE).children[0]!.name,
    }),
    responsibleAdult: Object.freeze(w7Fixture(W7_DEFAULT_FIXTURE).responsibleAdults[0]!),
    site: "North Campus",
    fixturePath: "certification/fixtures/financials-demo-tenant.sql",
});

/** One W7 household's readings — what its scenarios' preconditions are measured against. */
export type FixtureReading = {
    subject: SubjectSnapshot;
    extras: VmExtras;
    navigation: NavigationSnapshot;
};

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

/**
 * TWO LEVELS, BECAUSE A HARNESS THAT ONLY CHECKS ONE OF THEM CERTIFIES A SCENARIO NOBODY CAN RUN.
 *
 * `DATA_READY` — the account's facts satisfy the scenario's preconditions. That is what this
 * harness has always measured, and it is measured through the canonical reader.
 *
 * `NAVIGATION_READY` — an operator can actually REACH the subject through the product path the
 * scenario names. This was the gap: Scenario 01 reported ready because the API resolved the
 * household, while Financials → Accounts did not list it, so the very first step of the walkthrough
 * could not be performed. Resolvability is not navigability, and a harness that conflates them
 * reports green on a surface that is unusable.
 */
export type ReadinessLevel = "DATA_READY" | "NAVIGATION_READY";

export type ScenarioReadiness = {
    scenarioKey: string;
    /** Both levels. The single answer a client gates "Start" on, unchanged in meaning. */
    ready: boolean;
    /** The account's facts satisfy the preconditions. */
    dataReady: boolean;
    /** The operator can reach the subject on the surface the scenario navigates to. */
    navigationReady: boolean;
    /** Every unmet precondition, in the words the Director needs to act on it. */
    unmet: string[];
    /** Why the scenario cannot be reached, when it cannot. Separate from `unmet` on purpose. */
    unreachable: string[];
};

export type HarnessReadiness = {
    catalogVersion: string;
    deployedRevision: string;
    environment: string;
    subject: SubjectSnapshot;
    navigation: NavigationSnapshot;
    scenarios: ScenarioReadiness[];
};

/**
 * CAN AN OPERATOR GET THERE — asked of the resolver the product actually navigates through.
 *
 * Deliberately NOT "is the Alvarez household visible". Hardcoding one household's visibility would
 * make this pass the moment somebody special-cased that household, which is the failure mode a
 * readiness test exists to catch. It asks the Accounts cohort contract — the same
 * `resolveFinancialSubjectCohort` the rail is composed from — whether THIS subject is in it under
 * these rights. A subject that is in the cohort is on the rail; one that is not, is not.
 */
export type NavigationSnapshot = {
    reachable: boolean;
    /** Why not, in the Director's words. Null when reachable. */
    unreachableReason: string | null;
    /** The product path this was tested against, in the labels the build renders. */
    surface: string;
    /** How many household accounts the rail would list under these rights. */
    accountsInCohort: number;
    /** True when the cohort hit its scan cap — "absent" would then be an unsafe conclusion. */
    truncated: boolean;
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
    householdLabel: string = QA_SUBJECT.householdLabel,
): Promise<SubjectSnapshot> {
    const empty = (reason: string): SubjectSnapshot => ({
        resolved: false,
        unresolvedReason: reason,
        householdLabel,
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
        householdLabel,
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
 * Read whether the subject is reachable on the surface the walkthrough navigates to.
 *
 * The rights are the CALLER'S, passed in from the authenticated route gate rather than assumed —
 * a navigation answer computed under rights nobody holds is not an answer about navigation. A
 * resolver that throws is reported as unreachable with its own message: "we could not ask" and
 * "they are not there" are different answers, and only one of them means the surface is broken.
 */
export async function readNavigation(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        customerId?: string;
        siteScope?: "all" | "restricted";
        allowedSiteLocationIds?: readonly string[];
        activeSiteLocationId?: string | null;
    },
): Promise<NavigationSnapshot> {
    const surface = "Financials \u2192 Accounts";
    const customerId = args.customerId ?? QA_SUBJECT.customerId;
    try {
        const cohort = await resolveFinancialSubjectCohort(supabase, {
            orgId: args.orgId,
            siteScope: args.siteScope ?? "all",
            allowedSiteLocationIds: args.allowedSiteLocationIds ?? [],
            activeSiteLocationId: args.activeSiteLocationId ?? null,
        });
        const present = cohort.subjects.some((s) => s.customerId === customerId);
        return {
            reachable: present,
            unreachableReason: present
                ? null
                : cohort.truncated
                  ? `${surface} reached its scan cap before this account, so it cannot be shown to be listed.`
                  : `${surface} does not list this account, so the walkthrough cannot start.`,
            surface,
            accountsInCohort: cohort.subjects.length,
            truncated: cohort.truncated,
        };
    } catch (err) {
        return {
            reachable: false,
            unreachableReason: `${surface} could not be resolved: ${err instanceof Error ? err.message : String(err)}`,
            surface,
            accountsInCohort: 0,
            truncated: false,
        };
    }
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
            /*
             * THE ACCOUNT RESOLVING IS THE WHOLE TEST.
             *
             * This used to also require a billable child, which quietly made an enrolment agreement
             * the price of being a financial subject — on the harness whose first scenario is "a
             * household with no money is still a financial subject". The canonical account reader
             * says the opposite in as many words, so the precondition now says what it means.
             */
            return s.resolved;
        case "has_billable_enrollment":
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
            /*
             * RETIRED FROM THE W7 CATALOG (W7-F012). It described Alvarez's Rio, a child with no
             * agreement; no W7 scenario asks it now. Kept answerable — "no more than one billable
             * child" — so a stored precondition never silently reads true for a family of two.
             */
            return s.resolved && s.billableChildren.length <= 1;
        case "has_two_billable_children":
            // W7 QA · Multi-Site Family: two children, each with their own enrolment and campus.
            return s.resolved && s.billableChildren.length >= 2;
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
    navigation: NavigationSnapshot,
    /**
     * EACH SCENARIO IS MEASURED AGAINST ITS OWN FIXTURE (W7-F012). When supplied, a scenario whose
     * fixture is a W7 household reads that household's facts; organization and evidence scenarios,
     * and any household not supplied, read the default subject above.
     */
    byFixture?: Partial<Record<W7FixtureKey, FixtureReading>>,
): ScenarioReadiness[] {
    return SCENARIOS.map((base: Scenario) => {
        const fixtureKey = fixtureForScenario(base.key);
        const reading = isW7FixtureKey(fixtureKey) ? byFixture?.[fixtureKey] : undefined;
        return readinessFor(
            base,
            reading?.subject ?? subject,
            reading?.extras ?? extras,
            acceptedScenarioKeys,
            reading?.navigation ?? navigation,
        );
    });
}

function readinessFor(
    scenario: Scenario,
    subject: SubjectSnapshot,
    extras: VmExtras,
    acceptedScenarioKeys: ReadonlySet<string>,
    navigation: NavigationSnapshot,
): ScenarioReadiness {
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

    /*
     * NAVIGATION IS A SEPARATE ANSWER, AND IT GATES THE SAME BUTTON.
     *
     * A scenario that names no product path cannot be blocked by one — the deferred and
     * out-of-scope entries declare `navigate: []` and are left alone. Every walkthrough enters
     * through the account the first scenario opens, so reachability of the subject is
     * reachability of the scenario.
     */
    const unreachable: string[] = [];
    if (scenario.navigate.length > 0 && !navigation.reachable) {
        unreachable.push(navigation.unreachableReason ?? `${navigation.surface} cannot be reached.`);
    }

    const dataReady = unmet.length === 0;
    const navigationReady = unreachable.length === 0;
    return {
        scenarioKey: scenario.key,
        ready: dataReady && navigationReady,
        dataReady,
        navigationReady,
        unmet,
        unreachable,
    };
}

/** Read one W7 household the way the route reads the default subject: facts, extras, reachability. */
export async function readW7Fixtures(
    supabase: SupabaseClient,
    args: { orgId: string; siteScope?: "all" | "restricted"; allowedSiteLocationIds?: readonly string[]; activeSiteLocationId?: string | null },
    keys: readonly W7FixtureKey[],
): Promise<Partial<Record<W7FixtureKey, FixtureReading>>> {
    const entries = await Promise.all(
        keys.map(async (key) => {
            const f = w7Fixture(key);
            const [subject, extras, navigation] = await Promise.all([
                readSubject(supabase, args.orgId, f.customerId, f.householdLabel),
                readVmExtras(supabase, args.orgId, f.customerId),
                readNavigation(supabase, { ...args, customerId: f.customerId }),
            ]);
            return [key, { subject, extras, navigation }] as const;
        }),
    );
    return Object.fromEntries(entries);
}

export { CATALOG_VERSION };
