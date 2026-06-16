import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { executeCommunicationsSend } from "@/lib/communications/executeCommunicationsSend";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/communications/family-note — internal note compose from Command Center.
 * Creates communication_messages via canonical in_app send (no external delivery).
 */
export async function POST(req: Request) {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const customerId = String(body.customer_id ?? "").trim();
    const message = String(body.body ?? "").trim();
    const opportunityId = typeof body.opportunity_id === "string" ? body.opportunity_id.trim() : "";
    const personId = typeof body.person_id === "string" ? body.person_id.trim() : "";

    if (!UUID_RE.test(customerId)) return NextResponse.json({ error: "customer_id must be a UUID" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "body is required" }, { status: 400 });

    const supabase = createAdminClient();
    const orgCheck = await assertRowOrg(supabase, "customers", customerId, ctx.orgId);
    if (!orgCheck.ok) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    let entityType: "opportunities" | "persons" = "persons";
    let entityId = personId;

    if (UUID_RE.test(opportunityId)) {
        const oppCheck = await assertRowOrg(supabase, "opportunities", opportunityId, ctx.orgId);
        if (oppCheck.ok) {
            entityType = "opportunities";
            entityId = opportunityId;
        }
    }

    if (entityType === "persons") {
        if (!UUID_RE.test(entityId)) {
            const { data: customer } = await supabase
                .from("customers")
                .select("primary_contact_id")
                .eq("org_id", ctx.orgId)
                .eq("id", customerId)
                .maybeSingle();
            entityId = String(customer?.primary_contact_id ?? "").trim();
        }
        if (!UUID_RE.test(entityId)) {
            return NextResponse.json({ error: "Could not resolve a person anchor for this note" }, { status: 400 });
        }
        const personCheck = await assertRowOrg(supabase, "persons", entityId, ctx.orgId);
        if (!personCheck.ok) return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const exec = await executeCommunicationsSend({
        supabase,
        orgId: ctx.orgId,
        quickMessage: false,
        primaryEntityType: entityType,
        primaryEntityId: entityId,
        channel: "in_app",
        textRaw: message,
        subjectRawEmail: undefined,
        bindingIdOpt: "",
        recipientPersonIdRaw: "",
        toRawInput: "",
        sendMetadataAugment: {
            kind: "note",
            source: "comms_v2_note_compose",
            customer_id: customerId,
            author_user_id: ctx.userId ?? null,
        },
    });

    if (!exec.ok) {
        return NextResponse.json(
            { error: exec.error, code: exec.code, thread_id: exec.thread_id },
            { status: exec.status ?? 500 }
        );
    }

    return NextResponse.json({
        ok: true,
        communication_message_id: exec.communication_message_id,
        thread_id: exec.thread_id,
    });
}
