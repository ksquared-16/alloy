import type { SupabaseClient } from "@supabase/supabase-js";

import { OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS } from "@/lib/admin/opportunityActivityTimelineFormat";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

/** Configured opportunity status labels for activity summaries (org defs + enrollment fallbacks). */
export async function buildOpportunityActivityStatusKeyLabels(
    supabase: SupabaseClient,
    orgId: string
): Promise<Record<string, string>> {
    const labels: Record<string, string> = { ...OPPORTUNITY_ACTIVITY_STATUS_KEY_LABELS };
    try {
        const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
        for (const def of defs) {
            const key = def.status_key?.trim();
            const label = def.status_label?.trim();
            if (key && label) labels[key] = label;
        }
    } catch {
        // Fall back to static enrollment labels only.
    }
    return labels;
}
