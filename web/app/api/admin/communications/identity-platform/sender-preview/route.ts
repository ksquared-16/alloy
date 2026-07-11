import { NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    hasCommunicationsSendPermission,
    assertCommunicationsSendAllowed,
} from "@/lib/communications/communicationPermissions";
import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";
import {
    listEligibleIdentitiesForOperator,
    previewSender,
} from "@/lib/communications/identity/admin/identityAdminService";
import { operatorCanOverrideSender } from "@/lib/communications/identity/admin/defaultGrantPolicy";
import { loadIdentityResolutionContext } from "@/lib/communications/identity/loadIdentityContext";
import { serializeSenderResolution } from "@/lib/communications/identity/resolveSenderIdentity";

export async function GET(req: Request) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const url = new URL(req.url);
    const channel = url.searchParams.get("channel");
    const locationId = url.searchParams.get("location_id");
    const identityId = url.searchParams.get("identity_id");

    if (channel !== "sms" && channel !== "email") {
        return NextResponse.json({ error: "channel required" }, { status: 400 });
    }

    const bundle = await loadAdminAccessBundleCached();
    const hasSend =
        bundle.ok && ctx.userId
            ? hasCommunicationsSendPermission(bundle.roleKeys, bundle.permissionKeys)
            : false;

    const supabase = createAdminClient();

    const eligible =
        ctx.userId && url.searchParams.get("eligible") === "true"
            ? await listEligibleIdentitiesForOperator({
                  supabase,
                  orgId: ctx.orgId,
                  operatorUserId: ctx.userId,
                  locationId,
                  channel,
                  hasCommunicationsSend: hasSend,
              })
            : null;

    const resolution = await previewSender({
        supabase,
        orgId: ctx.orgId,
        channel,
        operatorUserId: ctx.userId ?? null,
        locationId,
        requestedIdentityId: identityId,
        hasCommunicationsSend: hasSend,
    });

    let canOverride = false;
    if (ctx.userId && eligible && eligible.length > 1) {
        const resolutionCtx = await loadIdentityResolutionContext(supabase, ctx.orgId);
        const grants = resolutionCtx.grants.filter((g) => g.status === "active");
        canOverride = operatorCanOverrideSender({
            defaultAccessMode: "open_until_restricted",
            grants,
            operatorUserId: ctx.userId,
            hasCommunicationsSend: hasSend,
        });
    }

    return NextResponse.json({
        resolution: serializeSenderResolution(resolution),
        eligible_identities: eligible,
        can_override: canOverride,
    });
}
