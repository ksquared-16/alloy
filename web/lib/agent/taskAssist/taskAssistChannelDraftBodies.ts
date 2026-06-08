import type { TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";

export type TaskAssistChannelDrafts = {
    sms: string;
    email: string;
};

export type SynthesizedDraftPayload = NonNullable<TaskAssistCommandBootstrap["synthesized_draft"]>;

export function channelDraftsFromSynthesizedDraft(
    draft: SynthesizedDraftPayload | null | undefined
): TaskAssistChannelDrafts {
    if (!draft) {
        return { sms: "", email: "" };
    }
    const email = draft.body?.trim() ?? "";
    const sms = draft.sms_body?.trim() || email;
    return { sms, email };
}

/**
 * Resolve per-channel bodies from proposal + optional bootstrap fallback.
 * `draft_body` remains the body for the channel used at propose time.
 */
export function channelDraftsFromProposal(
    proposal: Pick<TaskAssistSuggestionV1, "channel" | "draft_body" | "draft_body_sms" | "draft_body_email">,
    fallback?: TaskAssistChannelDrafts | null
): TaskAssistChannelDrafts {
    const fb = fallback ?? { sms: "", email: "" };
    const active = proposal.draft_body?.trim() ?? "";
    const sms =
        proposal.draft_body_sms?.trim() ||
        (proposal.channel === "sms" ? active : "") ||
        fb.sms;
    const email =
        proposal.draft_body_email?.trim() ||
        (proposal.channel === "email" ? active : "") ||
        fb.email;
    return { sms, email };
}

export function draftBodyForChannel(
    drafts: TaskAssistChannelDrafts,
    channel: "sms" | "email"
): string {
    return channel === "sms" ? drafts.sms : drafts.email;
}

export function emailSubjectFromProposal(
    proposal: Pick<TaskAssistSuggestionV1, "draft_subject"> | null,
    bootstrapSubject?: string | null
): string {
    const fromProposal = proposal?.draft_subject?.trim();
    if (fromProposal) return fromProposal;
    return bootstrapSubject?.trim() ?? "";
}
