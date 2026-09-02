/**
 * CREATE LEAD ANCHORS ITS CHILD'S JOURNEY TO THE PARTICIPATION.
 *
 * The Completion Anchor convergence reached Start Enrollment and did not reach this path, so a
 * child arriving through ACQUISITION got a journey anchored to the Opportunity. Live certification
 * found it: Path B's participation was genuinely Opportunity-backed, yet its journey carried
 * `context_type = opportunity`, and Start Enrollment then reused that legacy-shaped journey instead
 * of creating a canonical one. Two symptoms, one root.
 *
 * These pin the write path, and pin that legacy history still reads.
 */

import { describe, expect, it } from "vitest";

const SOURCE = () =>
    import("node:fs/promises").then((fs) =>
        fs.readFile(
            new URL("../../lib/admin/actions/createLeadChildOcmPersistence.ts", import.meta.url),
            "utf8",
        ),
    );

describe("the new write path uses the canonical participation anchor", () => {
    it("anchors the journey to the participation, not the Opportunity", async () => {
        const src = await SOURCE();
        expect(src).toContain("contextType: ENROLLMENT_PARTICIPATION_CONTEXT_TYPE");
        expect(src).toContain("contextId: participation.ocmId");
        // The old shape, which put an Opportunity id in the journey's context.
        expect(src).not.toContain("contextId: params.opportunityId");
    });

    it("creates the participation through the canonical find-or-create, never a direct insert", async () => {
        const src = await SOURCE();
        expect(src).toContain("ensureOpportunityCustomerMemberParticipation");
        // A direct insert would bypass the episode-scoped uniqueness the ensurer owns.
        expect(src).not.toMatch(/from\("opportunity_customer_members"\)\s*\.insert/);
    });

    it("keeps the acquisition Opportunity reachable rather than discarding it", async () => {
        const src = await SOURCE();
        // On the participation, and threaded to the journey as acquisition provenance.
        expect(src).toContain("opportunityId: params.opportunityId");
        expect(src).toContain("acquisitionOpportunityId: params.opportunityId");
    });

    it("returns the participation it made, so callers stop seeing a null bridge", async () => {
        const src = await SOURCE();
        expect(src).toContain("ocm_id: participation.ocmId");
        expect(src).not.toContain("ocm_id: null");
    });
});

describe("legacy Opportunity-anchored history still resolves", () => {
    it("the journey resolver still reads all three context shapes", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            new URL("../../lib/enrollment/completion/resolveEnrollmentJourneyContext.ts", import.meta.url),
            "utf8",
        );
        /*
         * Concluded history is NOT migrated for uniformity, so the resolver must keep reading the
         * older shape. A fix that made new writes canonical by making old ones unreadable would
         * trade one defect for a worse one.
         */
        expect(src).toContain("ENROLLMENT_PARTICIPATION_CONTEXT_TYPE");
        expect(src).toContain("ENROLLMENT_CONTEXT_TYPE");
        expect(src).toContain("subject_lookup");
    });
});
