"use client";

import type {
    FamilyCommunicationWorkspacePreviewVM,
} from "@/lib/communications/v2/familyWorkspace/types";
import FamilyCommunicationWorkspaceView from "@/app/adminV2/communications/FamilyCommunicationWorkspaceView";
import { CommsActivityEmbedHydratingShell, CommsWorkspacePanelReserve } from "@/app/adminV2/communications/commsWorkspaceUi";
import { useAdminAuthOptional } from "@/contexts/AdminAuthContext";
import type { FamilyWorkspaceSurfaceVariant } from "@/lib/communications/v2/familyWorkspace/surfaceVariant";
import { useFamilyCommunicationRuntime } from "@/lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime";

export default function FamilyCommunicationWorkspace(props: {
    customerId?: string;
    entity?: { entityType: string; entityId: string };
    channel?: "email" | "sms";
    initialPreviewVm?: FamilyCommunicationWorkspacePreviewVM | null;
    initialThreadId?: string | null;
    /** Activity cockpit embed — compact loading shell while warm cache resolves. */
    compactActivityLoading?: boolean;
    surfaceVariant?: FamilyWorkspaceSurfaceVariant;
    entryContext?: "current_work" | null;
}) {
    const adminAuth = useAdminAuthOptional();
    const runtime = useFamilyCommunicationRuntime(props);
    const isActivityEmbed = props.surfaceVariant === "activity_embed";

    if (runtime.error && !runtime.vm) return <div className="p-4 text-xs text-alloy-ember">{runtime.error}</div>;

    if (!runtime.vm) {
        if (props.compactActivityLoading) {
            return (
                <section
                    data-cc-column="workspace"
                    data-cc-drawer-workspace
                    data-drawer-family-workspace-warm={runtime.servedFromWarmCache ? "true" : undefined}
                    className="flex min-h-0 flex-col overflow-hidden"
                >
                    <CommsActivityEmbedHydratingShell joining={runtime.loading} />
                </section>
            );
        }
        if (runtime.loading) return <CommsWorkspacePanelReserve />;
        return <div className="p-4 text-xs text-alloy-midnight/45">No conversation.</div>;
    }

    return (
        <section
            data-cc-column="workspace"
            data-cc-drawer-workspace
            data-cc-surface-variant={props.surfaceVariant ?? "default"}
            data-drawer-family-workspace-warm={runtime.servedFromWarmCache ? "true" : undefined}
            className={
                isActivityEmbed
                    ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-stone/12 bg-white shadow-[0_1px_3px_rgba(20,30,25,0.05)]"
                    : "flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl border border-alloy-stone/12 bg-white shadow-[0_1px_3px_rgba(20,30,25,0.05)]"
            }
        >
            <FamilyCommunicationWorkspaceView
                surfaceVariant={props.surfaceVariant}
                anchorOpportunityId={props.entity?.entityType === "opportunities" ? props.entity.entityId : null}
                threads={runtime.vm.threads}
                onNewMessage={runtime.startNewMessage}
                selected={runtime.selected!}
                detail={runtime.detail}
                childNames={runtime.childNames}
                healthTone={runtime.healthTone}
                healthDot={runtime.healthDot}
                healthLabel={runtime.healthLabel}
                workspaceMode={runtime.workspaceMode}
                onWorkspaceModeChange={runtime.setWorkspaceMode}
                workspaceModeAvailability={runtime.workspaceModeAvailability}
                LIVE_WORKSPACE={true}
                selectedThreadId={runtime.selectedThreadId}
                selectedThread={runtime.selectedThread}
                messages={runtime.messages}
                timelineMessages={isActivityEmbed ? runtime.timelineMessages : undefined}
                liveRecipientGroups={runtime.vm.recipientGroups}
                selectedRecipientIds={runtime.selectedRecipientIds}
                liveChannel={runtime.liveChannel}
                subjectDraft={runtime.subjectDraft}
                bodyDraft={runtime.bodyDraft}
                sendResult={runtime.sendResult}
                sendError={runtime.sendError}
                sending={runtime.sending}
                assignBusy={false}
                onClaim={() => {}}
                onAllMessages={runtime.showAllMessages}
                onOpenThread={runtime.openThread}
                onToggleRecipient={runtime.toggleRecipient}
                onSubjectChange={runtime.setSubjectDraft}
                onBodyChange={runtime.setBodyDraft}
                onSendNow={() => void runtime.send(false)}
                onConfirmSend={() => void runtime.send(true)}
                onDismissSend={runtime.dismissSendResult}
                viewerUserId={adminAuth?.userId ?? null}
                sendCompleteToken={runtime.sendCompleteToken}
            />
        </section>
    );
}
