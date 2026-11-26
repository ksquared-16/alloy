/**
 * Surface-authored action invocation — queue row, drawer, recommendations, etc.
 * Actions must not fall back to global record search when context is already known.
 */

import type { QueueBosHandoffPreview } from "@/lib/adminV2/bos/bosAssistHandoffRouting";
import type { GlobalAssistantSourceSurface } from "@/contexts/GlobalAssistantContext";

export type ContextualActionSurface =
    | "queue_row"
    | "record_drawer"
    | "recommendation_card"
    | "bos_suggestion"
    | "kpi_tile"
    | "workflow_card"
    | "right_rail";

/** Runtime context carried from the originating surface into action handlers. */
export type ContextualActionInvocation = {
    surface: ContextualActionSurface;
    record_id: string;
    entity_type: "opportunity";
    opportunity_id: string;
    person_id?: string | null;
    household_id?: string | null;
    contact_id?: string | null;
    display_name?: string | null;
    email?: string | null;
    phone?: string | null;
    site_id?: string | null;
    department_id?: string | null;
    work_unit_id?: string | null;
    queue_key?: string | null;
    org_id?: string | null;
    queue_preview?: QueueBosHandoffPreview | null;
    bos_source_surface?: GlobalAssistantSourceSurface;
    /** Pre-select composer channel (canonical send_email / send_sms). */
    defaultChannel?: "email" | "sms";
    /** Optional compose draft (e.g. prepared tour invitation). */
    draftSubject?: string | null;
    draftBody?: string | null;
    /** When set, a successful compose send records this invitation as sent. */
    tourInvitationId?: string | null;
};

export type QueueRowActionPayload = {
    source?: string;
    registryKey?: string;
    opportunityId?: string;
    personId?: string | null;
    displayName?: string;
    email?: string | null;
    phone?: string | null;
};

export function parseQueueRowActionPayload(payload: unknown): QueueRowActionPayload {
    if (!payload || typeof payload !== "object") return {};
    const p = payload as Record<string, unknown>;
    return {
        source: typeof p.source === "string" ? p.source : undefined,
        registryKey: typeof p.registryKey === "string" ? p.registryKey : undefined,
        opportunityId: typeof p.opportunityId === "string" ? p.opportunityId : undefined,
        personId:
            typeof p.personId === "string"
                ? p.personId
                : p.personId === null
                  ? null
                  : undefined,
        displayName: typeof p.displayName === "string" ? p.displayName : undefined,
        email: typeof p.email === "string" ? p.email : p.email === null ? null : undefined,
        phone: typeof p.phone === "string" ? p.phone : p.phone === null ? null : undefined,
    };
}

export function buildQueueRowInvocation(args: {
    itemId: string;
    payload?: unknown;
    departmentId?: string | null;
    workUnitId?: string | null;
    queueKey?: string | null;
    queuePreview?: QueueBosHandoffPreview | null;
    displayNameFallback?: string | null;
}): ContextualActionInvocation {
    const row = parseQueueRowActionPayload(args.payload);
    const opportunityId = row.opportunityId?.trim() || args.itemId.trim();
    const personId = row.personId?.trim() || null;
    return {
        surface: "queue_row",
        record_id: opportunityId,
        entity_type: "opportunity",
        opportunity_id: opportunityId,
        person_id: personId,
        display_name: row.displayName?.trim() || args.displayNameFallback?.trim() || null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        department_id: args.departmentId?.trim() || null,
        work_unit_id: args.workUnitId?.trim() || null,
        queue_key: args.queueKey?.trim() || null,
        queue_preview: args.queuePreview ?? null,
        bos_source_surface: "queue",
    };
}

export async function launchContextualQuickMessage(invocation: ContextualActionInvocation): Promise<void> {
    const { launchAdminV2QuickMessage } = await import("@/lib/adminV2/quickMessageLaunch");
    launchAdminV2QuickMessage({
        personId: invocation.person_id?.trim() || null,
        opportunityId: invocation.opportunity_id,
        recordDisplayName: invocation.display_name,
        displayName: invocation.display_name ?? undefined,
        email: invocation.email,
        phone: invocation.phone,
        originatingSurface: invocation.surface,
        recordScoped: true,
        defaultChannel: invocation.defaultChannel,
        draftSubject: invocation.draftSubject ?? null,
        draftBody: invocation.draftBody ?? null,
        tourInvitationId: invocation.tourInvitationId ?? null,
    });
}

export async function launchContextualAskBos(invocation: ContextualActionInvocation): Promise<void> {
    const { launchAdminV2AskBos } = await import("@/lib/adminV2/bos/bosDrawerAssistHandoff");
    launchAdminV2AskBos({
        opportunity_id: invocation.opportunity_id,
        display_name: invocation.display_name,
        queue_preview: invocation.queue_preview ?? null,
        source_surface: invocation.bos_source_surface ?? "queue",
    });
}

export function invocationFromApplyRegistryHost(host: {
    entityId?: string | null;
    departmentId?: string | null;
    workUnitId?: string | null;
    invocationContext?: ContextualActionInvocation | null;
    context: { surface: string; section_key?: string | null };
}): ContextualActionInvocation | null {
    if (host.invocationContext) return host.invocationContext;
    const eid = host.entityId?.trim();
    if (!eid) return null;
    const surface = host.context.surface;
    const contextualSurface: ContextualActionSurface =
        surface === "queue_row"
            ? "queue_row"
            : surface === "right_rail"
              ? "right_rail"
              : surface === "record_section" || surface === "record_header"
                ? "record_drawer"
                : "record_drawer";
    return {
        surface: contextualSurface,
        record_id: eid,
        entity_type: "opportunity",
        opportunity_id: eid,
        department_id: host.departmentId?.trim() || null,
        work_unit_id: host.workUnitId?.trim() || null,
        bos_source_surface: surface === "queue_row" ? "queue" : "opportunity_drawer",
    };
}
