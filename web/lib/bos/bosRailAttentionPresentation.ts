import type { AdminDrawerState } from "@/contexts/AdminDrawerContext";
import type { GlobalAssistantEntityContext } from "@/contexts/GlobalAssistantContext";
import { getRecommendationDrawerStrip } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { peekOpportunityDrawerDisplayVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerPayloadPeekSeed";

export type BosRailAttentionPresentation = {
    title: string;
    summary: string;
    ctaLabel: string;
    /** Starter prompt when operator clicks the CTA */
    ctaPrompt: string;
};

/**
 * Resolve attention copy from the open opportunity drawer VM (no new context architecture).
 */
export function resolveBosRailAttentionPresentation(args: {
    drawer: AdminDrawerState;
    currentContext: GlobalAssistantEntityContext | null;
}): BosRailAttentionPresentation | null {
    if (!args.currentContext || args.currentContext.entity_type !== "opportunities") return null;
    if (args.drawer.type !== "opportunities" || !args.drawer.id) return null;
    if (args.drawer.id !== args.currentContext.entity_id) return null;

    const vm = peekOpportunityDrawerDisplayVm(args.drawer);
    if (!vm || vm.entity.id !== args.currentContext.entity_id) return null;

    const strip = getRecommendationDrawerStrip(vm.above_fold.record);
    if (strip?.operationalRead?.trim()) {
        return {
            title: "Attention Needed",
            summary: strip.operationalRead.trim(),
            ctaLabel: "View missing items",
            ctaPrompt: "What information is missing?",
        };
    }

    const attention = vm.summaries.attention;
    if (attention?.needs_attention && attention.primary_reason?.trim()) {
        return {
            title: "Attention Needed",
            summary: attention.primary_reason.trim(),
            ctaLabel: "View missing items",
            ctaPrompt: "What information is missing?",
        };
    }

    const bosSummary = vm.summaries.bos;
    if (bosSummary?.operational_read?.trim()) {
        return {
            title: "Attention Needed",
            summary: bosSummary.operational_read.trim(),
            ctaLabel: "View missing items",
            ctaPrompt: "What needs attention?",
        };
    }

    return null;
}
