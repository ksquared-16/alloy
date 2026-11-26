/**
 * Server-authoritative attendance provenance.
 *
 * WHY THIS FILE EXISTS
 *
 * Provenance on an operational fact is a claim about the world: who authored it,
 * through which channel, on whose authority. Before this, the attendance route
 * read `actor_type` and `source_type` straight off the request body, so any
 * caller able to reach the endpoint could file a fact stamped `parent` or
 * `system`. The fact was real; its provenance was fiction.
 *
 * The rule here is simple and absolute: **provenance is DERIVED, never accepted.**
 * A producer supplies subject and intent. The server supplies identity and
 * channel, from the authenticated principal and the trusted invocation origin.
 *
 * The channel vocabulary deliberately covers producers that do not exist yet
 * (kiosk, integration API, door access, mobile). That is so those threads never
 * need a schema change to tell the truth about where a fact came from — it is
 * NOT a claim that any of them is implemented. Each one still has to arrive with
 * its own trusted-context resolution before it can mint a `TrustedCaptureContext`.
 */

import type {
    AttendanceActorType,
    AttendanceSourceType,
} from "@/lib/childcareOperational/attendance/attendanceVocabulary";

/**
 * The channel a fact was captured through. One value per genuinely distinct
 * trust path — not per UI screen. Two screens that both authenticate the same
 * operator the same way are the same channel.
 */
export type AttendanceCaptureChannel =
    | "operator_console"
    | "staff_workspace"
    | "kiosk"
    | "parent_portal"
    | "mobile_app"
    | "integration_api"
    | "door_access"
    | "processing_import"
    | "system";

/**
 * What the SERVER knows about a capture attempt. Every field is established by
 * the server: the principal from the session, the channel from the route/command
 * origin, the correlation from the invocation.
 *
 * There is intentionally no way to build one of these from a request body.
 */
export type TrustedCaptureContext = {
    channel: AttendanceCaptureChannel;
    /** Authenticated Alloy user, when the channel authenticates a user at all. */
    actorUserId?: string | null;
    /** Resolved person behind the actor (a parent at a kiosk, a teacher). */
    actorPersonId?: string | null;
    /** Human-readable attribution for the audit trail. Never an authorization input. */
    actorLabel?: string | null;
    /**
     * Stable identity of the non-human producer — a device registration, an
     * integration credential, a provider id. Becomes `source_key`.
     */
    producerKey?: string | null;
    /** Correlation of the command invocation that authored the fact. */
    correlationId?: string | null;
};

export type ResolvedAttendanceProvenance = {
    actorType: AttendanceActorType;
    actorUserId: string | null;
    actorPersonId: string | null;
    actorLabel: string | null;
    sourceType: AttendanceSourceType;
    sourceKey: string;
    correlationId: string | null;
};

/**
 * Channel → (actor kind, stored source, whether a user identity is required).
 *
 * `requiresUser` is the load-bearing column. A channel that authenticates a
 * person must not be able to file a fact with no identity attached — that would
 * be an anonymous fact wearing a trusted channel's name.
 */
const CHANNEL_RULES: Record<
    AttendanceCaptureChannel,
    { actorType: AttendanceActorType; sourceType: AttendanceSourceType; requiresUser: boolean }
> = {
    operator_console: { actorType: "staff", sourceType: "operator_action", requiresUser: true },
    staff_workspace: { actorType: "staff", sourceType: "staff_workspace", requiresUser: true },
    // A kiosk authenticates a PERSON at a shared device; the device itself is the
    // producer, carried in source_key.
    kiosk: { actorType: "guardian", sourceType: "kiosk", requiresUser: false },
    parent_portal: { actorType: "parent", sourceType: "parent_portal", requiresUser: true },
    mobile_app: { actorType: "parent", sourceType: "mobile_app", requiresUser: true },
    // Non-human producers. Identity is the integration credential, not a user.
    integration_api: { actorType: "system", sourceType: "integration_api", requiresUser: false },
    door_access: { actorType: "system", sourceType: "door_access", requiresUser: false },
    processing_import: { actorType: "system", sourceType: "processing_import", requiresUser: false },
    system: { actorType: "system", sourceType: "system", requiresUser: false },
};

export class AttendanceProvenanceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AttendanceProvenanceError";
    }
}

const NON_HUMAN_CHANNELS: ReadonlySet<AttendanceCaptureChannel> = new Set([
    "integration_api",
    "door_access",
    "processing_import",
    "system",
    "kiosk",
]);

/**
 * Derive the provenance that will be stored on the fact.
 *
 * Throws rather than degrading: a channel that cannot prove who it is does not
 * get to write a fact with a weaker but still trusted-looking stamp.
 */
export function resolveAttendanceProvenance(
    ctx: TrustedCaptureContext
): ResolvedAttendanceProvenance {
    const rule = CHANNEL_RULES[ctx.channel];
    if (!rule) {
        throw new AttendanceProvenanceError(`unknown capture channel: ${ctx.channel}`);
    }

    const actorUserId = trimOrNull(ctx.actorUserId);
    if (rule.requiresUser && !actorUserId) {
        throw new AttendanceProvenanceError(
            `channel ${ctx.channel} requires an authenticated user to author attendance`
        );
    }

    // A non-human producer must identify itself. "system" with no producer key is
    // exactly the anonymous, unattributable write this whole file exists to stop.
    const producerKey = trimOrNull(ctx.producerKey);
    if (NON_HUMAN_CHANNELS.has(ctx.channel) && !producerKey) {
        throw new AttendanceProvenanceError(
            `channel ${ctx.channel} requires a producerKey identifying the device or integration`
        );
    }

    return {
        actorType: rule.actorType,
        actorUserId,
        actorPersonId: trimOrNull(ctx.actorPersonId),
        actorLabel: trimOrNull(ctx.actorLabel),
        sourceType: rule.sourceType,
        sourceKey: producerKey ?? rule.sourceType,
        correlationId: trimOrNull(ctx.correlationId),
    };
}

/**
 * The channel for an authenticated operator, chosen from the command runtime's
 * own operational context rather than a string the client picked.
 *
 * Both operator surfaces authenticate identically, so this is a provenance
 * DISTINCTION, not a trust distinction — it records which surface a fact came
 * from without implying the surfaces have different authority.
 */
export function operatorChannelForSurface(
    operationalContext: string | null | undefined
): AttendanceCaptureChannel {
    return (operationalContext ?? "").trim() === "workspace" ? "staff_workspace" : "operator_console";
}

/**
 * Channels a request body is allowed to *ask* for. Empty on purpose.
 *
 * Kept as an explicit, named export so that a future change trying to honour a
 * client-supplied channel has to delete this and say why, rather than quietly
 * threading a value through.
 */
export const CLIENT_ASSERTABLE_CHANNELS: readonly AttendanceCaptureChannel[] = [];

function trimOrNull(v: string | null | undefined): string | null {
    if (v == null) return null;
    const t = String(v).trim();
    return t === "" ? null : t;
}
