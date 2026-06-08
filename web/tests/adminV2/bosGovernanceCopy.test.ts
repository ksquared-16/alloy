import { describe, expect, it } from "vitest";

import {
    CONFIG_ASSIST_APPLY_PERMISSION_COPY,
    formatBosPolicyDenialPlainText,
    OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY,
    resolveBosPolicyDenial,
    STALE_OPERATIONAL_PROPOSAL_MESSAGE,
    WORKFLOW_ASSIST_MUTATION_BLOCKED_COPY,
} from "@/lib/adminV2/bos/bosGovernanceCopy";

const FORBIDDEN = [/Mutation denied/i, /Policy violation/i, /Portal blocked/i, /Capability disabled/i, /AI selected/i];

function expectOperationalGovernanceCopy(text: string) {
    for (const pattern of FORBIDDEN) {
        expect(text).not.toMatch(pattern);
    }
}

describe("bosGovernanceCopy", () => {
    it("stale proposal message explains record mismatch", () => {
        expect(STALE_OPERATIONAL_PROPOSAL_MESSAGE).toMatch(/different active record/i);
        expectOperationalGovernanceCopy(STALE_OPERATIONAL_PROPOSAL_MESSAGE);
    });

    it("workflow review-only copy is org-policy wording", () => {
        expect(WORKFLOW_ASSIST_MUTATION_BLOCKED_COPY).toMatch(/review-only workflow recommendations/i);
        expectOperationalGovernanceCopy(WORKFLOW_ASSIST_MUTATION_BLOCKED_COPY);
    });

    it("resolveBosPolicyDenial task assist unavailable is structured", () => {
        const d = resolveBosPolicyDenial("task_assist_unavailable");
        expect(d.headline).toBe("Not available");
        expect(d.bullets.length).toBeGreaterThan(0);
        expectOperationalGovernanceCopy(formatBosPolicyDenialPlainText(d));
    });

    it("resolveBosPolicyDenial workflow review-only mentions admin", () => {
        const d = resolveBosPolicyDenial("workflow_assist_review_only");
        expect(d.headline).toBe("Review only");
        expect(formatBosPolicyDenialPlainText(d)).toMatch(/admin/i);
        expectOperationalGovernanceCopy(formatBosPolicyDenialPlainText(d));
    });

    it("stale frame default is operator guidance not security jargon", () => {
        expect(OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY).toMatch(/Blocked/i);
        expect(OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY).toMatch(/record/i);
        expectOperationalGovernanceCopy(OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY);
    });

    it("config apply permission copy matches settings path", () => {
        expect(CONFIG_ASSIST_APPLY_PERMISSION_COPY).toMatch(/configuration assist permissions/i);
        expectOperationalGovernanceCopy(CONFIG_ASSIST_APPLY_PERMISSION_COPY);
    });
});
