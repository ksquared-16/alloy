import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import {
    resolveFamilyCommunicationWorkspace,
    resolveCustomerScopeFromEntity,
    FAMILY_WORKSPACE_RESOLVER_VERSION,
    type ComposerChannel,
} from "@/lib/communications/v2/familyWorkspace";

/**
 * GET /api/admin/communications/family-workspace — UI-5A.
 * Customer-scoped Family Communication Workspace VM (family + children + recipient roster with
 * per-channel eligibility). DARK behind comms_v2_command_center. Read-only; no send, no consent
 * enforcement (consent surfaced passively as "unset"), no schema.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const url = new URL(req.url);
    const directCustomerId = (url.searchParams.get("customer_id") ?? "").trim();
    const entityType = (url.searchParams.get("entity_type") ?? "").trim();
    const entityId = (url.searchParams.get("entity_id") ?? "").trim();
    let focusChildId = url.searchParams.get("focus_child_id");
    let focusOpportunityId = url.searchParams.get("focus_opportunity_id");
    let focusPersonId = url.searchParams.get("focus_person_id");
    const selectedThreadId = url.searchParams.get("thread_id");
    const channelParamRaw = (url.searchParams.get("composer_channel") ?? "email").toLowerCase();
    const composerChannel: ComposerChannel =
        channelParamRaw === "sms" ? "sms" : channelParamRaw === "note" ? "note" : "email";

    const supabase = createAdminClient();

    // UI-6: accept a direct customer_id OR a drawer entity (opportunity/child/person/customer).
    let customerId = directCustomerId;
    if (!customerId) {
        if (!entityType || !UUID_RE.test(entityId)) {
            return NextResponse.json({ error: "Provide customer_id (UUID) or entity_type + entity_id (UUID)" }, { status: 400 });
        }
        const scope = await resolveCustomerScopeFromEntity(supabase, ctx.orgId, entityType, entityId);
        if (!scope.customerId) return NextResponse.json({ error: "Could not resolve a family for that entity" }, { status: 404 });
        customerId = scope.customerId;
        focusChildId = focusChildId || scope.focusChildId;
        focusOpportunityId = focusOpportunityId || scope.focusOpportunityId;
        focusPersonId = focusPersonId || scope.focusPersonId;
    }
    if (!UUID_RE.test(customerId)) {
        return NextResponse.json({ error: "customer_id must be a UUID" }, { status: 400 });
    }

    const orgCheck = await assertRowOrg(supabase, "customers", customerId, ctx.orgId);
    if (!orgCheck.ok) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    try {
        const workspace = await resolveFamilyCommunicationWorkspace(supabase, ctx.orgId, {
            customerId,
            focusChildId: focusChildId || null,
            focusOpportunityId: focusOpportunityId || null,
            focusPersonId: focusPersonId || null,
            composerChannel,
            selectedThreadId: selectedThreadId || null,
            viewerUserId: ctx.userId,
        });
        return NextResponse.json({
            workspace,
            meta: {
                resolver_version: FAMILY_WORKSPACE_RESOLVER_VERSION,
                customer_id: customerId,
                generated_at: new Date().toISOString(),
                adult_count: workspace.eligibleRecipients.length + workspace.disabledRecipients.length,
                child_count: workspace.children.length,
                eligible_count: workspace.eligibleRecipients.length,
                disabled_count: workspace.disabledRecipients.length,
                thread_count: workspace.threads.length,
                message_count: workspace.timelineEvents.length,
                selected_thread_id: workspace.selectedThread?.id ?? null,
            },
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to resolve family workspace" },
            { status: 500 }
        );
    }
}
