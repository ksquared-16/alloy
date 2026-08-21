/**
 * POST /api/public/forms/[token]/enrollment-edit
 *
 * The participant corrects a fact from the artifact review.
 *
 * Same access doctrine as every other participant route — the token resolves the anchored session,
 * and nothing about the request is trusted beyond the field being edited. The CLIENT names a field
 * id; the shared key it writes to is resolved server-side from the pinned schema, so a caller cannot
 * choose which canonical fact they are overwriting.
 */

import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import {
    recomputeParticipantObjectiveFromContext,
    resolveParticipantEnrollmentObjectiveWithContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import {
    applyParticipantValueEdit,
    sharedKeyForFieldId,
} from "@/lib/enrollment/participantRuntime/applyParticipantValueEdit";
import { loadPublishedFormEnvelope } from "@/lib/public/forms/loadPublishedFormEnvelope";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return publicErr("Server misconfiguration", 500);

    const { token: rawToken } = await params;
    const supabase = createServiceRoleClient();

    const access = await resolveParticipantEnrollmentFromToken(supabase, plaintextToken(rawToken ?? ""));
    if (!access.ok) {
        return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409, {
            code: access.error.code,
        });
    }

    let body: { field_id?: unknown; value?: unknown } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }
    const fieldId = typeof body.field_id === "string" ? body.field_id.trim() : "";
    if (!fieldId) return publicErr("field_id is required", 400);

    // The PINNED version, never the latest published one — D-94 governs a running session.
    const { data: item } = await supabase
        .from("form_packet_session_items")
        .select("packet_item_id, resolved_form_definition_version_id")
        .eq("org_id", access.value.orgId)
        .eq("packet_session_id", access.value.sessionId)
        .eq("status", "active")
        .maybeSingle();
    const row = item as { packet_item_id?: string; resolved_form_definition_version_id?: string } | null;
    if (!row?.packet_item_id) return publicErr("No active artifact to edit", 409);

    // The form definition is the packet item's, not the session item's — the session item only
    // carries the pin.
    const { data: packetItem } = await supabase
        .from("form_packet_items")
        .select("form_definition_id")
        .eq("org_id", access.value.orgId)
        .eq("id", row.packet_item_id)
        .maybeSingle();
    const formDefinitionId = (packetItem as { form_definition_id?: string } | null)?.form_definition_id;
    if (!formDefinitionId) return publicErr("No active artifact to edit", 409);

    const envelope = await loadPublishedFormEnvelope(
        supabase,
        access.value.orgId,
        formDefinitionId,
        row.resolved_form_definition_version_id ?? null,
    );
    if (!envelope) return publicErr("Artifact unavailable", 409);

    let schema: FormSchemaV1;
    try {
        schema = validateFormSchema(envelope.schemaJson);
    } catch {
        return publicErr("Artifact unavailable", 409);
    }

    const sharedKey = sharedKeyForFieldId(schema, fieldId);
    if (!sharedKey) {
        // Unbound controls are the artifact's own and are edited through Forms, not here.
        return publicErr("That field is part of the document itself.", 409, { code: "NOT_SHARED" });
    }

    const canonical = await resolveParticipantCanonicalContext(supabase, {
        orgId: access.value.orgId,
        processInstanceId: access.value.processInstanceId,
    });

    /**
     * The need this edit settles, resolved BEFORE the write.
     *
     * The confirmation of the edited value is recorded under the need's identity key
     * (`scope:subject:canonical_key`), and only the platform's own needs projection knows that key —
     * deriving it here from the schema would be a second authority over need identity.
     */
    const before = await resolveParticipantEnrollmentObjectiveWithContext(supabase, {
        orgId: access.value.orgId,
        processInstanceId: access.value.processInstanceId,
        canonicalValues: canonical.values,
        // The session row the access check already read — one fewer serial round trip.
        preloadedSession: access.value.session,
    });
    if (!before.ok) return publicErr(before.refusal.detail, 409, { code: before.refusal.code });
    const needKey =
        before.value.needs.needs.find((n) => n.identity.shared_value_key === sharedKey)?.identity.key ?? null;

    const applied = await applyParticipantValueEdit(supabase, {
        orgId: access.value.orgId,
        sessionId: access.value.sessionId,
        sharedKey,
        needKey,
        value: body.value ?? null,
        nowIso: new Date().toISOString(),
    });
    if (!applied.ok) return publicErr(applied.refusal.detail, 409, { code: applied.refusal.code });

    // Recomputed by the platform, as every other participant mutation is — PURELY: the write's
    // post-write session is in hand and every other objective input is immutable in this request.
    const baseSession = before.context.needsContext.session;
    const objective = recomputeParticipantObjectiveFromContext(
        before.context,
        baseSession ? { ...baseSession, ...applied.postWrite } : baseSession,
    );

    return publicOk({
        shared_key: sharedKey,
        objective: participantObjectiveWireModel(objective, {
            subjectDisplayName: canonical.subjectDisplayName,
        }),
    });
}
