/**
 * Resolve Tour comms config with canonical Communications Template Library overrides.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTourCommsConfig, type ResolveTourCommsConfigResult } from "@/lib/tours/comms/resolveTourCommsConfig";
import {
    ensureOrgTourCommunicationTemplates,
    loadTourCommsLibraryOverrides,
    mergeTourCommsTemplateOverrides,
} from "@/lib/tours/comms/tourSystemTemplates";

export async function resolveTourCommsConfigWithLibrary(
    supabase: SupabaseClient,
    args: { orgId: string; locationId?: string | null; actorUserId?: string | null; provision?: boolean },
): Promise<ResolveTourCommsConfigResult> {
    const base = await resolveTourCommsConfig(supabase, {
        orgId: args.orgId,
        locationId: args.locationId ?? null,
    });

    try {
        if (args.provision !== false) {
            await ensureOrgTourCommunicationTemplates({
                supabase,
                orgId: args.orgId,
                actorUserId: args.actorUserId ?? null,
            });
        }
        const library = await loadTourCommsLibraryOverrides({
            supabase,
            orgId: args.orgId,
        });
        return {
            ...base,
            config: {
                ...base.config,
                templates: mergeTourCommsTemplateOverrides(base.config.templates, library),
            },
        };
    } catch (e) {
        // Library provision/load must not block Tour booking confirmation.
        console.warn(
            "[tour_comms] library template resolve failed; using code/metadata defaults",
            e instanceof Error ? e.message : e,
        );
        return base;
    }
}
