/**
 * Build quiet BOS context pills from canonical runtime context.
 * Presentation only — does not mutate conversation.
 */

import type {
    GlobalAssistantEntityContext,
    GlobalAssistantWorkspaceScope,
} from "@/contexts/GlobalAssistantContext";
import {
    bosOpportunityContextKindPrefix,
    resolveBosCommandSurfaceContextLabel,
} from "@/lib/adminV2/bos/bosCommandSurfaceContextPresentation";
import type { BosRailContextChip } from "@/lib/bos/bosRailContextChips";

export type BosContextPillSource = {
    currentContext: GlobalAssistantEntityContext | null;
    workspaceScope: GlobalAssistantWorkspaceScope | null;
    surfaceOperationalLabel: string | null;
    opportunitySingular?: string;
    workViewLabel?: string | null;
};

export function buildBosContextPills(source: BosContextPillSource): BosRailContextChip[] {
    const pills: BosRailContextChip[] = [];
    const scope = source.workspaceScope;

    const process =
        scope?.department_name?.trim() ||
        null;
    // Prefer work unit as Business Process label when present.
    const businessProcess = scope?.work_unit_name?.trim() || process;
    if (businessProcess) {
        pills.push({ label: `Business Process: ${businessProcess}` });
    }

    const workView = source.workViewLabel?.trim();
    if (workView) {
        pills.push({ label: `Work View: ${workView}` });
    }

    const subjectLine = resolveBosCommandSurfaceContextLabel({
        currentContext: source.currentContext,
        workspaceScope: null,
        surfaceOperationalLabel: source.surfaceOperationalLabel,
        opportunitySingular: source.opportunitySingular,
    });
    if (subjectLine) {
        if (subjectLine.includes(" — ")) {
            const [, ...rest] = subjectLine.split(" — ");
            const name = rest.join(" — ").trim();
            pills.push({ label: `Subject: ${name || subjectLine}` });
        } else if (source.currentContext?.entity_type === "opportunities") {
            const prefix = bosOpportunityContextKindPrefix(source.opportunitySingular ?? "Lead");
            pills.push({ label: `Subject: ${prefix} — ${subjectLine}` });
        } else {
            pills.push({ label: `Subject: ${subjectLine}` });
        }
    }

    // Deduplicate by label
    const seen = new Set<string>();
    return pills.filter((p) => {
        if (seen.has(p.label)) return false;
        seen.add(p.label);
        return true;
    });
}
