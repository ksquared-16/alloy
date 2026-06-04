import type { DrawerSectionRenderModel } from "@/lib/adminV2/drawerPipeline/types";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { opportunityDrawerFirstPaintContractValid } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelFirstPaint";

/** Bump when compose semantics change (shadow diff tooling). */
export const OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION = "1.2.0";

const FORBIDDEN_ABOVE_FOLD_VALUE_PHASES = new Set(["skeleton", "pending"]);

export function opportunityDrawerViewModelStructureSettled(
    vm: Pick<OpportunityDrawerViewModel, "structureSettled" | "above_fold" | "first_paint" | "layout">
): boolean {
    if (!vm.structureSettled) return false;
    if (!opportunityDrawerFirstPaintContractValid(vm)) return false;
    return aboveFoldSectionsStructureSettled(vm.above_fold.render_model.sections);
}

export function aboveFoldSectionsStructureSettled(sections: DrawerSectionRenderModel[]): boolean {
    for (const section of sections) {
        if (section.lifecycle === "hidden" || section.lifecycle === "below_fold_deferred") continue;
        if (FORBIDDEN_ABOVE_FOLD_VALUE_PHASES.has(section.value_phase)) return false;
    }
    return true;
}

export function isClassicLayoutDeferredReason(
    reason: string
): reason is "classic_layout_deferred" {
    return reason === "classic_layout_deferred";
}

/** Record fields that must not leak into VM paint payload. */
export const OPPORTUNITY_DRAWER_VM_STRIP_RECORD_KEYS = [
    "_record_surface",
    "_operational_attention_deferred",
    "_drawer_primary_phase_ms",
] as const;

export function stripOpportunityDrawerRecordStaging(record: Record<string, unknown>): Record<string, unknown> {
    const out = { ...record };
    for (const key of OPPORTUNITY_DRAWER_VM_STRIP_RECORD_KEYS) {
        delete out[key];
    }
    return out;
}
