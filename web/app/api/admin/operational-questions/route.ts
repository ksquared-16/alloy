import { NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { listOperationalQuestions } from "@/lib/operationalQuestions/catalog";

export const dynamic = "force-dynamic";

/** GET /api/admin/operational-questions — typed catalog (proving slice). */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    return NextResponse.json({ questions: listOperationalQuestions() });
}
