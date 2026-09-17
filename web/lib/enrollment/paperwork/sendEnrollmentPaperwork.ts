/**
 * Send enrollment paperwork — ONE operator intent, composed from owners that already exist.
 *
 * The Enrolling stage requires `send_enrollment_packet`, and until now that work had no executable
 * action: the only way to get paperwork to a family was Processing Studio → Packets → copy the
 * Intake URL, which is not an operator workflow, has no recipient, no thread and no audit.
 *
 * ── WHY THIS IS NOT BOUND DIRECTLY TO enrollment.start ──
 *
 * `enrollment.start` is the idempotent EXECUTION PREREQUISITE: it creates or resumes the one
 * participant episode and returns its access. It deliberately sends nothing, and that separation is
 * what lets the same start be re-run safely. The operator intent is not "start enrollment" — it is
 * "send the paperwork", which is a start COMPOSED WITH a delivery. Binding the work to
 * `enrollment.start` would have made pressing the button mean something different from what it says,
 * and would have put a Communications concern inside a lifecycle service.
 *
 * ```
 *   enrollment.send_paperwork(child)
 *     → startEnrollment                 create/resume ONE episode, and its access   (unchanged)
 *     → resolvePublicAppOrigin          the canonical origin, never the request's   (unchanged)
 *     → resolveEnrollmentPaperworkRecipient   the child's canonical parties          (unchanged)
 *     → buildEnrollmentPaperworkMessage the seed content
 *     → operator's Communications composer → confirm → send                          (unchanged)
 * ```
 *
 * Every arrow but the seed is an existing owner. This module owns the ORDER and the refusals.
 *
 * ── PREPARE ONLY. NOTHING HERE SENDS. ──
 *
 * Exactly the tour precedent: prepare mints/resumes and renders an editable draft, the operator
 * confirms in the canonical composer, and the send happens there. A service that both prepared and
 * sent would be a second send path, and the operator would lose the confirmation step that keeps a
 * message to a family from leaving on a mis-click.
 *
 * ── THE PACKET IS NEVER CHOSEN HERE ──
 *
 * `launchParticipantEnrollment` resolves it from the published Process — the stage's referenced
 * packet, or the packet derived from its Form requirements. This module cannot accept a packet id
 * and does not have a parameter for one, which is the only way "the Process decides" stays true.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { startEnrollment } from "@/lib/records/startEnrollmentService";
import { RecordCreationError } from "@/lib/records/recordCreationErrors";
import { PUBLIC_ORIGIN_OPERATOR_MESSAGE, resolvePublicAppOrigin } from "@/lib/publicAppUrl";
import { resolveEnrollmentPaperworkRecipient } from "@/lib/enrollment/paperwork/enrollmentPaperworkRecipient";
import { buildEnrollmentPaperworkMessage } from "@/lib/enrollment/paperwork/enrollmentPaperworkContent";

export type EnrollmentPaperworkFailureCode =
    | "missing_child"
    | "child_not_found"
    | "not_realized"
    | "missing_origin"
    | "missing_recipient";

export type EnrollmentPaperworkDraft = {
    /** The one participant episode this delivery is about. Stable across resend. */
    processInstanceId: string;
    sessionId: string;
    /** Chosen by the Process, reported so a test can prove WHICH packet, never to select one. */
    packetDefinitionId: string;
    /** "created" on the first send, "resumed" on every one after it. */
    launchOutcome: string;
    /** True when the journey already existed — a resend, not a second start. */
    reusedJourney: boolean;
    accessUrl: string;
    recipientPersonId: string;
    recipientDisplayName: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    /** Other deliverable parties, so the composer can offer the operator a different one. */
    recipientAlternatives: Array<{ personId: string; displayName: string | null }>;
    subject: string;
    emailBody: string;
    smsBody: string;
};

export type SendEnrollmentPaperworkResult =
    | { ok: true; draft: EnrollmentPaperworkDraft }
    | { ok: false; code: EnrollmentPaperworkFailureCode; message: string };

/** Operator-facing, one sentence each, and every one names what to do about it. */
export const ENROLLMENT_PAPERWORK_OPERATOR_MESSAGE: Record<EnrollmentPaperworkFailureCode, string> = {
    missing_child: "Select the child to send enrollment paperwork for.",
    child_not_found: "This child record is no longer available.",
    not_realized:
        "This child's Enrolling stage does not require any paperwork yet, so there is nothing to send. "
        + "Add the paperwork requirement to the Enrolling stage, then send again.",
    missing_origin: PUBLIC_ORIGIN_OPERATOR_MESSAGE.missing,
    missing_recipient:
        "There is no parent or guardian with an email address or mobile number on this child's record.",
};

export async function prepareEnrollmentPaperwork(
    supabase: SupabaseClient,
    input: { orgId: string; customerMemberId: string },
): Promise<SendEnrollmentPaperworkResult> {
    const orgId = input.orgId.trim();
    const customerMemberId = input.customerMemberId.trim();
    if (!customerMemberId) {
        return {
            ok: false,
            code: "missing_child",
            message: ENROLLMENT_PAPERWORK_OPERATOR_MESSAGE.missing_child,
        };
    }

    /*
     * The origin is resolved BEFORE anything is started. It cannot fail because of this child, and a
     * journey started for a message that then has no deliverable link is a worse outcome than a
     * refusal that changed nothing.
     */
    const origin = resolvePublicAppOrigin();
    if (!origin.ok) {
        return {
            ok: false,
            code: "missing_origin",
            message: PUBLIC_ORIGIN_OPERATOR_MESSAGE[origin.code],
        };
    }

    let started: Awaited<ReturnType<typeof startEnrollment>>;
    try {
        // IDEMPOTENT BY CONTRACT. A second send resumes the same journey and the same session, which
        // is what makes Resend a repeat of one delivery rather than a second enrollment.
        started = await startEnrollment(supabase, { orgId, customerMemberId });
    } catch (e) {
        if (e instanceof RecordCreationError) {
            return {
                ok: false,
                code: e.code === "not_found" ? "child_not_found" : "missing_child",
                message: e.message,
            };
        }
        throw e;
    }

    if (!started.participantLaunch.realized) {
        // The journey is legitimately started; there is simply nothing for a family to complete. Say
        // that, rather than sending a link to an empty packet.
        return {
            ok: false,
            code: "not_realized",
            message:
                started.participantLaunch.detail?.trim()
                || ENROLLMENT_PAPERWORK_OPERATOR_MESSAGE.not_realized,
        };
    }
    const launch = started.participantLaunch.value;

    const path = (launch.participantPath ?? "").trim();
    if (!path) {
        return {
            ok: false,
            code: "not_realized",
            message:
                "This child's paperwork has no family link yet, so there is nothing to send. "
                + "Open the child and start enrollment again.",
        };
    }

    const { data: childRow } = await supabase
        .from("customer_members")
        .select("id, first_name, display_name")
        .eq("org_id", orgId)
        .eq("id", customerMemberId)
        .maybeSingle();
    const child = (childRow ?? {}) as { first_name?: string | null; display_name?: string | null };
    // A first name is what a parent expects to read; the display name is the fallback.
    const childName =
        (child.first_name ?? "").trim() || (child.display_name ?? "").trim().split(" ")[0] || "your child";

    const recipient = await resolveEnrollmentPaperworkRecipient(supabase, {
        orgId,
        customerMemberId,
        childLabel: (child.display_name ?? "").trim() || childName,
    });
    if (!recipient.ok) {
        return { ok: false, code: "missing_recipient", message: recipient.message };
    }

    const accessUrl = `${origin.origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const content = buildEnrollmentPaperworkMessage({ childName, accessUrl });

    return {
        ok: true,
        draft: {
            processInstanceId: started.processInstanceId,
            sessionId: launch.sessionId,
            packetDefinitionId: launch.packetDefinitionId,
            launchOutcome: launch.outcome,
            reusedJourney: started.reused,
            accessUrl,
            recipientPersonId: recipient.recipient.personId,
            recipientDisplayName: recipient.recipient.displayName,
            recipientEmail: recipient.recipient.email,
            recipientPhone: recipient.recipient.phone,
            recipientAlternatives: recipient.recipient.alternatives,
            subject: content.subject,
            emailBody: content.emailBody,
            smsBody: content.smsBody,
        },
    };
}
