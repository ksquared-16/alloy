/**
 * Where the parent is, in words a parent uses.
 *
 * ## What was missing
 *
 * The document-first review shows the paperwork and nothing else — which is right for the document
 * and wrong for the journey. A parent five screens into their enrollment could not tell which of
 * their school's forms they were looking at, how many were left, or what this one still wanted from
 * them. The information all existed: the artifact's own title, the session's packet progress, the
 * attachments still owed, whether a signature had been captured.
 *
 * ## The five states, and no others
 *
 * Ready to review · Signature required · Signed · Complete · Needs a change.
 *
 * They are participant states, not runtime states. Nothing here exposes `reviewStep`, an item
 * status, or a phase key — a parent has never needed to know that a session item is `active`. The
 * derivation is one-way and total: given what the artifact still wants, exactly one of the five is
 * true.
 *
 * Pure. No I/O.
 */

export type ParticipantArtifactState =
    | "ready_to_review"
    | "signature_required"
    | "signed"
    | "complete"
    | "needs_a_change";

export type ParticipantArtifactStatus = {
    readonly state: ParticipantArtifactState;
    /** The five words themselves. */
    readonly label: string;
    /** The document's own name — the school's, never a file name or a form id. */
    readonly documentName: string;
    /** Where this document sits in the parent's stack, when there is more than one. */
    readonly position: string | null;
    /** What this document still wants, or null when it wants nothing. */
    readonly remaining: string | null;
    /** What happens after this one — the question every parent asks next. */
    readonly next: string | null;
};

const LABELS: Record<ParticipantArtifactState, string> = {
    ready_to_review: "Ready to review",
    signature_required: "Signature required",
    signed: "Signed",
    complete: "Complete",
    needs_a_change: "Needs a change",
};

/** A count of documents, said the way a person says it. */
function plural(n: number, one: string, many: string): string {
    return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

export function participantArtifactStatus(input: {
    /** The artifact's authored title. */
    readonly documentTitle: string | null | undefined;
    /** Which participant step this is: reviewing the document, correcting it, or signing it. */
    readonly step: "review" | "edit" | "sign";
    /** Attachments this document requires and has not yet received. */
    readonly requiredUploadsOutstanding: number;
    /** Whether this artifact asks for a signature at all. */
    readonly signatureExpected: boolean;
    /** Whether the parent has signed it. */
    readonly signatureCaptured: boolean;
    /** Documents in this packet, and how many are already finished. */
    readonly packetTotal: number;
    readonly packetSatisfied: number;
}): ParticipantArtifactStatus {
    const documentName = (input.documentTitle ?? "").trim() || "Your paperwork";
    const index = input.packetSatisfied + 1;
    const position = input.packetTotal > 1 ? `Document ${Math.min(index, input.packetTotal)} of ${input.packetTotal}` : null;
    const left = Math.max(0, input.packetTotal - index);
    const next = left > 0 ? `${plural(left, "document", "documents")} after this one` : "This is the last one";

    const state: ParticipantArtifactState =
        input.step === "edit"
            ? "needs_a_change"
            : input.requiredUploadsOutstanding > 0
              ? "ready_to_review"
              : input.signatureExpected && !input.signatureCaptured
                ? "signature_required"
                : input.signatureExpected && input.signatureCaptured
                  ? "signed"
                  : input.step === "sign"
                    ? "complete"
                    : "ready_to_review";

    const remaining =
        input.step === "edit"
            ? "Change anything that isn’t right"
            : input.requiredUploadsOutstanding > 0
              ? input.requiredUploadsOutstanding === 1
                  ? "One thing left to attach"
                  : `${input.requiredUploadsOutstanding} things left to attach`
              : state === "signature_required"
                ? "Your signature"
                : state === "signed"
                  ? "Nothing — you can finish this one"
                  : null;

    return { state, label: LABELS[state], documentName, position, remaining, next };
}
