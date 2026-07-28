import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";
import { invalidateConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";
import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import type { SurfaceCommandExposureKind } from "@/lib/adminV2/settings/surfaces/surfaceCommandExposure";
import {
    loadSurfaceCommandExposure,
    saveSurfaceCommandExposureToggle,
} from "@/lib/adminV2/settings/surfaces/surfaceCommandExposureService";

const SECTIONS: readonly SurfaceConfigSectionKey[] = [
    "focus-panels",
    "queue-rows",
    "workspaces",
    "work-units",
];

function parseSection(raw: string | null): SurfaceConfigSectionKey | null {
    const s = (raw ?? "").trim() as SurfaceConfigSectionKey;
    return (SECTIONS as readonly string[]).includes(s) ? s : null;
}

/** GET — Surface Command Exposure editor payload (process-selected candidates + toggles). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    const section = parseSection(request.nextUrl.searchParams.get("section"));
    if (!section) {
        return NextResponse.json(
            { error: "section is required (focus-panels | queue-rows | workspaces | work-units)" },
            { status: 400 }
        );
    }

    const departmentId = request.nextUrl.searchParams.get("departmentId");
    const processId = request.nextUrl.searchParams.get("processId");

    try {
        const supabase = createAdminClient();
        const payload = await loadSurfaceCommandExposure({
            supabase,
            orgId: ctx.orgId,
            section,
            departmentId,
            processId,
        });
        return NextResponse.json(payload);
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load Command exposure" },
            { status: 500 }
        );
    }
}

/** PUT — toggle a process-selected Command on a Surface exposure. */
export async function PUT(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const section = parseSection(typeof b.section === "string" ? b.section : null);
    if (!section) {
        return NextResponse.json({ error: "section is required" }, { status: 400 });
    }
    const capabilityKey = typeof b.capabilityKey === "string" ? b.capabilityKey.trim() : "";
    const exposureKind = (
        typeof b.exposureKind === "string" ? b.exposureKind.trim() : ""
    ) as SurfaceCommandExposureKind;
    if (!capabilityKey || !exposureKind) {
        return NextResponse.json(
            { error: "capabilityKey and exposureKind are required" },
            { status: 400 }
        );
    }
    if (typeof b.enabled !== "boolean") {
        return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await saveSurfaceCommandExposureToggle({
        supabase,
        orgId: ctx.orgId,
        section,
        departmentId: typeof b.departmentId === "string" ? b.departmentId : null,
        processId: typeof b.processId === "string" ? b.processId : null,
        capabilityKey,
        exposureKind,
        enabled: b.enabled,
        orderIndex: typeof b.orderIndex === "number" ? b.orderIndex : undefined,
    });
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
    invalidateConfigReadCache(ctx.orgId);

    const payload = await loadSurfaceCommandExposure({
        supabase,
        orgId: ctx.orgId,
        section,
        departmentId: typeof b.departmentId === "string" ? b.departmentId : null,
        processId: typeof b.processId === "string" ? b.processId : null,
    });
    return NextResponse.json(payload);
}
