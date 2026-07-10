import { NextResponse } from "next/server";
import { requireAdminOrOps } from "@/lib/adminAuth";

/** Configuration writes for identity platform require admin/ops (matches bindings PATCH). */
export async function requireIdentityPlatformAdmin(): Promise<Response | null> {
    return requireAdminOrOps();
}

export function adminForbiddenResponse(): NextResponse {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
