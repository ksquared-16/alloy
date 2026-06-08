import { describe, expect, it } from "vitest";

import { computeOperationalAttentionAttachment } from "@/lib/admin/operationalAttentionEntityAttachment";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

const def = (sk: string, life: string): StatusDefinitionRow => ({
    id: "d1",
    org_id: "o1",
    industry_key: null,
    entity_type: "opportunities",
    status_key: sk,
    status_label: sk,
    sort_order: 0,
    is_active: true,
    is_system: false,
    metadata: { lifecycle_stage: life },
});

describe("computeOperationalAttentionAttachment activity wiring", () => {
    it("passes stale_signal into resolver optionalSignals when auxiliary enabled", () => {
        const defs: StatusDefinitionRow[] = [
            def("new_inquiry", "intake"),
            def("contacted", "qualification"),
        ];
        const opportunityRow = {
            id: "opp-x",
            status_key: "new_inquiry",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            metadata: {},
            customer_id: "c1",
            primary_person_id: "p1",
            primary_contact_id: null,
        };
        const meta = {
            opportunity_attention_rules: {
                auxiliary_signals_enabled: true,
            },
        };
        const activitySignal = {
            last_activity_at: "2026-01-02T00:00:00Z",
            last_activity_type: "note_added",
            last_activity_summary: "Note added",
            stale_signal: {
                key: "idle_rule",
                label: "No touchpoint",
                severity: "medium" as const,
                threshold_minutes: 60,
            },
        };
        const out = computeOperationalAttentionAttachment({
            opportunityRow,
            defs,
            attentionConfigMetadata: meta,
            activitySignal,
            nowMs: Date.parse("2026-05-13T12:00:00Z"),
        });
        expect(out._operational_attention_error).toBeNull();
        expect(out._operational_attention?.auxiliary.activity_stale?.key).toBe("idle_rule");
    });

    it("omits auxiliary activity when stale_signal absent", () => {
        const defs: StatusDefinitionRow[] = [def("new_inquiry", "intake")];
        const opportunityRow = {
            id: "opp-y",
            status_key: "new_inquiry",
            created_at: "2026-05-13T00:00:00Z",
            updated_at: "2026-05-13T00:00:00Z",
            metadata: {},
            customer_id: "c1",
            primary_person_id: "p1",
            primary_contact_id: null,
        };
        const out = computeOperationalAttentionAttachment({
            opportunityRow,
            defs,
            attentionConfigMetadata: {
                opportunity_attention_rules: { auxiliary_signals_enabled: true },
            },
            activitySignal: {
                last_activity_at: "2026-05-13T01:00:00Z",
                last_activity_type: "note_added",
                last_activity_summary: "Note",
                stale_signal: null,
            },
            nowMs: Date.parse("2026-05-13T12:00:00Z"),
        });
        expect(out._operational_attention?.auxiliary.activity_stale).toBeNull();
    });
});
