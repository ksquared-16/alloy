import type { FamilyCommunicationWorkspaceVM } from "@/lib/communications/v2/familyWorkspace/types";

export type WorkspaceMode = "email" | "sms" | "note" | "tasks";

export type WorkspaceModeStatus = { available: boolean; reason: string | null };

export type WorkspaceModeAvailability = Record<WorkspaceMode, WorkspaceModeStatus>;

function hasEligibleRecipient(vm: FamilyCommunicationWorkspaceVM, channel: "email" | "sms"): boolean {
    const all = [...vm.eligibleRecipients, ...vm.disabledRecipients];
    return all.some((r) => r.channels[channel].available);
}

/** Operator-facing availability for Email / SMS / Notes / Tasks workspace modes. */
export function resolveWorkspaceModeAvailability(
    vm: FamilyCommunicationWorkspaceVM | null,
    relatedTaskCount = 0
): WorkspaceModeAvailability {
    const reasons = vm?.composerDraft.availableChannels.reasons ?? {};
    const channels = vm?.composerDraft.availableChannels;

    const emailProvider = channels?.email ?? false;
    const smsProvider = channels?.sms ?? false;
    const emailRecipients = vm ? hasEligibleRecipient(vm, "email") : false;
    const smsRecipients = vm ? hasEligibleRecipient(vm, "sms") : false;

    let emailReason: string | null = reasons.email ?? null;
    if (!emailReason && !emailProvider) emailReason = "Email provider is not configured for this organization.";
    else if (!emailReason && vm && !emailRecipients) emailReason = "No email-capable recipient exists for this family.";

    let smsReason: string | null = reasons.sms ?? null;
    if (!smsReason && !smsProvider) smsReason = "SMS provider is not configured for this organization.";
    else if (!smsReason && vm && !smsRecipients) smsReason = "SMS unavailable because no SMS-capable recipient exists.";

    const noteReason =
        reasons.note ??
        "Notes appear in the timeline. Composing new internal notes from this workspace is not yet available.";

    const focusOpp = vm?.scope.focusOpportunityId;
    let tasksReason: string | null = reasons.tasks ?? null;
    if (!tasksReason && !focusOpp) {
        tasksReason = "No enrollment opportunity is linked to this family, so related tasks cannot be loaded.";
    } else if (!tasksReason && relatedTaskCount === 0 && focusOpp) {
        tasksReason = null;
    }

    return {
        email: { available: emailProvider && (emailRecipients || !vm), reason: emailProvider && emailRecipients ? null : emailReason },
        sms: { available: smsProvider && smsRecipients, reason: smsProvider && smsRecipients ? null : smsReason },
        note: { available: true, reason: noteReason },
        tasks: { available: !!focusOpp, reason: focusOpp ? null : tasksReason },
    };
}
