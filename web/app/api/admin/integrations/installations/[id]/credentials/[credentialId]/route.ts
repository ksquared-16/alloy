/**
 * Rotate or revoke one credential.
 *
 * Rotation returns the new secret once and leaves the outgoing one accepted until
 * a bounded deadline, which is the deployment window a partner needs. Revocation
 * stops both secrets in the same statement — a revocation that cleared only the
 * primary would leave the overlap secret live.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireIntegrationsAccess } from "../../../../_guard";
import { withAdministrativeAudit } from "@/lib/platform/admin/administrativeAudit";
import { rotateCredential, revokeCredential } from "@/lib/platform/principal/applicationCredential";
import { getInstallation } from "@/lib/platform/admin/integrationsService";

/** How long the outgoing secret keeps working. Bounded, and stated to the operator. */
const ROTATION_OVERLAP_HOURS = 24;

async function ownedCredential(supabase: Parameters<typeof getInstallation>[0], orgId: string, id: string, credentialId: string) {
    const owned = await getInstallation(supabase, orgId, id);
    if (!owned.ok) return { ok: false as const, status: owned.status, message: owned.message };
    const { data } = await supabase
        .from("app_credentials")
        .select("id")
        .eq("id", credentialId)
        .eq("installation_id", id)
        .maybeSingle();
    if (!data) return { ok: false as const, status: 404 as const, message: "That credential does not exist." };
    return { ok: true as const, installation: owned.installation };
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; credentialId: string }> }) {
    const gate = await requireIntegrationsAccess("rotateCredential");
    if (!gate.ok) return gate.response;
    const { supabase, orgId, actorUserId } = gate.ctx;
    const { id, credentialId } = await params;

    const owned = await ownedCredential(supabase, orgId, id, credentialId);
    if (!owned.ok) return NextResponse.json({ error: owned.message }, { status: owned.status });

    const overlapUntil = new Date(Date.now() + ROTATION_OVERLAP_HOURS * 3_600_000).toISOString();

    const outcome = await withAdministrativeAudit(
        supabase,
        {
            eventType: "credential.rotated",
            actorUserId,
            orgId,
            installationId: id,
            applicationId: owned.installation.applicationId,
            credentialId,
        },
        async () => {
            const rotated = await rotateCredential(supabase, { credentialId, overlapUntil });
            return rotated.ok ? { ok: true as const, value: rotated.issued } : { ok: false as const, reason: rotated.reason };
        },
    );

    if (!outcome.ok) {
        const status = outcome.code === "audit_unavailable" ? 503 : 500;
        return NextResponse.json({ error: outcome.message, code: outcome.code }, { status });
    }

    return NextResponse.json({
        clientSecret: outcome.result.clientSecret,
        shownOnce: true,
        previousSecretValidUntil: overlapUntil,
        auditId: outcome.auditId,
    });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; credentialId: string }> }) {
    const gate = await requireIntegrationsAccess("revokeCredential");
    if (!gate.ok) return gate.response;
    const { supabase, orgId, actorUserId } = gate.ctx;
    const { id, credentialId } = await params;

    const owned = await ownedCredential(supabase, orgId, id, credentialId);
    if (!owned.ok) return NextResponse.json({ error: owned.message }, { status: owned.status });

    const outcome = await withAdministrativeAudit(
        supabase,
        {
            eventType: "credential.revoked",
            actorUserId,
            orgId,
            installationId: id,
            applicationId: owned.installation.applicationId,
            credentialId,
        },
        async () => {
            const revoked = await revokeCredential(supabase, { credentialId, revokedBy: actorUserId });
            return revoked.ok ? { ok: true as const, value: true } : { ok: false as const, reason: revoked.reason };
        },
    );

    if (!outcome.ok) {
        const status = outcome.code === "audit_unavailable" ? 503 : 500;
        return NextResponse.json({ error: outcome.message, code: outcome.code }, { status });
    }

    return NextResponse.json({ revoked: true, auditId: outcome.auditId });
}
