import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { ORG_DOCUMENTS_STORAGE_BUCKET } from "@/lib/storage/orgDocumentsBucket";
const EXPIRES_IN = 60 * 10; // 10 minutes

/** GET: return a signed URL for a vendor document. Query: path=<storage object path>. Path must start with vendors/${id}/ */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ ok: false, error: "Missing vendor id" }, { status: 400 });
    }

    const path = request.nextUrl.searchParams.get("path");
    if (!path || typeof path !== "string") {
        return NextResponse.json({ ok: false, error: "Missing path query param" }, { status: 400 });
    }

    const prefix = `vendors/${id}/`;
    if (!path.startsWith(prefix)) {
        return NextResponse.json({ ok: false, error: "Path must start with vendors/{id}/" }, { status: 400 });
    }

    try {
        const adminSb = createAdminClient();
        if (!(await assertRowOrg(adminSb, "vendors", id, ctx.orgId)).ok) {
            return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
        }
        const supabase = createServiceRoleClient();
        const { data, error } = await supabase.storage
            .from(ORG_DOCUMENTS_STORAGE_BUCKET)
            .createSignedUrl(path, EXPIRES_IN);

        if (error) {
            console.error("[VENDOR_DOC_SIGNED_URL]", error);
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        const signedUrl = data?.signedUrl ?? null;
        if (!signedUrl) {
            return NextResponse.json({ ok: false, error: "No signed URL returned" }, { status: 500 });
        }

        return NextResponse.json({ ok: true, signedUrl });
    } catch (err) {
        console.error("[VENDOR_DOC_SIGNED_URL]", err);
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : "Failed to create signed URL" },
            { status: 500 }
        );
    }
}
