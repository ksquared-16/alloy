import { NextRequest, NextResponse } from "next/server";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    assignProgramDistribution,
    createProgramDraft,
    loadProgramPublicationSnapshot,
    previewProgramDistribution,
    publishProgramDraft,
    retryProgramDistribution,
    updateProgramDraft,
    validateProgramDraft,
} from "@/lib/programs/publication/programPublicationService";

type ActionBody = {
    action?: string;
    programId?: string;
    publicationId?: string;
    runId?: string;
    key?: string;
    label?: string;
    targetIds?: string[];
    patch?: Record<string, unknown>;
};

export function canReadProgramPublication(context: {
    roleKeys: string[];
    permissionKeys: string[];
}): boolean {
    return (
        context.permissionKeys.includes("settings.read")
        || context.permissionKeys.includes("settings.manage")
        || context.roleKeys.some((role) => ["owner", "admin", "ops", "manager"].includes(role))
    );
}

export function canManageProgramPublication(context: {
    roleKeys: string[];
    permissionKeys: string[];
}): boolean {
    return (
        context.permissionKeys.includes("settings.manage")
        || context.roleKeys.some((role) => ["owner", "admin", "ops"].includes(role))
    );
}

function requiredString(value: unknown, label: string): string {
    const result = typeof value === "string" ? value.trim() : "";
    if (!result) throw new Error(`${label} is required.`);
    return result;
}

function targetIds(value: unknown): string[] {
    if (!Array.isArray(value)) throw new Error("Choose at least one Location.");
    return value.map(String).map((id) => id.trim()).filter(Boolean);
}

function operatorError(error: unknown): string {
    const message = error instanceof Error ? error.message : "The request could not be completed.";
    if (message.includes("duplicate key") || message.includes("programs_org_key_unique")) {
        return "A Program with this key already exists.";
    }
    if (message.includes("program_draft_not_validated")) {
        return "Validate this Program before publishing it.";
    }
    if (message.includes("program_retired")) {
        return "A retired Program cannot be published.";
    }
    return message.replace(/^[A-Za-z ]+:\s*/, "");
}

export async function GET() {
    const context = await getAdminAccessContextCached();
    if (!context.ok) return adminContextFailureResponse(context);
    if (!canReadProgramPublication(context)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const snapshot = await loadProgramPublicationSnapshot(
            createAdminClient(),
            context.orgId,
            {
                allowedSiteLocationIds: context.allowedSiteLocationIds,
                canManage: canManageProgramPublication(context),
            },
        );
        return NextResponse.json(snapshot);
    } catch (error) {
        return NextResponse.json({ error: operatorError(error) }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const context = await getAdminAccessContextCached();
    if (!context.ok) return adminContextFailureResponse(context);
    if (!canManageProgramPublication(context)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: ActionBody;
    try {
        body = (await request.json()) as ActionBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        switch (body.action) {
            case "create_draft": {
                const programId = await createProgramDraft({
                    supabase,
                    orgId: context.orgId,
                    actorUserId: context.userId,
                    key: requiredString(body.key, "Program key"),
                    label: requiredString(body.label, "Program name"),
                });
                return NextResponse.json({ ok: true, programId }, { status: 201 });
            }
            case "update_draft": {
                await updateProgramDraft({
                    supabase,
                    orgId: context.orgId,
                    actorUserId: context.userId,
                    programId: requiredString(body.programId, "Program"),
                    patch:
                        body.patch != null
                        && typeof body.patch === "object"
                        && !Array.isArray(body.patch)
                            ? body.patch
                            : {},
                });
                return NextResponse.json({ ok: true });
            }
            case "validate_draft": {
                const errors = await validateProgramDraft({
                    supabase,
                    orgId: context.orgId,
                    actorUserId: context.userId,
                    programId: requiredString(body.programId, "Program"),
                });
                return NextResponse.json({ ok: errors.length === 0, errors });
            }
            case "publish": {
                const result = await publishProgramDraft({
                    supabase,
                    orgId: context.orgId,
                    actorUserId: context.userId,
                    programId: requiredString(body.programId, "Program"),
                });
                return NextResponse.json({ ok: true, result });
            }
            case "preview": {
                const preview = await previewProgramDistribution({
                    supabase,
                    orgId: context.orgId,
                    publicationId: requiredString(body.publicationId, "Publication"),
                    targetIds: targetIds(body.targetIds),
                    allowedSiteLocationIds: context.allowedSiteLocationIds,
                });
                return NextResponse.json({ ok: true, preview });
            }
            case "assign": {
                const result = await assignProgramDistribution({
                    supabase,
                    orgId: context.orgId,
                    actorUserId: context.userId,
                    publicationId: requiredString(body.publicationId, "Publication"),
                    targetIds: targetIds(body.targetIds),
                    allowedSiteLocationIds: context.allowedSiteLocationIds,
                });
                return NextResponse.json({ ok: true, result });
            }
            case "retry": {
                const result = await retryProgramDistribution({
                    supabase,
                    orgId: context.orgId,
                    actorUserId: context.userId,
                    runId: requiredString(body.runId, "Delivery run"),
                    allowedSiteLocationIds: context.allowedSiteLocationIds,
                });
                return NextResponse.json({ ok: true, result });
            }
            default:
                return NextResponse.json({ error: "Unknown Programs action." }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({ error: operatorError(error) }, { status: 400 });
    }
}
