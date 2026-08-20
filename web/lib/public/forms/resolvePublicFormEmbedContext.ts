import { resolveParticipantCanonicalValues } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { sharedValuesToFieldIds } from "@/lib/forms/packets/sharedValuesToFieldIds";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveSubmissionFksFromLaunchMetadata } from "@/lib/forms/formLaunchFkDerivation";
import {
    ensurePacketSessionForPublicLink,
    findActivePacketSessionItem,
    listPacketDefinitionItems,
    loadPacketDefinitionName,
    loadPacketDefinitionStepSummaries,
    resolveActiveStepEnvelope,
} from "@/lib/forms/packets/formPacketService";
import {
    resolvePublicFormLinkByToken,
    type ResolvePublicFormLinkFailure,
} from "@/lib/public/forms/resolvePublicFormLink";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPacketPublicLinkMetadata(metadata: Record<string, unknown>): boolean {
    if (metadata.form_context_mode !== "packet") return false;
    const pid = typeof metadata.packet_definition_id === "string" ? metadata.packet_definition_id.trim() : "";
    return UUID_RE.test(pid);
}

/** Unified resolve target for public embed: single form or current packet step. */
export type PublicEmbedResolved = {
    linkId: string;
    orgId: string;
    formDefinitionId: string;
    formDefinitionVersionId: string;
    schemaJson: unknown | null;
    pdfMappingJson: unknown | null;
    expiresAt: string | null;
    allowedEmbedOrigins: string[] | null;
    linkMetadata: Record<string, unknown>;
    formKey: string;
    formName: string;
    formKind: string;
    /** Authored brand tokens — one theme owner for every participant phase. */
    formMetadata: unknown;
    packetTerminal: boolean;
    packet: null | {
        packet_session_id: string;
        packet_definition_id: string;
        packet_name: string | null;
        current_sequence_index: number;
        total_steps: number;
        current_session_item_id: string;
        /** Ordered steps for progress UI (sequence_index + form display name). */
        step_summaries?: { sequence_index: number; form_name: string }[];
        /**
         * Values already settled for THIS artifact, keyed by its own field ids.
         *
         * The session has always held these canonically; nothing applied them to the artifact being
         * rendered, so a parent who answered in the conversation met an empty field at review. Sent
         * from the server, keyed to this step's schema, so the client never has to know how a shared
         * key maps onto a form field.
         */
        shared_prefill_by_field_id?: Record<string, unknown>;
    };
};

/**
 * What the artifact should already contain when the parent first looks at it.
 *
 * "I filled out the paperwork for you" is only true if the paperwork is actually filled — and the
 * organization's own record is most of it, before the parent has said a word. So canonical values
 * are the base layer and the session's own shared values are laid over them.
 *
 * That precedence matches the needs projection exactly: a session value is what the PARTICIPANT has
 * settled and must outrank a record the operator entered months ago. Inverting it would let a stale
 * record overwrite what a parent just told us.
 *
 * It also repairs a real gap in existing journeys. A confirmation recorded before the runtime wrote
 * confirmed values into the session left evidence but no value, so a date of birth the parent had
 * already agreed to rendered blank. Reading the record as the base layer fixes the class, not just
 * those rows.
 */
export async function participantPrefillValues(
    supabase: SupabaseClient,
    orgId: string,
    session: { shared_values?: unknown; process_instance_id?: string | null },
): Promise<Record<string, unknown>> {
    const shared = (session.shared_values ?? {}) as Record<string, unknown>;
    const processInstanceId = String(session.process_instance_id ?? "").trim();
    if (!processInstanceId) return shared;

    const canonical = await resolveParticipantCanonicalValues(supabase, { orgId, processInstanceId });
    return { ...canonical, ...shared };
}

export async function resolvePublicFormEmbedContext(
    supabase: SupabaseClient,
    plaintextToken: string
): Promise<{ ok: true; value: PublicEmbedResolved } | { ok: false; error: ResolvePublicFormLinkFailure }> {
    const base = await resolvePublicFormLinkByToken(supabase, plaintextToken);
    if (!base.ok) return base;

    const v = base.value;
    const meta = v.linkMetadata ?? {};

    if (!isPacketPublicLinkMetadata(meta)) {
        return {
            ok: true,
            value: {
                linkId: v.linkId,
                orgId: v.orgId,
                formDefinitionId: v.formDefinitionId,
                formDefinitionVersionId: v.formDefinitionVersionId,
                schemaJson: v.schemaJson,
                pdfMappingJson: v.pdfMappingJson,
                expiresAt: v.expiresAt,
                allowedEmbedOrigins: v.allowedEmbedOrigins,
                linkMetadata: meta,
                formKey: v.formKey,
                formName: v.formName,
                formKind: v.formKind,
                formMetadata: v.formMetadata ?? null,
                packetTerminal: false,
                packet: null,
            },
        };
    }

    const packetDefinitionId = String(meta.packet_definition_id).trim();
    const versionPolicy =
        typeof meta.packet_step_version_policy === "string" ? meta.packet_step_version_policy.trim() : "follow_latest";
    const followLatestPublished = versionPolicy !== "pinned";

    let launchFks;
    try {
        launchFks = await deriveSubmissionFksFromLaunchMetadata(supabase, v.orgId, meta);
    } catch {
        return { ok: false, error: { code: "NOT_FOUND", message: "Packet launch resolve failed" } };
    }

    const ensured = await ensurePacketSessionForPublicLink(supabase, {
        orgId: v.orgId,
        linkId: v.linkId,
        packetDefinitionId,
        linkMetadata: meta,
        launchFks,
    });

    if (ensured.error || !ensured.session) {
        return {
            ok: false,
            error: {
                code: "NO_PUBLISHED_VERSION",
                message: ensured.error?.message ?? "Packet session unavailable",
            },
        };
    }

    const session = ensured.session;
    const items = ensured.items;
    const totalSteps = items.length;
    const packetName = await loadPacketDefinitionName(supabase, v.orgId, packetDefinitionId);

    if (session.status === "completed") {
        return {
            ok: true,
            value: {
                linkId: v.linkId,
                orgId: v.orgId,
                formDefinitionId: v.formDefinitionId,
                formDefinitionVersionId: v.formDefinitionVersionId,
                schemaJson: null,
                pdfMappingJson: null,
                expiresAt: v.expiresAt,
                allowedEmbedOrigins: v.allowedEmbedOrigins,
                linkMetadata: meta,
                formKey: v.formKey,
                formName: v.formName,
                formKind: v.formKind,
                formMetadata: v.formMetadata ?? null,
                packetTerminal: true,
                packet: {
                    packet_session_id: session.id,
                    packet_definition_id: packetDefinitionId,
                    packet_name: packetName,
                    current_sequence_index: session.current_sequence_index,
                    total_steps: totalSteps,
                    current_session_item_id: "",
                },
            },
        };
    }

    const active = findActivePacketSessionItem(items);
    if (!active) {
        return {
            ok: false,
            error: { code: "NO_PUBLISHED_VERSION", message: "Packet has no active step" },
        };
    }

    const { data: defItems, error: diErr } = await listPacketDefinitionItems(supabase, v.orgId, packetDefinitionId);
    if (diErr || !defItems?.length) {
        return { ok: false, error: { code: "NOT_FOUND", message: "Packet definition missing" } };
    }

    const { data: stepSummaries } = await loadPacketDefinitionStepSummaries(supabase, v.orgId, packetDefinitionId);

    const { envelope, error: envErr } = await resolveActiveStepEnvelope(supabase, v.orgId, active, defItems, {
        followLatestPublished,
    });
    if (envErr || !envelope) {
        return {
            ok: false,
            error: { code: "NO_PUBLISHED_VERSION", message: envErr?.message ?? "Step form unavailable" },
        };
    }

    return {
        ok: true,
        value: {
            linkId: v.linkId,
            orgId: v.orgId,
            formDefinitionId: envelope.formDefinitionId,
            formDefinitionVersionId: envelope.formDefinitionVersionId,
            schemaJson: envelope.schemaJson,
            pdfMappingJson: envelope.pdfMappingJson,
            expiresAt: v.expiresAt,
            allowedEmbedOrigins: v.allowedEmbedOrigins,
            linkMetadata: meta,
            formKey: envelope.formKey,
            formName: envelope.formName,
            formKind: envelope.formKind,
            formMetadata: envelope.formMetadata ?? null,
            packetTerminal: false,
            packet: {
                packet_session_id: session.id,
                packet_definition_id: packetDefinitionId,
                packet_name: packetName,
                current_sequence_index: active.sequence_index,
                total_steps: totalSteps,
                current_session_item_id: active.id,
                step_summaries: stepSummaries ?? undefined,
                shared_prefill_by_field_id: sharedValuesToFieldIds(
                    envelope.schemaJson as never,
                    await participantPrefillValues(supabase, v.orgId, session),
                ),
            },
        },
    };
}
