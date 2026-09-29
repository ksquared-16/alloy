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
import { readFileSync, readdirSync, statSync } from "node:fs";
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
    /** Client files that PATCH the opportunity route with a lifecycle status key. */
    function lifecyclePatchSenders(): string[] {
        const senders: string[] = [];
        for (const rel of walk("web/components", (f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))) {
            const text = read(rel);
            if (!/\/api\/admin\/opportunities\//.test(text)) continue;
            if (!/method:\s*"PATCH"/.test(text)) continue;
            // `status_key:` as a sent body field (not `next_status_key`, which is the preflight input)
            if (/(?<!next_)status_key\s*:/.test(text)) senders.push(rel);
        }
        return senders.sort();
    }

    it("is exactly the two known senders — a third one fails this test on purpose", () => {
        expect(lifecyclePatchSenders()).toEqual([
            "web/components/admin/focusPanel/cards/CurrentWorkStageTransitionPanel.tsx",
            "web/components/admin/quoteIntake/OpportunityQuoteIntakeSection.tsx",
        ]);
    });

    it("the generic opportunity route still never writes stage_key", () => {
        // Stage movement stays intake/outcome-owned even though status does not.
        expect(read("web/app/api/admin/opportunities/[id]/route.ts")).not.toMatch(/stage_key\s*:/);
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
