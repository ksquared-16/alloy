import { NextResponse } from "next/server";
import { getAdminContextCached, adminContextFailureResponse } from "@/lib/admin/getAdminContext";

export async function requireAnalyticsV2AdminContext() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return { ok: false as const, response: adminContextFailureResponse(ctx) };

    return { ok: true as const, ctx };
}

export async function requireAnalyticsV2AdminMutate() {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate;
    if (gate.ctx.role !== "admin") {
        return {
            ok: false as const,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
    }
    return gate;
}

export function zodErrorResponse(error: unknown) {
    const msg = error instanceof Error ? error.message : "Validation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
}
