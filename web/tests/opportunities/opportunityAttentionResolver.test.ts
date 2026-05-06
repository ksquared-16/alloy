import { describe, expect, it } from "vitest";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import {
    resolveOpportunityAttention,
    OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER,
    OPPORTUNITY_ATTENTION_RESOLVER_VERSION,
    QUEUE_LANE_EXCLUDED_STATUS_KEYS,
    type OpportunityAttentionReasonCode,
} from "@/lib/opportunities/opportunityAttentionResolver";
import {
    createDefaultOpportunityAttentionResolvedConfig,
    resolveOpportunityAttentionConfigFromMetadata,
} from "@/lib/opportunities/opportunityAttentionConfig";
import {
    computeOpportunityAttentionReason,
    DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1,
} from "@/lib/workspace/opportunityAttentionRules";

const baseDef = (): Omit<StatusDefinitionRow, "status_key" | "metadata"> => ({
    id: "sd1",
    org_id: "org",
    industry_key: null,
    entity_type: "opportunities",
    status_label: null,
    sort_order: 0,
    is_active: true,
    is_system: false,
});

function defFor(sk: string, lifecycle: string): StatusDefinitionRow {
    return {
        ...baseDef(),
        status_key: sk,
        metadata: { lifecycle_stage: lifecycle },
    };
}

describe("resolveOpportunityAttention", () => {
    it("exposes stable priority ordering that includes every canonical code", () => {
        expect(OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER.length).toBe(16);
        const set = new Set(OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER);
        expect(set.size).toBe(16);
    });

    it("reports resolver v2 with waiting facet and priority score fields", () => {
        const nowMs = Date.parse("2026-06-01T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-05-20T12:00:00.000Z",
                metadata: { next_follow_up_at: "2026-05-30T12:00:00.000Z" },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
        });
        expect(r.resolver_version).toBe(OPPORTUNITY_ATTENTION_RESOLVER_VERSION);
        expect(r.waiting.bucket).toBe("none");
        expect(r.waiting.active).toBe(false);
        expect(typeof r.priority_score).toBe("number");
        expect(Array.isArray(r.priority_breakdown)).toBe(true);
        expect(r.reasons[0]?.sla_tier).toBeDefined();
    });

    it("matches QueueService-style follow-up metadata rule", () => {
        const nowMs = Date.parse("2026-06-01T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-05-20T12:00:00.000Z",
                metadata: { next_follow_up_at: "2026-05-30T12:00:00.000Z" },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
        });
        expect(r.needs_attention).toBe(true);
        expect(r.primary_reason?.code).toBe("follow_up_date_passed");
        expect(r.reasons.map((x) => x.code)).toContain("follow_up_date_passed");
    });

    it("matches QueueService-style tour_date passed for tour_scheduled", () => {
        const nowMs = Date.parse("2026-06-02T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "tour_scheduled",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-05-20T12:00:00.000Z",
                metadata: { tour_date: "2026-05-01" },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("tour_scheduled", "qualification")],
        });
        expect(r.needs_attention).toBe(true);
        expect(r.primary_reason?.code).toBe("tour_date_passed");
    });

    it("emits overdue_commitment when commitment_due_at is past", () => {
        const nowMs = Date.parse("2026-06-02T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-06-01T12:00:00.000Z",
                metadata: { commitment_due_at: "2026-06-01T10:00:00.000Z" },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
        });
        expect(r.reasons.map((x) => x.code)).toContain("overdue_commitment");
    });

    it("emits waiting_on_staff from enrollment_operational metadata", () => {
        const nowMs = Date.parse("2026-06-02T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-06-01T12:00:00.000Z",
                metadata: {
                    enrollment_operational: {
                        wait_bucket: "waiting_on_staff",
                        wait_since: "2026-06-01T08:00:00.000Z",
                    },
                },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
        });
        expect(r.waiting.active).toBe(true);
        expect(r.waiting.bucket).toBe("waiting_on_staff");
        expect(r.reasons.map((x) => x.code)).toContain("waiting_on_staff");
    });

    it("does not suppress stale when waiting facet is active", () => {
        const nowMs = Date.parse("2026-06-10T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-05-01T12:00:00.000Z",
                metadata: {
                    enrollment_operational: {
                        wait_bucket: "waiting_on_family",
                        wait_since: "2026-06-08T12:00:00.000Z",
                    },
                },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
        });
        expect(r.reasons.map((x) => x.code)).toContain("waiting_on_family");
        expect(r.reasons.map((x) => x.code)).toContain("mid_funnel_stale");
    });

    it("matches legacy computeOpportunityAttentionReason for intake stale", () => {
        const nowMs = Date.parse("2026-06-05T12:00:00.000Z");
        const created = "2026-06-01T12:00:00.000Z";
        const updated = "2026-06-01T12:00:00.000Z";
        const row = {
            id: "1",
            status_key: "open",
            quote_total: null as number | null,
            created_at: created,
            updated_at: updated,
            metadata: null as Record<string, unknown> | null,
            customer_id: "c1",
            primary_person_id: "p1",
        };
        const defs = [defFor("open", "intake")];
        const legacy = computeOpportunityAttentionReason({
            row,
            defs,
            rules: DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1,
            nowMs,
        });

        const r = resolveOpportunityAttention({
            opportunity: {
                ...row,
                metadata: row.metadata,
            },
            nowMs,
            defs,
        });
        expect(legacy).toBe("stale_new_inquiry");
        expect(r.needs_attention).toBe(true);
        expect(r.reasons.some((x) => x.code === "stale_new_inquiry")).toBe(true);

        expect(
            computeOpportunityAttentionReason({
                row,
                defs,
                rules: DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1,
                /** Just under 48h — threshold is inclusive at 48h in legacy logic. */
                nowMs: Date.parse("2026-06-03T11:59:59.000Z"),
            })
        ).toBe(null);

        expect(
            resolveOpportunityAttention({
                opportunity: { ...row, metadata: row.metadata },
                nowMs: Date.parse("2026-06-03T11:59:59.000Z"),
                defs,
            }).needs_attention
        ).toBe(false);
    });

    it("skips QueueService lane predicates for excluded statuses but still allows lifecycle when active", () => {
        expect(QUEUE_LANE_EXCLUDED_STATUS_KEYS.has("new_inquiry")).toBe(true);

        const nowMs = Date.parse("2026-06-08T18:00:00.000Z");
        const base = {
            id: "1",
            status_key: "new_inquiry",
            created_at: "2026-06-01T12:00:00.000Z",
            updated_at: "2026-06-01T12:00:00.000Z",
            metadata: {
                demo_seed_package: "enrollment_pipeline_demo_v2",
                next_follow_up_at: "2026-06-07T12:00:00.000Z",
            } as Record<string, unknown>,
            customer_id: "c1",
            primary_person_id: null as string | null,
            primary_contact_id: "pc1" as string | null,
        };

        const defs = [defFor("new_inquiry", "intake")];
        const r = resolveOpportunityAttention({
            opportunity: base,
            nowMs,
            defs,
        });

        expect(r.reasons.map((x) => x.code)).not.toContain("follow_up_date_passed");
        expect(r.reasons.map((x) => x.code)).toContain("stale_new_inquiry");
        expect(r.needs_attention).toBe(true);
    });

    it("returns no lane reasons when updated_at is invalid (QueueService lane parity) but lifecycle may still apply", () => {
        const nowMs = Date.parse("2026-06-10T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "open",
                created_at: "2026-06-01T12:00:00.000Z",
                updated_at: "not-a-date",
                metadata: null,
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("open", "intake")],
        });
        expect(r.reasons.some((c) => c.code === "missing_identity")).toBe(false);
        expect(r.reasons.some((c) => c.code === "stale_new_inquiry")).toBe(true);
    });

    it("respects config policy disablement", () => {
        const cfg = createDefaultOpportunityAttentionResolvedConfig();
        cfg.policies.follow_up_date_passed = { enabled: false, severity: "high" };

        const nowMs = Date.parse("2026-06-01T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-05-20T12:00:00.000Z",
                metadata: { next_follow_up_at: "2026-05-30T12:00:00.000Z" },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
            config: cfg,
        });
        expect(r.reasons.map((x) => x.code)).not.toContain("follow_up_date_passed");
    });

    it("parses metadata extensions without requiring full v1 threshold object", () => {
        const meta = {
            opportunity_attention_rules: {
                reason_overrides: {
                    follow_up_date_passed: { label: "Follow-up overdue" },
                },
            },
        };
        const cfg = resolveOpportunityAttentionConfigFromMetadata(meta);
        const nowMs = Date.parse("2026-06-01T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-05-20T12:00:00.000Z",
                metadata: { next_follow_up_at: "2026-05-30T12:00:00.000Z" },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
            config: cfg,
        });
        expect(r.primary_reason?.label).toBe("Follow-up overdue");
    });

    it("does not promote activity stale into core reasons (v1)", () => {
        const nowMs = Date.parse("2026-06-01T12:00:00.000Z");
        const cfg = createDefaultOpportunityAttentionResolvedConfig();
        cfg.auxiliary_signals_enabled = true;

        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-06-01T12:00:00.000Z",
                updated_at: "2026-06-01T18:00:00.000Z",
                metadata: null,
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
            config: cfg,
            optionalSignals: {
                activityStale: {
                    key: "x",
                    label: "Stale (activity)",
                    severity: "high",
                    threshold_minutes: 60,
                },
            },
        });
        expect(r.needs_attention).toBe(false);
        expect(r.auxiliary.activity_stale?.label).toBe("Stale (activity)");
    });

    it("sorts multi-reason outputs by canonical platform priority order", () => {
        const codes: OpportunityAttentionReasonCode[] = ["stale_new_inquiry", "follow_up_date_passed"];
        codes.sort((a, b) => {
            const ia = OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER.indexOf(a as never);
            const ib = OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER.indexOf(b as never);
            return ia - ib;
        });
        expect(codes[0]).toBe("follow_up_date_passed");
    });

    it("blocked_internal wins primary over follow-up when both fire", () => {
        const nowMs = Date.parse("2026-06-01T12:00:00.000Z");
        const r = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-05-20T12:00:00.000Z",
                metadata: {
                    next_follow_up_at: "2026-05-30T12:00:00.000Z",
                    enrollment_operational: { wait_bucket: "blocked_internal", wait_since: "2026-05-31T12:00:00.000Z" },
                },
                customer_id: "c1",
                primary_person_id: "p1",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
        });
        expect(r.primary_reason?.code).toBe("blocked_internal");
    });
});
