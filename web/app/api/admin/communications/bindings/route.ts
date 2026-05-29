import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import {
    activeOutboundBindings,
    availableComposerChannels,
    bindingEligibleForOutboundComposer,
    type BindingSummary,
} from "@/lib/communications/composerChannels";

function sanitizeBindings(raw: BindingSummary[]): unknown[] {
    return raw.map((b) => {
        const cfg = b.config != null && typeof b.config === "object" ? b.config : null;
        const fromEmail =
            cfg && typeof cfg.from_email === "string" ? String(cfg.from_email).slice(0, 120) : null;
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
            from_email_hint: fromEmail,
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
        .select("id, channel, scope, location_id, display_label, provider, status, is_primary, secret_ref, inbound_to_e164, config")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = (data ?? []) as BindingSummary[];
    const channels_available = availableComposerChannels(list);

    return NextResponse.json({
        bindings: sanitizeBindings(list),
        channels_available,
        selectable_by_channel: {
            sms: sanitizeBindings(activeOutboundBindings(list, "sms")),
            email: sanitizeBindings(activeOutboundBindings(list, "email")),
        },
        permission_stub: {
            gate: "admin_or_ops",
            finer_key: "communications.send",
        },
    });
}
