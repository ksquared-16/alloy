import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    platformLifecycleProgressionRequirementsForStage,
    LIFECYCLE_STAGE_ORDER,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    buildLifecycleRequirementsOverridePatch,
    buildLifecycleRequirementsResetStagePatch,
    departmentHasStageOverride,
    effectiveLifecycleProgressionRequirementsForStage,
    parseLifecycleProgressionRequirementsOverride,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}

function deepMergeJsonObjects(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...a };
    for (const [k, bv] of Object.entries(b)) {
        const av = a[k];
        if (
            bv !== null &&
            typeof bv === "object" &&
            !Array.isArray(bv) &&
            av !== null &&
            typeof av === "object" &&
            !Array.isArray(av)
        ) {
            out[k] = deepMergeJsonObjects(av as Record<string, unknown>, bv as Record<string, unknown>);
        } else {
            out[k] = bv;
        }
    }
    return out;
}

async function loadDepartment(orgId: string, departmentId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("departments")
        .select("id, org_id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; metadata?: unknown } | null;
}

/** GET: platform defaults + effective + override for lifecycle requirements. */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = await loadDepartment(ctx.orgId, departmentId);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const metadata =
        row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};

    const override = parseLifecycleProgressionRequirementsOverride(metadata);
    const stages = Object.fromEntries(
        LIFECYCLE_STAGE_ORDER.map((stage) => {
            const platform = platformLifecycleProgressionRequirementsForStage(stage);
            const effective = effectiveLifecycleProgressionRequirementsForStage(stage, metadata);
            return [
                stage,
                {
                    platform: {
                        required_labels: platform.required.map((r) => r.label),
                        recommended_labels: platform.recommended.map((r) => r.label),
                    },
                    effective: {
                        required_labels: effective.required.map((r) => r.label),
                        recommended_labels: effective.recommended.map((r) => r.label),
                        source: effective.source,
                    },
                    has_department_override: departmentHasStageOverride(override, stage),
                },
            ];
        })
    );

    return NextResponse.json({
        department_id: departmentId,
        override,
        stages,
    });
}

/** PATCH: save stage labels or reset a stage to platform defaults. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const row = await loadDepartment(ctx.orgId, departmentId);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const prevMeta =
        row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};

    const resetStage = typeof body.reset_stage === "string" ? body.reset_stage.trim() : "";
    if (resetStage) {
        if (!isStageKey(resetStage)) {
            return NextResponse.json({ error: "Invalid reset_stage" }, { status: 400 });
        }
        const patch = buildLifecycleRequirementsResetStagePatch({
            stage: resetStage,
            existingMetadata: prevMeta,
        });
        if (!patch) {
            return NextResponse.json({ ok: true, message: "Stage already uses platform defaults." });
        }
        const metadata = deepMergeJsonObjects(prevMeta, patch);
        const supabase = createAdminClient();
        const { data: updated, error } = await supabase
            .from("departments")
            .update({ metadata, updated_at: new Date().toISOString() })
            .eq("id", departmentId)
            .eq("org_id", ctx.orgId)
            .select("metadata")
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true, metadata: updated?.metadata ?? metadata });
    }

    const stage = typeof body.stage === "string" ? body.stage.trim() : "";
    if (!isStageKey(stage)) {
        return NextResponse.json({ error: "stage is required" }, { status: 400 });
    }

    const required_labels = Array.isArray(body.required_labels)
        ? body.required_labels.filter((x): x is string => typeof x === "string")
        : null;
    const recommended_labels = Array.isArray(body.recommended_labels)
        ? body.recommended_labels.filter((x): x is string => typeof x === "string")
        : null;
    if (!required_labels || !recommended_labels) {
        return NextResponse.json({ error: "required_labels and recommended_labels are required" }, { status: 400 });
    }

    let metadataPatch: Record<string, unknown>;
    try {
        metadataPatch = buildLifecycleRequirementsOverridePatch({
            stage,
            required_labels,
            recommended_labels,
            existingMetadata: prevMeta,
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Invalid labels" },
            { status: 400 }
        );
    }

    const metadata = deepMergeJsonObjects(prevMeta, metadataPatch);
    const supabase = createAdminClient();
    const { data: updated, error } = await supabase
        .from("departments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .select("metadata")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, metadata: updated?.metadata ?? metadata });
}
