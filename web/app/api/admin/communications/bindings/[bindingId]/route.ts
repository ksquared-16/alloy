import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    translateBindingConstraintError,
    validateDisplayLabel,
    validateFromEmail,
    validateInboundAddress,
    validateInboundE164,
    validateStatus,
} from "@/lib/communications/bindingConfigInput";
import { detectSecretBoundaryViolation, selectCredential } from "@/lib/communications/providerCredentialCatalog";
import { planLocationOverrideRemoval } from "@/lib/communications/locationOverrideRemoval";
import {
    applyBindingIdentityProjection,
    PROJECTABLE_BINDING_COLUMNS,
} from "@/lib/communications/identity/applyBindingIdentityProjection";
import type { ProjectableBinding } from "@/lib/communications/identity/projectBindingIdentity";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * PATCH /api/admin/communications/bindings/[bindingId] — safe fields only (no secrets).
 *
 * Updates: display_label, status, is_primary, the receiving identity
 * (`inbound_address` for email, `inbound_to_e164` for SMS), the sending identity
 * (`config.from_email`), and which provisioned credential is referenced.
 *
 * A credential is changed by catalogue KEY, exactly as at create — the request
 * never carries a key value, and a body containing one is refused by field name.
 * Org-scoped throughout.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ bindingId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { bindingId } = await params;
    if (!UUID_RE.test(bindingId)) {
        return NextResponse.json({ error: "Invalid binding id" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const violation = detectSecretBoundaryViolation(body);
    if (violation) {
        return NextResponse.json({ error: violation.message, field: violation.field }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Load first: channel decides which receiving identity is meaningful, and the
    // existing config must be merged rather than replaced.
    const { data: row, error: loadErr } = await supabase
        .from("communication_provider_bindings")
        .select("id, org_id, channel, config, location_id, status")
        .eq("id", bindingId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Binding not found" }, { status: 404 });

    const channel = String((row as { channel?: string }).channel ?? "").trim().toLowerCase();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let touched = false;

    if ("display_label" in body) {
        touched = true;
        const label = validateDisplayLabel(body.display_label);
        if (!label.ok) {
            return NextResponse.json({ error: label.error.message, field: label.error.field }, { status: 400 });
        }
        patch.display_label = label.value;
    }

    if ("status" in body) {
        touched = true;
        const status = validateStatus(body.status);
        if (!status.ok) {
            return NextResponse.json({ error: status.error.message, field: status.error.field }, { status: 400 });
        }
        patch.status = status.value;
    }

    if ("is_primary" in body) {
        touched = true;
        if (typeof body.is_primary !== "boolean") {
            return NextResponse.json({ error: "is_primary must be boolean" }, { status: 400 });
        }
        patch.is_primary = body.is_primary;
    }

    if ("credential_key" in body) {
        touched = true;
        const credential = selectCredential({ channel, credentialKey: body.credential_key, env: process.env });
        if (!credential.ok) {
            return NextResponse.json({ error: credential.message, field: "credential_key" }, { status: 400 });
        }
        patch.secret_ref = credential.option.secretRef;
        // The provider is a property of the credential, not an independent choice.
        patch.provider = credential.option.provider;
    }

    if ("inbound_address" in body) {
        if (channel !== "email") {
            return NextResponse.json(
                { error: "A receiving address applies to email channels only.", field: "inbound_address" },
                { status: 400 },
            );
        }
        touched = true;
        const address = validateInboundAddress(body.inbound_address);
        if (!address.ok) {
            return NextResponse.json({ error: address.error.message, field: address.error.field }, { status: 400 });
        }
        patch.inbound_address = address.value;
    }

    if ("inbound_to_e164" in body) {
        if (channel !== "sms") {
            return NextResponse.json(
                { error: "A receiving number applies to SMS channels only.", field: "inbound_to_e164" },
                { status: 400 },
            );
        }
        touched = true;
        const number = validateInboundE164(body.inbound_to_e164);
        if (!number.ok) {
            return NextResponse.json({ error: number.error.message, field: number.error.field }, { status: 400 });
        }
        patch.inbound_to_e164 = number.value;
    }

    if ("location_id" in body) {
        touched = true;
        const raw = body.location_id;
        if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) {
            // REMOVING AN OVERRIDE — assignment removed, identity preserved.
            //
            // This deliberately does NOT clear `location_id`. Clearing it would
            // broaden a campus identity to organization scope, where it becomes a
            // candidate for the organization default and its receiving address
            // starts filing organization-wide conversations — silently, at the
            // moment an administrator thought they were removing something.
            // See `locationOverrideRemoval.ts` for the full audit.
            const removal = planLocationOverrideRemoval({
                location_id: (row as { location_id?: string | null }).location_id ?? null,
                status: (row as { status?: string | null }).status ?? null,
            });
            if (!removal.ok) {
                return NextResponse.json({ error: removal.message, field: "location_id" }, { status: 400 });
            }
            Object.assign(patch, removal.patch);
        } else if (typeof raw === "string" && UUID_RE.test(raw.trim())) {
            const { data: loc } = await supabase.from("locations").select("id").eq("id", raw.trim()).maybeSingle();
            if (!loc) {
                return NextResponse.json({ error: "That location does not exist.", field: "location_id" }, { status: 400 });
            }
            patch.location_id = raw.trim();
            patch.scope = "location";
        } else {
            return NextResponse.json({ error: "Invalid location.", field: "location_id" }, { status: 400 });
        }
    }

    if ("from_email" in body) {
        if (channel !== "email") {
            return NextResponse.json(
                { error: "A From address applies to email channels only.", field: "from_email" },
                { status: 400 },
            );
        }
        touched = true;
        const from = validateFromEmail(body.from_email);
        if (!from.ok) return NextResponse.json({ error: from.error.message, field: from.error.field }, { status: 400 });

        // Merge: `config` carries provider settings this surface does not manage,
        // and replacing the object wholesale would silently drop them.
        const existing = (row as { config?: unknown }).config;
        const base: Record<string, unknown> =
            existing != null && typeof existing === "object" && !Array.isArray(existing)
                ? { ...(existing as Record<string, unknown>) }
                : {};
        if (from.value) base.from_email = from.value;
        else delete base.from_email;
        patch.config = base;
    }

    if (!touched) {
        return NextResponse.json({ error: "No updatable fields supplied" }, { status: 400 });
    }

    if (patch.is_primary === true && channel) {
        const { error: clearErr } = await supabase
            .from("communication_provider_bindings")
            .update({ is_primary: false, updated_at: new Date().toISOString() })
            .eq("org_id", ctx.orgId)
            .eq("channel", channel)
            .neq("id", bindingId);
        if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });
    }

    const { error: updErr } = await supabase
        .from("communication_provider_bindings")
        .update(patch)
        .eq("id", bindingId)
        .eq("org_id", ctx.orgId);

    if (updErr) {
        const translated = translateBindingConstraintError(updErr);
        if (translated) {
            return NextResponse.json({ error: translated.message }, { status: translated.status });
        }
        return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Re-project so the sender resolver sees this edit immediately. The binding is
    // the authority; the projection is derived, so a failure here is reported but
    // never fails the operator's save.
    const { data: saved } = await supabase
        .from("communication_provider_bindings")
        .select(PROJECTABLE_BINDING_COLUMNS)
        .eq("id", bindingId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    let projectionWarning: string | null = null;
    if (saved) {
        const projection = await applyBindingIdentityProjection(supabase, saved as unknown as ProjectableBinding);
        if (!projection.ok) projectionWarning = projection.reason;
    }

    return NextResponse.json({ ok: true, ...(projectionWarning ? { projection_warning: projectionWarning } : {}) });
}
