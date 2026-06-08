import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { buildPacketReviewRollupV1 } from "@/lib/forms/packets/buildPacketReviewRollupV1";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** GET — read-only PacketReviewRollupV1 for operator review (no writes). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ packetSessionId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { packetSessionId } = await params;
    const id = String(packetSessionId ?? "").trim();
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: "Invalid packet session id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orgAssert = await assertRowOrg(supabase, "form_packet_sessions", id, ctx.orgId);
    if (!orgAssert.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const built = await buildPacketReviewRollupV1(supabase, ctx.orgId, id);
    if (!built.ok) {
        return NextResponse.json({ error: built.error }, { status: built.httpStatus });
    }

    return NextResponse.json({ ok: true, rollup: built.rollup });
}
