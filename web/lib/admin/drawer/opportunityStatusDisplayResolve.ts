import { isUuidLike } from "@/lib/admin/overviewRelationshipLabels";
import { displayLabelsFromDefinitions, resolveDisplayFromLabelMap } from "@/lib/admin/statusDefinitionsResolve";

export type OpportunityStatusDefLike = {
    status_key: string;
    status_label?: string | null;
};

/**
 * Resolve operator-facing opportunity status label from status_key + definitions.
 * Shared by drawer_primary and full hydrate — never emit raw internal keys when defs exist.
 */
export function resolveOpportunityStatusDisplay(params: {
    statusKey: string | null | undefined;
    legacyStatus?: string | null;
    statusDefs: OpportunityStatusDefLike[];
    pipelineStageId?: string | null;
    pipelineStageName?: string | null;
}): string | null {
    const oppSkRaw =
        params.statusKey != null && String(params.statusKey).trim() !== ""
            ? String(params.statusKey).trim()
            : params.legacyStatus != null && String(params.legacyStatus).trim() !== ""
              ? String(params.legacyStatus).trim()
              : null;
    const stageLabel =
        params.pipelineStageName != null && String(params.pipelineStageName).trim() !== ""
            ? String(params.pipelineStageName).trim()
            : null;

    let oppStatusDisplay: string | null = null;
    if (oppSkRaw && params.statusDefs.length > 0) {
        const ci = params.statusDefs.find((d) => d.status_key.toLowerCase() === oppSkRaw.toLowerCase());
        if (ci?.status_label != null && String(ci.status_label).trim() !== "") {
            oppStatusDisplay = String(ci.status_label).trim();
        } else {
            const labelMap = displayLabelsFromDefinitions(
                params.statusDefs as Parameters<typeof displayLabelsFromDefinitions>[0]
            );
            oppStatusDisplay = resolveDisplayFromLabelMap(labelMap, oppSkRaw, null);
        }
    } else {
        oppStatusDisplay = oppSkRaw;
    }

    if (
        params.pipelineStageId &&
        oppSkRaw &&
        String(oppSkRaw) === String(params.pipelineStageId) &&
        stageLabel
    ) {
        oppStatusDisplay = stageLabel;
    } else if (oppStatusDisplay != null && isUuidLike(String(oppStatusDisplay))) {
        if (stageLabel) {
            oppStatusDisplay = stageLabel;
        }
    }

    if ((oppStatusDisplay == null || String(oppStatusDisplay).trim() === "") && stageLabel) {
        oppStatusDisplay = stageLabel;
    }

    return oppStatusDisplay;
}
