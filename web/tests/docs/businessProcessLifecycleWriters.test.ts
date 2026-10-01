/**
 * Business Process lifecycle-writer containment (Slot A, erun_2696218404a5b8a6).
 *
 * D-BP1 could not converge in this run: the canonical operator route
 * (`/api/admin/enrollment-status-transition/execute`) is keyed on a CLOSED `destination_key`
 * vocabulary (operator stages + `closed_withdrawn`) that cannot express either sender's intent —
 * Current Work passes an arbitrary configured `action.actionRef`, and Quote Intake passes
 * `needs_a_quote`. Tightening the generic route's authority instead is hard-coupled to that repair,
 * because `enrollment.record.manage` and `enrollment.decide` explicitly do not imply each other.
 *
 * So these guards do the next best thing: they pin the bypass at its measured size so it cannot
 * SPREAD while the product decision is pending, and they pin the facts the A5 repair made true.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

function walk(rel: string, test: (f: string) => boolean): string[] {
    const out: string[] = [];
    const abs = path.join(repoRoot, rel);
    for (const entry of readdirSync(abs)) {
        const childRel = `${rel}/${entry}`;
        if (statSync(path.join(repoRoot, childRel)).isDirectory()) out.push(...walk(childRel, test));
        else if (test(entry)) out.push(childRel);
    }
    return out;
}

describe("D-BP1 containment — the direct status PATCH bypass may not spread", () => {
    /**
     * Client-side files that PATCH the opportunity route with a lifecycle status key.
     *
     * Scans `web/lib` as well as `web/components`, which an earlier version of this guard did not.
     * That blind spot is why the sender count read as one: `lib/recordChrome/executeOpportunityRecordAction.ts`
     * is a client helper that PATCHes, and it lives outside the component tree.
     */
    function opportunityPatchCallers(): string[] {
        const senders: string[] = [];
        const files = [
            ...walk("web/components", (f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)),
            ...walk("web/lib", (f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)),
        ];
        for (const rel of files) {
            const text = read(rel);
            if (!/\/api\/admin\/opportunities\//.test(text)) continue;
            if (!/method:\s*"PATCH"/.test(text)) continue;
            /*
             * Any PATCH caller counts, not only one that spells `status_key` inline.
             * `executeOpportunityRecordAction` forwards a body built by `opportunityRecordActionMap`,
             * so the lifecycle key never appears in its own source — a literal scan looked right and
             * saw nothing. The route should not be receiving lifecycle writes from anywhere, so the
             * honest detector is "who PATCHes it at all".
             */
            senders.push(rel);
        }
        return senders.sort();
    }

    it("has NO lifecycle consumer left — the bypass is closed", () => {
        /*
         * The end of a four-run sequence. Quote Intake was unreachable and removed; Current Work was
         * rewired once the canonical boundary acquired prior-stage reconciliation; and the record-action
         * helper that turned `mark_lost` into a raw {status_key, close_reason_key} PATCH had zero
         * callers and is gone. The map it used SURVIVES on purpose — `correctInvalidClosedLostTargets`
         * reads it to learn what `mark_lost` means so a config repair can preserve the close reason.
         */
        expect(existsSync(path.join(repoRoot, "web/lib/recordChrome/executeOpportunityRecordAction.ts"))).toBe(false);
        /*
         * What remains may PATCH the route, but cannot carry lifecycle state through it — the refusal
         * below is what makes that true, and it is a property of the ROUTE rather than of its callers.
         * Pinning the caller set as well keeps a new one from arriving unnoticed.
         */
        expect(opportunityPatchCallers()).toEqual([
            "web/lib/admin/actions/submitChangeLeadLocation.ts",
            "web/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit.ts",
        ]);
    });

    it("the generic route refuses governed lifecycle keys rather than persisting them", () => {
        const route = read("web/app/api/admin/opportunities/[id]/route.ts");
        expect(route).toMatch(/GOVERNED_LIFECYCLE_KEYS/);
        expect(route).toMatch(/canonical_transition_required/);
        // The keys are gone from the writable allow-list, not merely guarded downstream.
        const allowList = route.slice(route.indexOf("ALLOWED_KEYS"), route.indexOf("PIPELINE_ONLY_KEYS"));
        expect(allowList).not.toMatch(/"status_key"/);
        expect(allowList).not.toMatch(/"close_reason_key"/);
    });

    it("ordinary field editing still works through the record route", () => {
        // Closing lifecycle must not close the route. These callers are field-only and must survive.
        for (const rel of [
            "web/lib/admin/actions/submitChangeLeadLocation.ts",
            "web/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit.ts",
        ]) {
            expect(existsSync(path.join(repoRoot, rel)), rel).toBe(true);
            expect(read(rel)).toMatch(/\/api\/admin\/opportunities\//);
        }
    });

    it("Current Work no longer sends a lifecycle field — it sends configured intent", () => {
        const panel = read("web/components/admin/focusPanel/cards/CurrentWorkStageTransitionPanel.tsx");
        expect(panel).toMatch(/enrollment-status-transition\/execute/);
        expect(panel).toMatch(/configured_transition_ref/);
        // It must not name the lifecycle column at all, in any request body.
        expect(panel).not.toMatch(/status_key:/);
    });

    it("the generic opportunity route still never writes stage_key", () => {
        // Stage movement stays intake/outcome-owned even though status does not.
        expect(read("web/app/api/admin/opportunities/[id]/route.ts")).not.toMatch(/stage_key\s*:/);
    });
});

describe("converging the last sender may not drop prior-stage reconciliation", () => {
    const PANEL = "web/components/admin/focusPanel/cards/CurrentWorkStageTransitionPanel.tsx";
    const CANONICAL_EXECUTION = "web/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition.ts";

    /*
     * The two paths are complementary, not nested. The generic PATCH is the ONLY path that lets an
     * operator say what happens to the work they are leaving behind — completed, skipped or carried
     * forward, per item, via preflightStageTransitionReconciliation. The canonical transition path
     * spawns DESTINATION-stage entry work and reconciles nothing behind it.
     *
     * So a rewire of the last sender is only safe once the canonical boundary has acquired that
     * reconciliation. This guard states the ordering as a test: the panel may stop using the
     * reconciliation flow only when the canonical path has taken it over.
     */
    it("either the panel still reconciles, or the canonical path has acquired reconciliation", () => {
        const panelReconciles = /stage_transition_reconciliation/.test(read(PANEL));
        const canonicalReconciles = /applyStageTransitionReconciliation/.test(read(CANONICAL_EXECUTION));
        expect(
            panelReconciles || canonicalReconciles,
            "The Current Work panel no longer reconciles prior-stage work and the canonical transition " +
                "path has not taken it over. Converging in that order drops the operator's " +
                "completed/skipped/carry_forward choice silently. Move reconciliation first.",
        ).toBe(true);
    });

    it("the canonical execution path has acquired reconciliation, so the rewire is now unblocked", () => {
        /*
         * erun_3c3e4601ce8ab9fb moved it. The panel may now be rewired; until it is, BOTH paths
         * reconcile, which is safe. This case asserts the acquisition directly rather than leaving it
         * implied by the disjunction above, so losing it again fails loudly.
         */
        const canonical = read(CANONICAL_EXECUTION);
        expect(canonical).toMatch(/preflightStageTransitionReconciliation/);
        expect(canonical).toMatch(/applyStageTransitionReconciliation/);
        expect(canonical).toMatch(/validateStageTransitionReconciliationPayload/);
    });

    it("prior-stage reconciliation now lives on the canonical path, not the record route", () => {
        /*
         * It moved. The canonical executor owns it; the standalone preflight route still serves the
         * dialog; and the generic record PATCH no longer mentions it at all, because it no longer
         * performs transitions.
         */
        expect(read("web/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition.ts")).toMatch(
            /applyStageTransitionReconciliation/,
        );
        expect(
            read("web/app/api/admin/opportunities/[id]/stage-transition-reconciliation/preflight/route.ts"),
        ).toMatch(/preflightStageTransitionReconciliation/);
        expect(read("web/app/api/admin/opportunities/[id]/route.ts")).not.toMatch(
            /StageTransitionReconciliation/,
        );
    });
});

describe("the OCM route's fork is the convention D-BP1 should follow", () => {
    const route = "web/app/api/admin/opportunity-customer-members/[id]/route.ts";

    it("picks its authority from the body, so a record edit cannot decide an outcome", () => {
        expect(read(route)).toMatch(/requiredOcmPatchCapability\(body\)/);
        expect(read("web/lib/access/enrollmentAuthority.ts")).toMatch(/OCM_DECISION_BEARING_FIELDS/);
    });

    it("diverts the lifecycle key out of the generic update instead of writing it", () => {
        const text = read(route);
        expect(text).toMatch(/updateOpportunityCustomerMemberLifecycleStatus/);
        // The key is removed from `updates` so the generic .update() cannot persist it directly.
        expect(text).toMatch(/delete\s+updates\.outcome_status_key/);
    });

    it("the two enrollment capabilities remain independent — neither implies the other", () => {
        // This is why the opportunities route cannot be tightened before its callers converge.
        const auth = read("web/lib/access/enrollmentAuthority.ts");
        expect(auth).toMatch(/Neither implies the other/i);
    });
});

describe("D-BP5 — the fresh-lead child disposition is one value everywhere", () => {
    const persistence = "web/lib/admin/actions/createLeadChildOcmPersistence.ts";

    it("the stored fresh-lead key is new_inquiry", () => {
        expect(read("web/lib/admin/actions/createLeadActionConstants.ts")).toContain(
            'export const NEW_LEAD_STATUS_KEY = "new_inquiry"',
        );
    });

    it("the live path persists it through the canonical participation helper", () => {
        expect(read(persistence)).toMatch(/ensureOpportunityCustomerMemberParticipation\(\{/);
        expect(read("web/lib/lifecycle/ensureOpportunityCustomerMemberParticipation.ts")).toMatch(
            /outcome_status_key:\s*params\.outcomeStatusKey\s*\?\?\s*NEW_LEAD_STATUS_KEY/,
        );
    });

    it("the seed fixture builder agrees with production rather than contradicting it", () => {
        // It feeds scripts/seedCanonicalLeadE2eFixture.ts, which INSERTS the row it returns.
        const text = read(persistence);
        expect(text).toMatch(/outcome_status_key:\s*NEW_LEAD_STATUS_KEY/);
        expect(text).not.toMatch(/outcome_status_key:\s*null/);
    });

    it("the fixture builder satisfies its own module's validator", () => {
        // These two contradicted each other before: the builder wrote null, the validator demanded
        // new_inquiry, and the seed only ever called the grain validator so it never fired.
        const validators = read("web/lib/fields/canonicalE2eValidators.ts");
        expect(validators).toMatch(/row\.outcome_status_key !== NEW_LEAD_STATUS_KEY/);
        expect(read(persistence)).toMatch(/outcome_status_key:\s*NEW_LEAD_STATUS_KEY/);
    });
});
