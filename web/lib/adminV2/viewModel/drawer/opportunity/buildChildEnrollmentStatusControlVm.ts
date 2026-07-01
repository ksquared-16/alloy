import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    buildProgressiveEnrollmentStatusMenu,
    isProgressiveEnrollmentStatusEnabled,
    progressiveMenuToFlatOptions,
} from "@/lib/lifecycle/progressiveEnrollmentStatusSelector";

const FAMILY_TRACK_STAGE_KEYS = new Set(["lead", "qualification", "tour", "decision", "closed"]);

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function childTrackStages(stages: LifecycleBuilderStageRecord[]): LifecycleBuilderStageRecord[] {
    return stages.filter((s) => {
        if (s.is_active === false) return false;
        if (s.track_key === "child_track") return true;
        return !FAMILY_TRACK_STAGE_KEYS.has(s.key);
    });
}

export function buildChildEnrollmentStatusControlVm(params: {
    currentStatusKey: string;
    statusDefs: StatusDefinitionRow[];
    configuredStages?: LifecycleBuilderStageRecord[] | null;
}): StatusControlVm {
    const activeDefs = params.statusDefs.filter((d) => d.is_active);
    const statusKey = trimOrNull(params.currentStatusKey) ?? "";
    const label =
        activeDefs.find((d) => d.status_key === statusKey)?.status_label?.trim() ??
        statusKey ??
        "—";

    const allStages = params.configuredStages?.filter((s) => s.is_active !== false) ?? [];
    const childStages = childTrackStages(allStages);
    const useProgressive = isProgressiveEnrollmentStatusEnabled(childStages);

    const progressive_menu = useProgressive
        ? buildProgressiveEnrollmentStatusMenu({
              statusDefs: activeDefs,
              currentStatusKey: statusKey,
              configuredStages: childStages,
          })
        : undefined;

    const options =
        useProgressive && progressive_menu?.length
            ? progressiveMenuToFlatOptions(progressive_menu)
            : activeDefs
                  .map((d) => ({
                      status_key: d.status_key,
                      label: trimOrNull(d.status_label) ?? d.status_key,
                      sort_order: d.sort_order ?? 0,
                  }))
                  .sort((a, b) =>
                      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.label.localeCompare(b.label)
                  );

    if (options.length >= 2) {
        return {
            renderAs: "dropdown",
            status_key: statusKey,
            label,
            options,
            ...(progressive_menu?.length ? { progressive_menu } : {}),
        };
    }

    return {
        renderAs: "readonly_pill",
        label,
        status_key: statusKey || undefined,
    };
}
