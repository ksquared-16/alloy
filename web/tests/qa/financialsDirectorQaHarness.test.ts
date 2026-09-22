/**
 * THE HARNESS OBSERVES THE PRODUCT. IT MUST NEVER PARTICIPATE IN IT.
 *
 * A QA tool that can write money is not a QA tool, it is a second way to change a family's balance
 * with none of the product's rules attached. These tests hold that line where it is cheapest to
 * hold — in the source, before anything ships — and they hold the readiness logic, because a
 * harness that offers a scenario whose preconditions are wrong produces a confused tester and a
 * worthless record rather than a finding.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    checkAccountState,
    resolveReadiness,
    QA_SUBJECT,
    type NavigationSnapshot,
    type SubjectSnapshot,
    type VmExtras,
} from "@/lib/qa/financialsDirectorQa/readiness";
import { SCENARIOS, scenarioByKey } from "@/lib/qa/financialsDirectorQa/scenarioCatalog";

const WEB = join(process.cwd());
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const HARNESS_SOURCES = [
    "lib/qa/financialsDirectorQa/readiness.ts",
    "lib/qa/financialsDirectorQa/scenarioCatalog.ts",
    "app/api/admin/qa/financials-director/route.ts",
    "app/adminV2/system/qa/core-financials/page.tsx",
    "app/adminV2/system/qa/core-financials/DirectorQaClient.tsx",
    /* The local, beside-the-product reader is held to exactly the same boundary. */
    "app/dev/core-financials-qa/page.tsx",
    "app/dev/core-financials-qa/CoreFinancialsQaReader.tsx",
];

const emptySubject = (over: Partial<SubjectSnapshot> = {}): SubjectSnapshot => ({
    resolved: true, unresolvedReason: null, householdLabel: "H", periodKey: "2026-09", periodLabel: "September 2026",
    grossCents: 0, netObligationCents: 0, outstandingCents: 0, collectibleCents: 0, paymentsReceivedCents: 0,
    responsibilityAllocatedCents: 0, responsibilityUnassignedCents: 0, namedParties: [], expectedFunding: [],
    postedCount: 0, draftCount: 0, reductionCount: 0, paymentCount: 0,
    billableChildren: [{ customerMemberId: QA_SUBJECT.childWithAgreement.id, displayName: "Ana Alvarez" }],
    ...over,
});
/** The subject is on the rail. Navigation is a separate axis and is stated, never assumed. */
const reachable: NavigationSnapshot = {
    reachable: true, unreachableReason: null, surface: "Financials \u2192 Accounts",
    accountsInCohort: 4, truncated: false,
};
const unreachable: NavigationSnapshot = {
    reachable: false,
    unreachableReason: "Financials \u2192 Accounts does not list this account, so the walkthrough cannot start.",
    surface: "Financials \u2192 Accounts", accountsInCohort: 3, truncated: false,
};
const noExtras: VmExtras = {
    hasLiveObligation: false, hasRoomToReduce: false, hasObligationAtZero: false,
    inboundPayments: 0, activeApplications: 0, unappliedCents: 0,
};

describe("the harness never writes Financials", () => {
    /*
     * The mutation surface, named exactly. The harness may IMPORT the canonical account READER —
     * that is the whole point, it must not compute money itself — but nothing that changes money.
     */
    const FORBIDDEN = [
        "childcarePaymentService", "manualReductionService", "arrangementService",
        "expectedFundingService", "chargeLifecycleService", "createChildcareCorrection",
        "recordAndApplyChildcarePayment", "applyReductionCore", "resolveChargeResponsibility",
        "/api/admin/actions/execute",
    ];

    it("imports no financial mutation service and calls no action executor", () => {
        for (const rel of HARNESS_SOURCES) {
            const src = read(rel);
            for (const needle of FORBIDDEN) {
                expect(src.includes(needle), `${rel} must not reference ${needle}`).toBe(false);
            }
        }
    });

    it("writes only its own acceptance table", () => {
        const route = read("app/api/admin/qa/financials-director/route.ts");
        const written = [...route.matchAll(/\.from\(([^)]*)\)/g)].map((m) => m[1].replace(/["'`]/g, "").trim());
        for (const table of written) {
            expect(table, `the harness wrote to ${table}`).toBe("RESULTS");
        }
        expect(route).toContain('const RESULTS = "qa_director_acceptance_results"');
    });

    /* Reading a real household's balances is a Financials read, and is gated as one. */
    it("gates its readiness read on the Financials read permission", () => {
        const route = read("app/api/admin/qa/financials-director/route.ts");
        expect(route).toContain("assertFinancialsReadAllowed");
    });

    it("never marks a scenario passed on the Director's behalf", () => {
        for (const rel of [
            "app/adminV2/system/qa/core-financials/DirectorQaClient.tsx",
            "app/dev/core-financials-qa/CoreFinancialsQaReader.tsx",
        ]) assertNoRecordFromEffect(read(rel));
    });

    function assertNoRecordFromEffect(client: string) {
        // Every result written is the argument of an explicit record(...) call from a button.
        /*
         * EVERY EFFECT BODY, CHECKED FOR A RECORDED RESULT.
         *
         * A bounded match on the effect bodies rather than a dotAll scan of the file: the lazy
         * whole-file version matched a useEffect at the top against a record() call hundreds of
         * lines below and reported a violation that was not there.
         */
        const effectBodies = [...client.matchAll(/useEffect\(\(\) => \{([^}]*)\}/g)].map((m) => m[1]);
        expect(effectBodies.length, "the client mounts at least one effect").toBeGreaterThan(0);
        for (const body of effectBodies) {
            expect(body.includes("record("), "a result must never be recorded from an effect").toBe(false);
        }
        // And the pass path exists, reached from an explicit control.
        expect(client).toContain('record("pass")');
    }
});

describe("scenario readiness", () => {
    it("refuses a scenario whose account precondition is unmet, and says what is missing", () => {
        const readiness = resolveReadiness(emptySubject(), noExtras, new Set(), reachable);
        const postCharge = readiness.find((r) => r.scenarioKey === "post_charge")!;
        expect(postCharge.ready).toBe(false);
        expect(postCharge.unmet.join(" ")).toMatch(/draft/i);
    });

    it("opens a scenario once the account satisfies it", () => {
        const readiness = resolveReadiness(emptySubject({ draftCount: 1 }), noExtras, new Set(), reachable);
        expect(readiness.find((r) => r.scenarioKey === "post_charge")!.ready).toBe(true);
    });

    it("holds a dependent scenario until its predecessor is accepted", () => {
        const subject = emptySubject({ responsibilityAllocatedCents: 7500, namedParties: ["Dana Alvarez"] });
        const extras = { ...noExtras, hasLiveObligation: true };
        const blocked = resolveReadiness(subject, extras, new Set(), reachable).find((r) => r.scenarioKey === "expected_funding")!;
        expect(blocked.ready).toBe(false);
        expect(blocked.unmet.join(" ")).toContain("manage_responsibility");

        const open = resolveReadiness(subject, extras, new Set(["manage_responsibility"]), reachable)
            .find((r) => r.scenarioKey === "expected_funding")!;
        expect(open.ready).toBe(true);
    });

    /*
     * A FAILED READ IS NOT A ZERO BALANCE. If the account could not be read, every scenario is
     * unready and says so — rather than offering a walkthrough against figures nobody could fetch.
     */
    it("refuses everything when the account could not be read", () => {
        const broken = emptySubject({ resolved: false, unresolvedReason: "the account could not be read" });
        const readiness = resolveReadiness(broken, noExtras, new Set(), reachable);
        expect(readiness.every((r) => !r.ready)).toBe(true);
        expect(readiness[0].unmet.join(" ")).toMatch(/could not be read/i);
    });

    /*
     * ── THE GAP THIS PROGRAM SHIPPED WITH ──────────────────────────────────────────────────────
     *
     * Scenario 01 reported READY on the strength of the account resolving through the API, while
     * Financials → Accounts did not list the household, so its first instruction — open Accounts,
     * select the household — could not be carried out. Resolvability is not navigability. These
     * hold the two apart.
     */
    it("separates data readiness from navigation readiness", () => {
        const [entry] = resolveReadiness(emptySubject({ draftCount: 1 }), noExtras, new Set(), unreachable)
            .filter((r) => r.scenarioKey === "post_charge");
        expect(entry.dataReady, "the account's facts satisfy the scenario").toBe(true);
        expect(entry.navigationReady, "but the operator cannot reach it").toBe(false);
        expect(entry.ready, "and a scenario nobody can start is not ready").toBe(false);
        expect(entry.unmet, "the data axis stays clean — the gap is not a precondition").toEqual([]);
        expect(entry.unreachable.join(" ")).toMatch(/does not list this account/i);
    });

    it("reports both axes as ready when the subject resolves and is listed", () => {
        const entry = resolveReadiness(emptySubject({ draftCount: 1 }), noExtras, new Set(), reachable)
            .find((r) => r.scenarioKey === "post_charge")!;
        expect(entry.dataReady).toBe(true);
        expect(entry.navigationReady).toBe(true);
        expect(entry.ready).toBe(true);
        expect(entry.unreachable).toEqual([]);
    });

    /*
     * A scenario that names no product path cannot be blocked by one. The deferred and
     * out-of-scope entries declare `navigate: []`, and failing them on navigation would be the
     * harness inventing a dependency the catalog never claimed.
     */
    it("never blocks a scenario that navigates nowhere on navigation", () => {
        const readiness = resolveReadiness(emptySubject(), noExtras, new Set(), unreachable);
        for (const entry of readiness) {
            const navigatesNowhere = scenarioByKey(entry.scenarioKey)!.navigate.length === 0;
            expect(entry.navigationReady, entry.scenarioKey).toBe(navigatesNowhere);
        }
    });

    /*
     * THE READINESS TEST MUST NOT BE A HARDCODED HOUSEHOLD.
     *
     * `readNavigation` asks the Accounts cohort resolver whether the subject is in it. If anyone
     * replaces that with a literal — an id, a name, a "demo" flag — the check stops measuring the
     * contract that powers the rail and starts measuring itself.
     */
    it("resolves navigation through the Accounts cohort contract, not a named household", () => {
        const src = read("lib/qa/financialsDirectorQa/readiness.ts");
        expect(src).toContain("resolveFinancialSubjectCohort");
        const body = src.slice(src.indexOf("export async function readNavigation"));
        const fn = body.slice(0, body.indexOf("\n}\n"));
        expect(fn).toContain("cohort.subjects.some");
        expect(fn, "no household is named inside the navigation check").not.toMatch(/Alvarez/i);
        expect(fn, "and no fixture id is pinned there either").not.toMatch(/fd000000-/);
    });

    it("reads the sibling precondition as an absence of billing, not an absence of the child", () => {
        // Rio is on the household and is deliberately NOT a billable subject.
        expect(checkAccountState("has_second_child_without_agreement", emptySubject(), noExtras)).toBe(true);
        const bothBillable = emptySubject({
            billableChildren: [
                { customerMemberId: QA_SUBJECT.childWithAgreement.id, displayName: "Ana Alvarez" },
                { customerMemberId: QA_SUBJECT.siblingWithoutAgreement.id, displayName: "Rio Alvarez" },
            ],
        });
        expect(checkAccountState("has_second_child_without_agreement", bothBillable, noExtras)).toBe(false);
    });

    it("offers no walkthrough for a deferred or out-of-scope capability", () => {
        for (const key of ["card_collection", "ach_processing", "provider_return", "subsidy_processing"]) {
            expect(scenarioByKey(key)!.disposition).not.toBe("HUMAN_WALKTHROUGH");
        }
        /*
         * 29 since Repair Pass 5D added the billing-period walkthrough. Its sibling — the
         * ACCOUNTING period — is deliberately not one of them: it carries MISSING_PRODUCTIZATION
         * because the platform enforces it and shows it to nobody, and offering a walkthrough for a
         * surface that does not exist would invite a PASS resting on a database query.
         */
        /*
         * A COUNT, NOT A CEILING. This was 30 after Repair Pass 5F productized the accounting
         * period's inspection half; 42 at the Core freeze, which added twelve walkthroughs for
         * the recurring billing chain Section 7 certified and nobody had yet been asked to drive;
         * and 44 at the 11B freeze — `payment_method_on_file`, which Payments W2 made walkable, and
         * `discount_exception`, which 11B built.
         *
         * The number is asserted only so that a scenario cannot be QUIETLY dropped from the
         * walkthrough set — losing one is a capability nobody is asked to accept. Raising it when
         * scenarios are deliberately added is the correct maintenance; lowering it needs a reason
         * written beside it.
         */
        expect(SCENARIOS.filter((s) => s.disposition === "HUMAN_WALKTHROUGH").length).toBe(44);
        expect(scenarioByKey("accounting_period")!.disposition).toBe("HUMAN_WALKTHROUGH");
    });
});
