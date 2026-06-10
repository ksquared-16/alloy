import { resolveOpportunityStatusDisplay } from "@/lib/admin/drawer/opportunityStatusDisplayResolve";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { OPPORTUNITY_CASE_STATUS_KEYS } from "@/lib/admin/statusReseed/statusMvpCatalog";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    buildProgressiveEnrollmentStatusMenu,
    isProgressiveEnrollmentStatusEnabled,
    progressiveMenuToFlatOptions,
} from "@/lib/lifecycle/progressiveEnrollmentStatusSelector";

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
    configuredStages?: LifecycleBuilderStageRecord[] | null;
}): StatusControlVm {
    if (params.layoutMode !== "workflow_v1") {
        return { renderAs: "hidden" };
    }

    const activeDefs = params.statusDefs.filter(
        (d) => d.is_active && OPPORTUNITY_CASE_STATUS_KEYS.has(d.status_key)
    );
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

    const stageRecords: LifecycleBuilderStageRecord[] =
        params.configuredStages?.filter((s) => s.is_active !== false) ??
        [];

    const useProgressive = isProgressiveEnrollmentStatusEnabled(stageRecords);
    const progressive_menu = useProgressive
        ? buildProgressiveEnrollmentStatusMenu({
              statusDefs: activeDefs,
              currentStatusKey: statusKey ?? "",
              configuredStages: stageRecords,
          })
        : undefined;

    const options = useProgressive && progressive_menu?.length
        ? progressiveMenuToFlatOptions(progressive_menu)
        : activeDefs
              .map((d) => ({
                  status_key: d.status_key,
                  label: trimOrNull(d.status_label) ?? d.status_key,
                  sort_order: d.sort_order ?? 0,
              }))
              .sort((a, b) =>
                  a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.label.localeCompare(b.label),
              );

    if (options.length >= 2) {
        return {
            renderAs: "dropdown",
            status_key: statusKey ?? "",
            label,
            options,
            ...(progressive_menu?.length ? { progressive_menu } : {}),
        };
    }

    return {
        renderAs: "readonly_pill",
        label,
        status_key: statusKey ?? undefined,
    };
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
