import { describe, expect, it } from "vitest";

import {
    buildGroundedUrgencyReasonLine,
    formatIntakeAgePhrase,
    intakeAgeDaysFromRow,
    roughDaysBetween,
} from "@/lib/adminV2/bos/recommendations/operationalTimingCopy";
import { buildOperationalRecommendationAttachInput } from "@/lib/adminV2/bos/recommendations/adapters/extractGroundingSignalsFromAttention";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

const NOW = Date.parse("2026-05-21T12:00:00.000Z");

function minimalAttention(slaTier: "ok" | "approaching" | "breached" = "breached"): OpportunityAttentionResult {
    return {
        needs_attention: true,
        reasons: [
            {
                code: "stale_new_inquiry",
                label: "New inquiry is stale",
                severity: "medium",
                sla_tier: slaTier,
                sla_clock_confidence: "high",
            },
        ],
        primary_reason: {
            code: "stale_new_inquiry",
            label: "New inquiry is stale",
            severity: "medium",
            sla_tier: slaTier,
            sla_clock_confidence: "high",
        },
        waiting: { bucket: "none", since_iso: null, active: false },
        priority_score: 42,
        priority_breakdown: [],
        auxiliary: { activity_stale: null },
        resolver_version: 2,
        computed_at_iso: "2026-05-21T10:00:00.000Z",
    };
}

describe("operationalTimingCopy", () => {
    it("computes intake age from created_at, not updated_at", () => {
        const created = new Date(NOW - 24 * 24 * 60 * 60 * 1000).toISOString();
        const updated = new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString();
        expect(intakeAgeDaysFromRow({ created_at: created, updated_at: updated }, NOW)).toBe(24);
        expect(roughDaysBetween(NOW, updated)).toBe(1);
    });

    it("formats grounded intake age phrase", () => {
        expect(formatIntakeAgePhrase(24)).toBe("24 days since the inquiry was created");
        expect(formatIntakeAgePhrase(1)).toBe("1 day since the inquiry was created");
    });

    it("only claims response window exceeded when SLA tier is breached", () => {
        expect(buildGroundedUrgencyReasonLine("breached", "24 days since the inquiry was created")).toBe(
            "Response window exceeded · 24 days since the inquiry was created"
        );
        expect(buildGroundedUrgencyReasonLine("approaching", "2 days since the inquiry was created")).toBe(
            "First-response window due soon · 2 days since the inquiry was created"
        );
        expect(buildGroundedUrgencyReasonLine("ok", "3 days since the inquiry was created")).toBe(
            "3 days since the inquiry was created"
        );
    });

    it("attach input uses created_at for template days and urgency_reason_line", () => {
        const created = new Date(NOW - 24 * 24 * 60 * 60 * 1000).toISOString();
        const input = buildOperationalRecommendationAttachInput({
            orgId: "org-1",
            opportunityRow: {
                id: "opp-1",
                status_key: "new_inquiry",
                created_at: created,
                updated_at: new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString(),
            },
            attention: minimalAttention("breached"),
            activity: null,
            catalogKey: "stale_new_inquiry",
            nowMs: NOW,
        });
        expect(input.template_values.days).toBe(24);
        expect(input.template_values.intake_age_phrase).toContain("24 days since the inquiry was created");
        expect(input.template_values.urgency_reason_line).toContain("Response window exceeded");
        expect(String(input.template_values.urgency_reason_line)).not.toContain("Families often");
    });
});
