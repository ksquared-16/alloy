import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    activeOutboundBindings,
    availableComposerChannels,
    bindingEligibleForOutboundComposer,
    type BindingSummary,
} from "@/lib/communications/composerChannels";
import {
    evaluateBindingReadiness,
    receivingDomain,
    sendingDomain,
} from "@/lib/communications/bindingReadiness";
import {
    credentialKeyForSecretRef,
    detectSecretBoundaryViolation,
    isConnectableChannel,
    listCredentialOptions,
    selectCredential,
} from "@/lib/communications/providerCredentialCatalog";
import {
    translateBindingConstraintError,
    validateDisplayLabel,
    validateFromEmail,
    validateInboundAddress,
    validateInboundE164,
    validateStatus,
} from "@/lib/communications/bindingConfigInput";

/** The stored row, as this surface reads it. `inbound_address` is email's
 *  receiving identity; `inbound_to_e164` remains SMS's. */
type BindingRow = BindingSummary & { inbound_address?: string | null };

const BINDING_COLUMNS =
    "id, channel, scope, location_id, display_label, provider, status, is_primary, secret_ref, inbound_to_e164, inbound_address, config";

function sanitizeBindings(raw: BindingRow[]): unknown[] {
    return raw.map((b) => {
        const cfg = b.config != null && typeof b.config === "object" ? b.config : null;
        const fromEmail =
            cfg && typeof cfg.from_email === "string" ? String(cfg.from_email).slice(0, 120) : null;
        const readiness = evaluateBindingReadiness(b);
        return {
            id: b.id,
            channel: b.channel,
            scope: b.scope ?? null,
            location_id: b.location_id ?? null,
            display_label: b.display_label ?? null,
            provider: b.provider ?? null,
            status: b.status ?? null,
            is_primary: b.is_primary ?? null,
            /** Same rules as drawer/send route — not merely “has secret_ref”. */
            ready_for_composer: bindingEligibleForOutboundComposer(b),
            inbound_to_e164: b.inbound_to_e164 ?? undefined,
            inbound_address: b.inbound_address ?? null,
            receiving_domain: receivingDomain(b.inbound_address),
            from_email: fromEmail,
            sending_domain: sendingDomain(fromEmail),
            /** Kept for existing consumers (RulesWorkspace reads this name). */
            from_email_hint: fromEmail,
            /**
             * The credential is described by catalogue KEY, never by `secret_ref`.
             * `credential_key: null` with `credential_configured: true` means the
             * row is bound to something provisioned outside this surface — an
             * honest state the UI reports rather than flattening to “unconfigured”.
             */
            credential_key: credentialKeyForSecretRef(b.secret_ref),
            credential_configured:
                String(b.secret_ref ?? "").trim().toLowerCase() !== "" &&
                String(b.secret_ref ?? "").trim().toLowerCase() !== "unconfigured",
            readiness,
        };
    });
}

/** GET — active communication_provider_bindings for org (no secrets emitted). */
export async function GET() {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("communication_provider_bindings")
        .select(BINDING_COLUMNS)
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = (data ?? []) as BindingRow[];
    const channels_available = availableComposerChannels(list);

    return NextResponse.json({
        bindings: sanitizeBindings(list),
        channels_available,
        selectable_by_channel: {
            sms: sanitizeBindings(activeOutboundBindings(list, "sms")),
            email: sanitizeBindings(activeOutboundBindings(list, "email")),
        },
        /** What an operator may connect a channel to. Presence only, no values. */
        credential_options: listCredentialOptions(process.env),
        permission_stub: {
            gate: "admin_or_ops",
            finer_key: "communications.send",
        },
    });
}

/**
 * POST — connect a channel.
 *
 * The operability gap this closes: an admin could adjust a binding but could not
 * create one, so connecting a channel meant SQL. It is a credential-REFERENCED
 * create — the request names a catalogue key and the server resolves the
 * `secret_ref`. A body carrying an API key is refused by field name before any
 * value is read, so a secret cannot be stored here even by accident.
 *
 * Org-level only. Bindings carry `scope`/`location_id`, but the certified runtime
 * resolves ownership org-wide and email inbound uniqueness has no location
 * dimension — so this route pins `scope='org'` and `location_id=null` rather than
 * exposing a grain the runtime does not honour. Location inheritance is recorded
 * as a future requirement.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // The secrets boundary, checked first and by field name only.
    const violation = detectSecretBoundaryViolation(body);
    if (violation) {
        return NextResponse.json({ error: violation.message, field: violation.field }, { status: 400 });
    }

    if (!isConnectableChannel(body.channel)) {
        return NextResponse.json({ error: "Choose a channel: email or sms.", field: "channel" }, { status: 400 });
    }
    const channel = String(body.channel).trim().toLowerCase();

    const credential = selectCredential({
        channel,
        credentialKey: body.credential_key,
        env: process.env,
    });
    if (!credential.ok) {
        return NextResponse.json({ error: credential.message, field: "credential_key" }, { status: 400 });
    }

    const label = validateDisplayLabel(body.display_label);
    if (!label.ok) return NextResponse.json({ error: label.error.message, field: label.error.field }, { status: 400 });

    // A newly connected channel defaults to pending_verification: nothing on the
    // provider side has been proven yet, and a default of `active` would advertise
    // a readiness nobody has demonstrated.
    const status = "status" in body ? validateStatus(body.status) : ({ ok: true, value: "pending_verification" } as const);
    if (!status.ok) return NextResponse.json({ error: status.error.message, field: status.error.field }, { status: 400 });

    const insert: Record<string, unknown> = {
        org_id: ctx.orgId,
        channel,
        provider: credential.option.provider,
        scope: "org",
        location_id: null,
        secret_ref: credential.option.secretRef,
        display_label: label.value,
        status: status.value,
        is_primary: false,
        config: {},
    };

    if (channel === "email") {
        const address = validateInboundAddress(body.inbound_address);
        if (!address.ok) {
            return NextResponse.json({ error: address.error.message, field: address.error.field }, { status: 400 });
        }
        const from = validateFromEmail(body.from_email);
        if (!from.ok) return NextResponse.json({ error: from.error.message, field: from.error.field }, { status: 400 });

        insert.inbound_address = address.value;
        insert.config = from.value ? { from_email: from.value } : {};
    } else {
        const number = validateInboundE164(body.inbound_to_e164);
        if (!number.ok) {
            return NextResponse.json({ error: number.error.message, field: number.error.field }, { status: 400 });
        }
        insert.inbound_to_e164 = number.value;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("communication_provider_bindings")
        .insert(insert)
        .select(BINDING_COLUMNS)
        .single();

    if (error) {
        const translated = translateBindingConstraintError(error);
        if (translated) {
            return NextResponse.json({ error: translated.message }, { status: translated.status });
        }
        return NextResponse.json({ error: "Could not connect this channel." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, binding: sanitizeBindings([data as BindingRow])[0] }, { status: 201 });
}
