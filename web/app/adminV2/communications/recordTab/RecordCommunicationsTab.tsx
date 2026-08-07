"use client";

import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import FamilyCommunicationWorkspace from "@/app/adminV2/communications/FamilyCommunicationWorkspace";
import type { FamilyWorkspaceSurfaceVariant } from "@/lib/communications/v2/familyWorkspace/surfaceVariant";
import {
    buildRecordCommunicationsModel,
    type RecordTimelineEntry,
} from "@/lib/communications/v2/recordTabModel";
import type { FamilyCommunicationWorkspacePreviewVM } from "@/lib/communications/v2/familyWorkspace/types";

/**
 * Record-drawer Communications tab (PKG-13) — DARK (self-gated behind comms_v2_record_tab).
 * Relationship context only: scoped timeline, communication health, consent, quick reply slot,
 * internal notes. No inbox, no assignment, no deliverability, no bulk tools (Command Center owns those).
 * Mounting into the live Lead/Person/Child drawers is a real-gate-validated follow-on.
 */
export default function RecordCommunicationsTab(props: {
    entityType?: string;
    entityId?: string;
    initialPreviewVm?: FamilyCommunicationWorkspacePreviewVM | null;
    compactActivityLoading?: boolean;
    surfaceVariant?: FamilyWorkspaceSurfaceVariant;
    entryContext?: "current_work" | null;
    messages?: { id: string; channel?: string | null; direction?: string | null; created_at?: string | null; body?: string | null }[];
    notes?: { id: string; created_at?: string | null; body?: string | null }[];
    unread?: number;
    consentStatus?: string | null;
}) {
    if (!isCommsV2FlagEnabled("comms_v2_record_tab")) return null;

    // UI-6: when the live workspace flag is on and we have a drawer entity, mount the shared Family
    // Communication Workspace (same structure as the modal, no queue), scoped to this drawer.
    if (isCommsV2FlagEnabled("comms_v2_live_workspace") && props.entityType && props.entityId) {
        return (
            <div
                data-cc-record-tab="communications"
                className={
                    props.surfaceVariant === "activity_embed"
                        ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white"
                        : "bg-white"
                }
            >
                <FamilyCommunicationWorkspace
                    entity={{ entityType: props.entityType, entityId: props.entityId }}
                    initialPreviewVm={props.initialPreviewVm}
                    compactActivityLoading={props.compactActivityLoading}
                    surfaceVariant={props.surfaceVariant}
                    entryContext={props.entryContext}
                />
            </div>
        );
    }

    const model = buildRecordCommunicationsModel({
        messages: props.messages ?? [],
        notes: props.notes ?? [],
        unread: props.unread,
        consentStatus: props.consentStatus,
    });

    return (
        <div data-cc-record-tab="communications" className="space-y-3 bg-white">
            <header data-cc-record-health className="flex items-center justify-between text-xs text-alloy-midnight/70">
                <span>Last contact: {model.lastContactAt ?? "—"}</span>
                <span>Unread: {model.unread}</span>
                <span data-cc-record-consent>Consent: {model.consentDisplay}</span>
            </header>
            <ol data-cc-record-timeline className="space-y-1">
                {model.timeline.map((e: RecordTimelineEntry) => (
                    <li key={e.id} data-cc-entry-kind={e.kind} className="rounded-lg border border-alloy-stone/10 px-2 py-1 text-sm">
                        <span className="font-medium">{e.kind}</span> · {e.direction} · {e.preview ?? ""}
                    </li>
                ))}
            </ol>
            <div data-cc-record-quickreply className="text-xs text-alloy-midnight/50">Quick reply</div>
        </div>
    );
}
