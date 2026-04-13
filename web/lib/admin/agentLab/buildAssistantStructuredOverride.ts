import type { AssistantParsed } from "@/lib/admin/agentLab/parseAssistantCommand";
import { mergeFinancialBandEnabled } from "@/lib/admin/agentLab/mergeFinancialBandOverview";
import { runOverviewLayoutSemanticPreview } from "@/lib/admin/agentLab/overviewLayoutSemanticAssistant";
import type { JobOverviewPlannerFailure, JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";

export type BuiltAssistantPayload =
    | {
          route: "v2";
          label: string;
          structured_override: Record<string, unknown>;
      }
    | {
          route: "v1";
          label: string;
          structured_override: Record<string, unknown>;
          /** Present when preview came from `planJobOverviewLayoutRequest`. */
          semanticPlanner?: JobOverviewPlannerSuccess;
      };

function newIntent() {
    return {
        intent_id: crypto.randomUUID(),
        intent_version: 1 as const,
    };
}

/** Build structured_override for v2 field visibility (caller supplies lock from GET field row). */
export function buildFieldVisibilityStructuredOverrideParts(
    fieldDefinitionId: string,
    expectedUpdatedAt: string,
    visibilityPatch: Record<string, boolean>
): Record<string, unknown> {
    const { intent_id, intent_version } = newIntent();
    return {
        intent_id,
        intent_version,
        intent_type: "update_field_visibility",
        slots: {
            target_kind: "field_definition_visibility",
            field_definition_id: fieldDefinitionId,
            expected_updated_at: expectedUpdatedAt,
            visibility_patch: { version: 1, ...visibilityPatch },
        },
    };
}

/** Build structured_override for v1 record overview layout. */
export function buildRecordLayoutStructuredOverrideParts(
    config: Record<string, unknown>,
    expectedConfigVersion: number
): Record<string, unknown> {
    const { intent_id, intent_version } = newIntent();
    return {
        intent_id,
        intent_version,
        intent_type: "update_record_layout",
        slots: {
            target_kind: "record_overview_layout",
            entity_type: "job",
            surface: "overview",
            config,
            expected_config_version: expectedConfigVersion,
        },
    };
}

export type BuildAssistantPayloadFailure = {
    ok: false;
    error: string;
    /** Set when `overview_layout_semantic` did not produce a proposal. */
    semanticPlannerFailure?: JobOverviewPlannerFailure;
};

export function buildAssistantPayload(
    parsed: AssistantParsed,
    ctx: {
        fieldDefinitionId: string;
        expectedUpdatedAt: string;
        overviewConfigRaw: unknown;
    }
): { ok: true; payload: BuiltAssistantPayload } | BuildAssistantPayloadFailure {
    if (parsed.kind === "field_table") {
        const hide = parsed.action === "hide";
        const vis = { is_visible_in_table: !hide };
        return {
            ok: true,
            payload: {
                route: "v2",
                label: `${parsed.action} table visibility for field`,
                structured_override: buildFieldVisibilityStructuredOverrideParts(ctx.fieldDefinitionId, ctx.expectedUpdatedAt, vis),
            },
        };
    }
    if (parsed.kind === "field_drawer") {
        const hide = parsed.action === "hide";
        const vis = { is_visible_in_drawer: !hide };
        return {
            ok: true,
            payload: {
                route: "v2",
                label: `${parsed.action} drawer visibility for field`,
                structured_override: buildFieldVisibilityStructuredOverrideParts(ctx.fieldDefinitionId, ctx.expectedUpdatedAt, vis),
            },
        };
    }
    if (parsed.kind === "overview_financial") {
        const enabled = parsed.action === "show";
        const merged = mergeFinancialBandEnabled(ctx.overviewConfigRaw, enabled);
        if (!merged.ok) {
            return { ok: false, error: merged.error };
        }
        return {
            ok: true,
            payload: {
                route: "v1",
                label: `${parsed.action} financial band on job overview`,
                structured_override: buildRecordLayoutStructuredOverrideParts(
                    merged.config as Record<string, unknown>,
                    merged.expected_config_version
                ),
            },
        };
    }
    if (parsed.kind === "overview_layout_semantic") {
        const prev = runOverviewLayoutSemanticPreview(parsed.text, ctx.overviewConfigRaw);
        if (!prev.ok) {
            return {
                ok: false,
                error: prev.error,
                semanticPlannerFailure: prev.planner,
            };
        }
        return {
            ok: true,
            payload: {
                route: "v1",
                label: "Semantic job overview layout (preview)",
                structured_override: prev.structured_override,
                semanticPlanner: prev.planner,
            },
        };
    }
    return { ok: false, error: "Unsupported parse kind." };
}
