/**
 * Issue a credential.
 *
 * The plaintext secret exists exactly once, in this response. It is never stored,
 * never logged, never written to audit metadata, and cannot be read back — the
 * database holds only a hash, and there is deliberately no endpoint that returns
 * a secret for an existing credential.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireIntegrationsAccess } from "../../../_guard";
import { withAdministrativeAudit } from "@/lib/platform/admin/administrativeAudit";
import { issueCredential } from "@/lib/platform/principal/applicationCredential";
import { getInstallation } from "@/lib/platform/admin/integrationsService";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireIntegrationsAccess("createCredential");
    if (!gate.ok) return gate.response;
    const { supabase, orgId, actorUserId } = gate.ctx;
    const { id } = await params;

    const owned = await getInstallation(supabase, orgId, id);
    if (!owned.ok) return NextResponse.json({ error: owned.message }, { status: owned.status });
    if (owned.installation.state === "revoked") {
        return NextResponse.json({ error: "This integration is disconnected." }, { status: 409 });
    }

    let label = "Operator issued";
    try {
        const body = (await request.json()) as { label?: string };
        if (typeof body.label === "string" && body.label.trim()) label = body.label.trim().slice(0, 120);
    } catch { /* a label is optional */ }

    const outcome = await withAdministrativeAudit(
        supabase,
        {
            eventType: "credential.created",
            actorUserId,
            orgId,
            installationId: id,
            applicationId: owned.installation.applicationId,
            // The LABEL is metadata. The secret never is.
            metadata: { label },
        },
        async () => {
            const issued = await issueCredential(supabase, { installationId: id, label, createdBy: actorUserId });
            return issued.ok ? { ok: true as const, value: issued.issued } : { ok: false as const, reason: issued.reason };
        },
    );

    if (!outcome.ok) {
        const status = outcome.code === "audit_unavailable" ? 503 : 500;
        return NextResponse.json({ error: outcome.message, code: outcome.code }, { status });
    }

    return NextResponse.json({
        credentialId: outcome.result.credentialId,
        clientId: outcome.result.clientId,
        // Shown once. The client must not persist it; see the surface's copy.
        clientSecret: outcome.result.clientSecret,
        shownOnce: true,
        auditId: outcome.auditId,
    }, { status: 201 });
}
