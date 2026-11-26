/**
 * A STATUS KEY MAY ONLY BE FILTERED ON AN ENTITY WHOSE CATALOG DEFINES IT.
 *
 * The Waitlist lane returns nothing in a correctly configured tenant. Not because of one record's
 * data: because `waitlisted` is a child/member status and the lane filters it at family grain.
 *
 * Measured from the deployed tenant's own catalog:
 *
 *     status-definitions?entity_type=opportunities
 *         open, closed, inactive, archived
 *     status-definitions?entity_type=opportunity_customer_members
 *         waitlisted, enrolling, enrolled, withdrawn, not_enrolling
 *
 * and `queryLifecycleVisibleWaitlistOpportunities` runs
 * `.from("opportunities").in("status_key", ["waitlisted"])`, which no legal opportunity satisfies.
 *
 * The department filter audit cannot see this. It compares the sync's output against the sync's own
 * input and reports pass=true — it never asks whether the key is legal for the entity being filtered.
 * That is exactly the gap this test closes.
 */
import { describe, expect, it } from "vitest";

import { applyStatusKeysToLifecycleStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { buildLifecycleStageQueueDefinitionForPresentation } from "@/lib/lifecycle/lifecycleStageQueuePresentation";

/** The opportunity status catalog, post status-collapse. Confirmed against the deployed tenant. */
const LEGAL_OPPORTUNITY_STATUSES = ["open", "closed", "inactive", "archived"];

type Filter = { type?: string; values?: unknown[] };

function filterValues(queueDefinition: Record<string, unknown>, type: string): string[] {
    const queues = (queueDefinition.queues ?? []) as Record<string, unknown>[];
    const out: string[] = [];
    for (const q of queues) {
        for (const f of (q.filters ?? []) as Filter[]) {
            if (f?.type !== type) continue;
            for (const v of f.values ?? []) out.push(String(v).trim().toLowerCase());
        }
    }
    return out;
}

const definitionFor = (stageKey: string, label: string, statusKeys: string[]) =>
    applyStatusKeysToLifecycleStageQueueDefinition(
        buildLifecycleStageQueueDefinitionForPresentation({ stageKey, label, statusKeys }),
        statusKeys,
        stageKey,
    );

describe("generated lifecycle queue filters", () => {
    /*
     * The case-grain lane is the control. If this ever goes red the test itself is wrong, not the
     * translator — `open` is a legal opportunity status and belongs in a family-grain filter.
     */
    it("keeps a case-grain stage's family statuses in case_status", () => {
        const def = definitionFor("lead", "Lead", ["open"]);
        expect(filterValues(def, "case_status")).toContain("open");
        for (const v of filterValues(def, "case_status")) {
            expect(LEGAL_OPPORTUNITY_STATUSES, `"${v}" must be a legal opportunity status`).toContain(v);
        }
    });

    /*
     * THE DEFECT. `it.fails` asserts this body currently throws — the test is red-by-construction
     * while the translator is broken, and it turns RED THE MOMENT THE DEFECT IS FIXED, which forces
     * whoever repairs the translator to convert it to a plain `it`. A skipped test would simply rot.
     */
    it.fails("must not put a child-grain status into a family-grain filter (known defect)", () => {
        const def = definitionFor("waitlist", "Waitlist", ["waitlisted"]);
        for (const v of filterValues(def, "case_status")) {
            expect(
                LEGAL_OPPORTUNITY_STATUSES,
                `"${v}" is filtered on opportunities.status_key but is not a legal opportunity status`,
            ).toContain(v);
        }
    });

    /*
     * THE TRANSLATOR IS SHARED, SO WAITLIST IS NOT THE ONLY CASUALTY.
     *
     * `enrolling` is also an `opportunity_customer_members` status, and the Enrolling lane is worse
     * off than Waitlist: it gets the illegal `case_status` filter and NO child-grain filter at all.
     * The deployed tenant measures `lifecycle_wu_enrolling` at count 0, for this reason rather than
     * for want of enrolling children. Repairing only Waitlist would leave this one broken.
     */
    it.fails("must not put a child-grain status into a family-grain filter — enrolling (known defect)", () => {
        const def = definitionFor("enrollment", "Enrolling", ["enrolling"]);
        for (const v of filterValues(def, "case_status")) {
            expect(
                LEGAL_OPPORTUNITY_STATUSES,
                `"${v}" is filtered on opportunities.status_key but is not a legal opportunity status`,
            ).toContain(v);
        }
    });

    /* Where the child status should land instead, once the translator is grain-aware. */
    it.fails("must route a child-grain stage's statuses to child_lifecycle_status (known defect)", () => {
        const def = definitionFor("waitlist", "Waitlist", ["waitlisted"]);
        expect(filterValues(def, "case_status")).toHaveLength(0);
        expect(filterValues(def, "child_lifecycle_status")).toContain("waitlisted");
    });
});
