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
import { rotateCredential, revokeCredential, credentialBusinessRefusal } from "@/lib/platform/principal/applicationCredential";
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

/**
 * Turn a failed administrative outcome into a response.
 *
 * `withAdministrativeAudit` reports every non-audit failure as `action_failed`
 * and carries the domain's reason in `message`, so this route used to answer 500
 * for all of them. That told a client presenting a revoked credential that Alloy
 * had broken, when what had actually happened is that the rule worked.
 *
 * The reason is matched against the credential module's stated business rules. A
 * match answers with that rule's status and keeps the machine-readable reason in
 * `code`, which is what a client should branch on. Anything else is a genuine
 * failure and still answers 500.
 *
 * An unmatched reason does NOT reach the client. It is a Postgres message or a
 * thrown error, it is already recorded on the audit row, and a constraint
 * violation can quote the offending value — which on this table would be a
 * secret digest. The client gets a stable sentence instead.
 */
function credentialFailureResponse(outcome: { code: string; message: string; auditId?: string }) {
    if (outcome.code === "audit_unavailable") {
        return NextResponse.json({ error: outcome.message, code: outcome.code }, { status: 503 });
    }
    const refusal = credentialBusinessRefusal(outcome.message);
    if (refusal) {
        return NextResponse.json({ error: refusal.message, code: refusal.code }, { status: refusal.status });
    }
    return NextResponse.json(
        { error: "That could not be completed.", code: "INTERNAL" },
        { status: 500 },
    );
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

    if (!outcome.ok) return credentialFailureResponse(outcome);

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

    if (!outcome.ok) return credentialFailureResponse(outcome);

    return NextResponse.json({ revoked: true, auditId: outcome.auditId });
}
