import { resolveOpportunityStatusDisplay } from "@/lib/admin/drawer/opportunityStatusDisplayResolve";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function opportunityStatusKey(record: Record<string, unknown>): string | null {
    const sk = record.status_key;
    if (sk != null && String(sk).trim()) return String(sk).trim();
    const legacy = record.status;
    if (legacy != null && String(legacy).trim()) return String(legacy).trim();
    return null;
}

export function buildOpportunityStatusControlVm(params: {
    record: Record<string, unknown>;
    statusDefs: StatusDefinitionRow[];
    layoutMode: "classic" | "workflow_v1";
}): StatusControlVm {
    if (params.layoutMode !== "workflow_v1") {
        return { renderAs: "hidden" };
    }

    const activeDefs = params.statusDefs.filter((d) => d.is_active);
    const statusKey = opportunityStatusKey(params.record);
    const pipelineStageId = trimOrNull(params.record.pipeline_stage_id);
    const pipelineStageName = trimOrNull(params.record._pipeline_stage_name);
    const label =
        resolveOpportunityStatusDisplay({
            statusKey,
            legacyStatus: params.record.status as string | null | undefined,
            statusDefs: activeDefs,
            pipelineStageId,
            pipelineStageName,
        }) ?? statusKey ?? "—";

    if (activeDefs.length >= 2) {
        return {
            renderAs: "dropdown",
            status_key: statusKey ?? "",
            label,
            options: activeDefs
                .map((d) => ({
                    status_key: d.status_key,
                    label: trimOrNull(d.status_label) ?? d.status_key,
                    sort_order: d.sort_order ?? 0,
                }))
                .sort((a, b) =>
                    a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.label.localeCompare(b.label)
                ),
        };
    }

    return { renderAs: "readonly_pill", label };
}

export function buildOpportunityDrawerHeaderTitle(record: Record<string, unknown>): string {
    return (
        trimOrNull(record.name) ??
        trimOrNull(record.title) ??
        trimOrNull(record._customer_name) ??
        "—"
    );
}

export function buildOpportunityDrawerHeaderSubtitle(record: Record<string, unknown>): string | null {
    const stage = trimOrNull(record._pipeline_stage_name);
    if (stage) return stage;
    return trimOrNull(record._status_display);
}
