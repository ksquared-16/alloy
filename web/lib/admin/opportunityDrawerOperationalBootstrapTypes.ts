import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import type { OperationalSummaryRiskHint } from "@/lib/ai/enrichmentContracts";

/** Client-hint echo only (v1) — not full operational attention. */
export type DrawerOperTrustPreviewV1 = {
    headline: string;
    risk_urgency_hint: OperationalSummaryRiskHint;
};

export type OpportunityDrawerBootstrapRecordLayout = {
    source: "org_drawer_override" | "global_template";
    key: string;
    config_json: RecordLayoutConfigJson;
    inquiry_drawer_mode: "workflow_v1" | "classic";
};

export type OpportunityDrawerOperationalBootstrapResponse = {
    entity: Record<string, unknown>;
    record_layout: OpportunityDrawerBootstrapRecordLayout | null;
    record_header_actions: ResolvedActionsBySlot | null;
    work_unit: {
        id: string;
        department_id: string;
        queue_definition: unknown;
    } | null;
    workspace_scope: {
        department_id: string | null;
        work_unit_id: string | null;
    };
    oper_trust_preview: DrawerOperTrustPreviewV1 | null;
    /** Optional display-only readiness (Phase 1 — not required for drawer reveal). */
    readiness?: ReadinessResult | null;
    timing: {
        route_gate_ms: number;
        phases_ms: Record<string, number>;
        attention_resolver_passes: 0;
    };
};
