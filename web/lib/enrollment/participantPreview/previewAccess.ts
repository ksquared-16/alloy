import type { ParticipantEnrollmentAccess } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import type { PreviewBootstrap } from "@/lib/enrollment/participantPreview/bootstrapPreviewSession";

/**
 * What the token resolver returns, assembled without a token.
 *
 * The runtime asks for an access value — org, session, session id, process instance. In production
 * a public link proves the bearer may have one. In preview the administrator's own session already
 * proved it, so there is no link to mint and none is minted: a real operational packet link would
 * be a durable, sendable artifact created by looking at a screen.
 *
 * `processInstanceId` is null by design. A preview is not realizing anybody's Enrollment journey,
 * and the objective resolver already supports a session with no process instance.
 */
export function previewAccessFor(boot: PreviewBootstrap): ParticipantEnrollmentAccess {
    return {
        orgId: boot.session.org_id,
        linkId: boot.session.started_via_public_link_id,
        sessionId: boot.session.id,
        processInstanceId: null,
        session: boot.holder.row,
    };
}
