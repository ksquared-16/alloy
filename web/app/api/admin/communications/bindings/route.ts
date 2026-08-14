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
    applyBindingIdentityProjection,
    projectOrganizationBindings,
} from "@/lib/communications/identity/applyBindingIdentityProjection";
import type { ProjectableBinding } from "@/lib/communications/identity/projectBindingIdentity";
import {
    translateBindingConstraintError,
    validateDisplayLabel,
    validateFromEmail,
    validateInboundAddress,
    validateInboundE164,
    validateStatus,
} from "@/lib/communications/bindingConfigInput";
import { buildLocationHierarchy, type LocationRow } from "@/lib/communications/locationHierarchy";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** The stored row, as this surface reads it. `inbound_address` is email's
 *  receiving identity; `inbound_to_e164` remains SMS's. */
type BindingRow = BindingSummary & { inbound_address?: string | null };

/** Includes `org_id` because the identity projection needs it. Never emitted —
 *  `sanitizeBindings` decides what crosses the boundary. */
const BINDING_COLUMNS =
    "id, org_id, channel, scope, location_id, display_label, provider, status, is_primary, secret_ref, inbound_to_e164, inbound_address, config";

/**
 * Is the credential this binding names actually present in this deployment?
 *
 * Observable locally and cheaply — the catalogue already knows which environment
 * variable each credential uses, and `listCredentialOptions` reports presence.
 * Without this the surface reported "Ready" for a binding pointing at a key the
 * deployment does not hold, and every send failed at dispatch.
 *
 * A `secret_ref` written outside the catalogue (a runbook) cannot be checked this
 * way, so it is treated as available: reporting an unverifiable credential as
 * broken would be its own lie.
 */
function credentialAvailabilityFor(b: BindingRow, available: Set<string>): boolean {
    const key = credentialKeyForSecretRef(b.secret_ref);
    if (!key) return true;
    return available.has(key);
}

function sanitizeBindings(
    raw: BindingRow[],
    availableCredentialKeys: Set<string>,
    approvedChannels?: Set<string>,
    /** Providers whose organization-owned connection the provider REJECTED. */
    rejectedProviders?: Set<string>,
): unknown[] {
    return raw.map((b) => {
        const cfg = b.config != null && typeof b.config === "object" ? b.config : null;
        const fromEmail =
            cfg && typeof cfg.from_email === "string" ? String(cfg.from_email).slice(0, 120) : null;
        const channelKey = String(b.channel ?? "").trim().toLowerCase();
        const readiness = evaluateBindingReadiness(b, {
            credentialAvailable: credentialAvailabilityFor(b, availableCredentialKeys),
            // Undefined when the caller did not compute it — readiness then keeps
            // its previous behaviour rather than inventing `none_approved`.
            approvedConnectionAvailable: approvedChannels ? approvedChannels.has(channelKey) : undefined,
            credentialRejected: rejectedProviders?.has(String(b.provider ?? "").trim().toLowerCase()) ?? false,
        });
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
            /** What Alloy can OBSERVE about the provider connection. Never invents
             *  domain or MX verification it has not been told. */
            provider_connection: readiness.providerConnection,
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

    // Converge bindings that predate synchronous projection — anything created
    // before this slice, plus everything the one-time backfill skipped. Doing it
    // on read means an existing tenant repairs itself the first time an
    // administrator opens the page, with no script and no scheduled job.
    if (list.length) await projectOrganizationBindings(supabase, ctx.orgId);

    // The location roster travels with the configuration payload so the surface
    // can show inheritance — "North Campus uses the organization default" is only
    // sayable if North Campus is known to exist.
    //
    // `org_id` is filtered explicitly. This runs on the service-role client, which
    // bypasses RLS, and the previous query filtered only on `is_active` — so every
    // tenant's location labels were returned to every organization's
    // Communications page. Nothing rendered them, which is why it went unnoticed;
    // it was still a cross-tenant read.
    //
    // `location_type` and `parent_location_id` come along because the hierarchy is
    // canonical, not inferred: `site` is a school/centre, `unit` is a room, and the
    // parent link is the only authority on which room belongs to which school.
    // Names are never parsed to guess structure.
    const { data: locationRows } = await supabase
        .from("locations")
        .select("id, label, is_active, location_type, parent_location_id")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("label", { ascending: true });

    const credentialOptions = listCredentialOptions(process.env);
    const availableCredentialKeys = new Set(credentialOptions.filter((o) => o.available).map((o) => o.key));
    // Whether this deployment offers ANY approved connection per channel. Drives
    // the `none_approved` readiness state — the difference between "pick another
    // connection" and "a platform administrator must provision one".
    const approvedChannels = new Set(credentialOptions.filter((o) => o.available).map((o) => o.channel));

    // A connection the organization owns can be REJECTED by the provider — a key
    // revoked in Resend, for instance. That is not "unavailable"; it is specific
    // and the administrator can fix it by reconnecting.
    const { data: accountRows } = await supabase
        .from("communication_provider_accounts")
        .select("provider_type, verification_state, secret_ref")
        .eq("org_id", ctx.orgId);
    const rejectedProviders = new Set(
        (accountRows ?? [])
            .filter(
                (a) =>
                    String((a as { secret_ref?: string }).secret_ref ?? "").startsWith("vault:") &&
                    String((a as { verification_state?: string }).verification_state ?? "") === "failed",
            )
            .map((a) => String((a as { provider_type?: string }).provider_type ?? "").trim().toLowerCase()),
    );

    const channels_available = availableComposerChannels(list);

    return NextResponse.json({
        bindings: sanitizeBindings(list, availableCredentialKeys, approvedChannels, rejectedProviders),
        channels_available,
        selectable_by_channel: {
            sms: sanitizeBindings(activeOutboundBindings(list, "sms"), availableCredentialKeys, approvedChannels, rejectedProviders),
            email: sanitizeBindings(activeOutboundBindings(list, "email"), availableCredentialKeys, approvedChannels, rejectedProviders),
        },
        /** Flat roster, kept for existing consumers that index by location id. */
        locations: (locationRows ?? []).map((l) => ({
            id: String((l as { id: string }).id),
            label: String((l as { label?: string }).label ?? "Location"),
        })),
        /**
         * The same locations as canonical structure: schools, each with its rooms.
         * Rooms carry no identity controls — see `ROOM_IDENTITY_FUTURE_GATE`.
         */
        location_hierarchy: buildLocationHierarchy((locationRows ?? []) as LocationRow[]),
        /** What an operator may connect a channel to. Presence only, no values. */
        credential_options: credentialOptions,
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
 * Organization default OR location override. `location_id` is accepted now that
 * the runtime can honour it end to end: the conversation carries a location, the
 * sender resolver prefers a location identity over the organization default, and
 * inbound derives location from the receiving identity. `scope` is derived from
 * the answer rather than being a second control that could disagree with it.
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

    // A location override is now a first-class choice: the runtime can resolve it
    // (thread location + sender resolver) and the inbound side derives location
    // from the receiving identity. `scope` follows from the answer rather than
    // being a separate control the operator has to reason about.
    const locationId = typeof body.location_id === "string" && body.location_id.trim() ? body.location_id.trim() : null;
    if (locationId && !UUID_RE.test(locationId)) {
        return NextResponse.json({ error: "Invalid location.", field: "location_id" }, { status: 400 });
    }
    if (locationId) {
        const { data: loc } = await createAdminClient()
            .from("locations")
            .select("id")
            .eq("id", locationId)
            .maybeSingle();
        if (!loc) {
            return NextResponse.json({ error: "That location does not exist.", field: "location_id" }, { status: 400 });
        }
    }

    const insert: Record<string, unknown> = {
        org_id: ctx.orgId,
        channel,
        provider: credential.option.provider,
        scope: locationId ? "location" : "org",
        location_id: locationId,
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

    // Project into the identity model in THIS request. Without it the channel the
    // operator just connected would be invisible to the sender resolver until some
    // later backfill — which is exactly the drift this convergence removes.
    const projection = await applyBindingIdentityProjection(supabase, data as unknown as ProjectableBinding);

    return NextResponse.json(
        {
            ok: true,
            binding: sanitizeBindings(
                [data as BindingRow],
                new Set(listCredentialOptions(process.env).filter((o) => o.available).map((o) => o.key)),
            )[0],
            ...(projection.ok ? {} : { projection_warning: projection.reason }),
        },
        { status: 201 },
    );
}
