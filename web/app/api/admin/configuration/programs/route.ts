import { NextRequest, NextResponse } from "next/server";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { classifyConfigurationRuntimeIssue } from "@/lib/configPublication/runtimeIssue";
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
import {
    commitMakeProgramAvailable,
    previewMakeProgramAvailable,
} from "@/lib/programs/commands/makeProgramAvailable";

type ActionBody = {
    action?: string;
    programId?: string;
    publicationId?: string;
    runId?: string;
    key?: string;
    label?: string;
    description?: string | null;
    targetIds?: string[];
    locationIds?: string[];
    originatingLocationId?: string;
    idempotencyKey?: string;
    entryPoint?: "organization_program" | "location" | "unknown";
    program?: {
        kind?: "existing" | "new";
        programId?: string;
        publicationId?: string;
        revisionId?: string;
        input?: { key?: string; label?: string; description?: string | null };
    };
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

function parseMakeAvailableProgram(body: ActionBody): {
    kind: "existing";
    programId: string;
    publicationId?: string;
    revisionId?: string;
} | {
    kind: "new";
    input: { key: string; label: string; description?: string | null };
} {
    const nested = body.program;
    if (nested?.kind === "new" || (!nested && body.key && body.label && !body.programId)) {
        return {
            kind: "new",
            input: {
                key: requiredString(nested?.input?.key ?? body.key, "Program key"),
                label: requiredString(nested?.input?.label ?? body.label, "Program name"),
                description: nested?.input?.description ?? body.description ?? null,
            },
        };
    }
    return {
        kind: "existing",
        programId: requiredString(nested?.programId ?? body.programId, "Program"),
        publicationId: nested?.publicationId ?? body.publicationId,
        revisionId: nested?.revisionId,
    };
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

function configurationIssueResponse(
    error: unknown,
    options: { fallbackMessage?: string; fallbackStatus?: number } = {},
) {
    const classified = classifyConfigurationRuntimeIssue(error, {
        domainLabel: "Programs",
        fallbackMessage: options.fallbackMessage,
        fallbackStatus: options.fallbackStatus,
    });
    console.error("[configuration-runtime]", {
        domain: "programs",
        code: classified.issue.code,
        reference: classified.issue.reference,
        technical: classified.technical,
    });
    return NextResponse.json({ error: classified.issue }, { status: classified.status });
}

export async function GET() {
    const context = await getAdminAccessContextCached();
    if (!context.ok) return adminContextFailureResponse(context);
    if (!canReadProgramPublication(context)) {
        return configurationIssueResponse(new Error("Forbidden"), { fallbackStatus: 403 });
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
        return configurationIssueResponse(error, { fallbackStatus: 500 });
    }
}

export async function POST(request: NextRequest) {
    const context = await getAdminAccessContextCached();
    if (!context.ok) return adminContextFailureResponse(context);
    if (!canManageProgramPublication(context)) {
        return configurationIssueResponse(new Error("Forbidden"), { fallbackStatus: 403 });
    }

    let body: ActionBody;
    try {
        body = (await request.json()) as ActionBody;
    } catch {
        return configurationIssueResponse(new Error("Invalid Programs request body"), {
            fallbackMessage: "The Programs request could not be read.",
            fallbackStatus: 400,
        });
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
            case "preview_make_available": {
                const preview = await previewMakeProgramAvailable(supabase, {
                    orgId: context.orgId,
                    actorUserId: context.userId,
                    program: parseMakeAvailableProgram(body),
                    locationIds: targetIds(body.locationIds ?? body.targetIds),
                    originatingLocationId: body.originatingLocationId ?? null,
                    idempotencyKey: requiredString(body.idempotencyKey, "Idempotency key"),
                    allowedSiteLocationIds: context.allowedSiteLocationIds,
                    entryPoint: body.entryPoint ?? "unknown",
                });
                return NextResponse.json({ ok: true, preview });
            }
            case "make_available": {
                const result = await commitMakeProgramAvailable(supabase, {
                    orgId: context.orgId,
                    actorUserId: context.userId,
                    program: parseMakeAvailableProgram(body),
                    locationIds: targetIds(body.locationIds ?? body.targetIds),
                    originatingLocationId: body.originatingLocationId ?? null,
                    idempotencyKey: requiredString(body.idempotencyKey, "Idempotency key"),
                    allowedSiteLocationIds: context.allowedSiteLocationIds,
                    entryPoint: body.entryPoint ?? "unknown",
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
                return configurationIssueResponse(new Error("Unknown Programs action"), {
                    fallbackMessage: "That Programs action is not available.",
                    fallbackStatus: 400,
                });
        }
    } catch (error) {
        return configurationIssueResponse(error, {
            fallbackMessage: operatorError(error),
            fallbackStatus: 400,
        });
    }
}
