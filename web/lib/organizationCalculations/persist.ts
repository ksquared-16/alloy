/**
 * Server persistence for Organization Calculations (draft → publish immutable).
 * Uses service-role client; callers must already have passed admin AuthZ.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    parseAndValidateOrgCalcExpr,
    type OrgCalcExpr,
} from "@/lib/organizationCalculations/ast";
import { extractDependencyRefs } from "@/lib/organizationCalculations/dependencies";

export type OrgCalcLifecycle = "draft" | "published" | "archived";

export type OrganizationCalculationRow = {
    id: string;
    org_id: string;
    key: string;
    name: string;
    description: string | null;
    subject_grain: string;
    lifecycle: OrgCalcLifecycle;
    published_version_id: string | null;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};

export type OrganizationCalculationVersionRow = {
    id: string;
    organization_calculation_id: string;
    org_id: string;
    version_number: number;
    expression_ast: OrgCalcExpr;
    dependency_refs: string[];
    consumer_bindings: Record<string, unknown>;
    published_at: string | null;
    published_by: string | null;
    immutable: boolean;
    created_at: string;
};

export type ConsumerBindings = {
    /** When true on an immutable version, that exact version is consumed by the room surface. */
    runtime_surface?: boolean;
};

/** Strip runtime binding when forking a new draft so publish v2 does not silently rebind. */
function bindingsForNewDraft(source: ConsumerBindings | Record<string, unknown> | undefined): ConsumerBindings {
    const next = { ...(source ?? {}) } as ConsumerBindings;
    delete next.runtime_surface;
    return next;
}

function slugifyKey(name: string): string {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48);
    return `orgcalc.${slug || "untitled"}`;
}

export async function listOrganizationCalculations(
    supabase: SupabaseClient,
    orgId: string,
): Promise<OrganizationCalculationRow[]> {
    const { data, error } = await supabase
        .from("organization_calculations")
        .select("*")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as OrganizationCalculationRow[];
}

export async function getOrganizationCalculation(
    supabase: SupabaseClient,
    orgId: string,
    id: string,
): Promise<{
    calculation: OrganizationCalculationRow;
    versions: OrganizationCalculationVersionRow[];
    draftVersion: OrganizationCalculationVersionRow | null;
    publishedVersion: OrganizationCalculationVersionRow | null;
} | null> {
    const { data: calc, error } = await supabase
        .from("organization_calculations")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!calc) return null;

    const { data: versions, error: vErr } = await supabase
        .from("organization_calculation_versions")
        .select("*")
        .eq("org_id", orgId)
        .eq("organization_calculation_id", id)
        .order("version_number", { ascending: true });
    if (vErr) throw new Error(vErr.message);

    const rows = (versions ?? []) as OrganizationCalculationVersionRow[];
    const publishedVersion =
        calc.published_version_id ?
            rows.find((v) => v.id === calc.published_version_id) ?? null
        :   null;
    const draftVersion = [...rows].reverse().find((v) => !v.immutable) ?? null;

    return {
        calculation: calc as OrganizationCalculationRow,
        versions: rows,
        draftVersion,
        publishedVersion,
    };
}

export async function createOrganizationCalculationDraft(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        userId: string | null;
        name: string;
        description?: string | null;
        subjectGrain?: string;
        expressionAst: unknown;
        consumerBindings?: ConsumerBindings;
        key?: string;
    },
): Promise<{ calculation: OrganizationCalculationRow; version: OrganizationCalculationVersionRow }> {
    const parsed = parseAndValidateOrgCalcExpr(args.expressionAst);
    if (!parsed.ok) {
        throw new Error(`Invalid expression: ${parsed.issues.map((i) => i.message).join("; ")}`);
    }
    const deps = extractDependencyRefs(parsed.expr);
    const key = args.key?.trim() || slugifyKey(args.name);

    const { data: calc, error } = await supabase
        .from("organization_calculations")
        .insert({
            org_id: args.orgId,
            key,
            name: args.name.trim(),
            description: args.description?.trim() || null,
            subject_grain: args.subjectGrain ?? "room",
            lifecycle: "draft",
            created_by: args.userId,
            updated_by: args.userId,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    const { data: version, error: vErr } = await supabase
        .from("organization_calculation_versions")
        .insert({
            organization_calculation_id: calc.id,
            org_id: args.orgId,
            version_number: 1,
            expression_ast: parsed.expr,
            dependency_refs: deps,
            consumer_bindings: args.consumerBindings ?? {},
            immutable: false,
        })
        .select("*")
        .single();
    if (vErr) throw new Error(vErr.message);

    return {
        calculation: calc as OrganizationCalculationRow,
        version: version as OrganizationCalculationVersionRow,
    };
}

export async function updateOrganizationCalculationDraft(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        userId: string | null;
        id: string;
        name?: string;
        description?: string | null;
        expressionAst?: unknown;
        consumerBindings?: ConsumerBindings;
    },
): Promise<{
    calculation: OrganizationCalculationRow;
    version: OrganizationCalculationVersionRow;
}> {
    const loaded = await getOrganizationCalculation(supabase, args.orgId, args.id);
    if (!loaded) throw new Error("Organization calculation not found");
    if (loaded.calculation.lifecycle === "archived") {
        throw new Error("Cannot edit archived organization calculation");
    }

    const calcPatch: Record<string, unknown> = {
        updated_by: args.userId,
        updated_at: new Date().toISOString(),
    };
    if (args.name != null) calcPatch.name = args.name.trim();
    if (args.description !== undefined) calcPatch.description = args.description?.trim() || null;

    const { data: calc, error } = await supabase
        .from("organization_calculations")
        .update(calcPatch)
        .eq("org_id", args.orgId)
        .eq("id", args.id)
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    let version = loaded.draftVersion;
    if (args.expressionAst !== undefined || args.consumerBindings !== undefined) {
        const baseAst = args.expressionAst ?? loaded.draftVersion?.expression_ast ?? loaded.publishedVersion?.expression_ast;
        if (baseAst == null) throw new Error("No expression to update");
        const parsed = parseAndValidateOrgCalcExpr(baseAst);
        if (!parsed.ok) {
            throw new Error(`Invalid expression: ${parsed.issues.map((i) => i.message).join("; ")}`);
        }
        const deps = extractDependencyRefs(parsed.expr);
        const bindings =
            args.consumerBindings != null ?
                args.consumerBindings
            : version && !version.immutable ?
                (version.consumer_bindings as ConsumerBindings)
            :   bindingsForNewDraft(
                    (loaded.draftVersion?.consumer_bindings as ConsumerBindings | undefined) ??
                        (loaded.publishedVersion?.consumer_bindings as ConsumerBindings | undefined),
                );

        if (version && !version.immutable) {
            const { data: updated, error: uErr } = await supabase
                .from("organization_calculation_versions")
                .update({
                    expression_ast: parsed.expr,
                    dependency_refs: deps,
                    consumer_bindings: bindings,
                })
                .eq("id", version.id)
                .eq("org_id", args.orgId)
                .eq("immutable", false)
                .select("*")
                .single();
            if (uErr) throw new Error(uErr.message);
            version = updated as OrganizationCalculationVersionRow;
        } else {
            const nextNum =
                loaded.versions.length === 0 ?
                    1
                :   Math.max(...loaded.versions.map((v) => v.version_number)) + 1;
            const { data: created, error: cErr } = await supabase
                .from("organization_calculation_versions")
                .insert({
                    organization_calculation_id: args.id,
                    org_id: args.orgId,
                    version_number: nextNum,
                    expression_ast: parsed.expr,
                    dependency_refs: deps,
                    // New draft after publish never inherits runtime binding.
                    consumer_bindings: bindingsForNewDraft(bindings),
                    immutable: false,
                })
                .select("*")
                .single();
            if (cErr) throw new Error(cErr.message);
            version = created as OrganizationCalculationVersionRow;
        }
    }

    if (!version) {
        version = loaded.draftVersion ?? loaded.publishedVersion!;
    }

    return {
        calculation: calc as OrganizationCalculationRow,
        version,
    };
}

export async function publishOrganizationCalculation(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null; id: string },
): Promise<{
    calculation: OrganizationCalculationRow;
    version: OrganizationCalculationVersionRow;
}> {
    const loaded = await getOrganizationCalculation(supabase, args.orgId, args.id);
    if (!loaded) throw new Error("Organization calculation not found");
    const draft = loaded.draftVersion;
    if (!draft) {
        if (loaded.publishedVersion) {
            return { calculation: loaded.calculation, version: loaded.publishedVersion };
        }
        throw new Error("No draft version to publish");
    }
    if (draft.immutable) throw new Error("Version is already immutable");

    const now = new Date().toISOString();
    const { data: version, error: vErr } = await supabase
        .from("organization_calculation_versions")
        .update({
            immutable: true,
            published_at: now,
            published_by: args.userId,
        })
        .eq("id", draft.id)
        .eq("org_id", args.orgId)
        .eq("immutable", false)
        .select("*")
        .single();
    if (vErr) throw new Error(vErr.message);

    const { data: calc, error } = await supabase
        .from("organization_calculations")
        .update({
            lifecycle: "published",
            published_version_id: version.id,
            updated_by: args.userId,
            updated_at: now,
        })
        .eq("id", args.id)
        .eq("org_id", args.orgId)
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    return {
        calculation: calc as OrganizationCalculationRow,
        version: version as OrganizationCalculationVersionRow,
    };
}

/**
 * Exact-version runtime consumers: immutable versions with runtime_surface=true.
 * Does NOT follow published_version_id — publish v2 leaves prior bound version until rebound.
 */
export async function listPublishedRuntimeSurfaceCalculations(
    supabase: SupabaseClient,
    orgId: string,
): Promise<
    Array<{
        calculation: OrganizationCalculationRow;
        version: OrganizationCalculationVersionRow;
    }>
> {
    const calcs = await listOrganizationCalculations(supabase, orgId);
    const out: Array<{
        calculation: OrganizationCalculationRow;
        version: OrganizationCalculationVersionRow;
    }> = [];

    for (const calc of calcs) {
        if (calc.lifecycle === "archived") continue;
        const { data: versions, error } = await supabase
            .from("organization_calculation_versions")
            .select("*")
            .eq("org_id", orgId)
            .eq("organization_calculation_id", calc.id)
            .eq("immutable", true)
            .order("version_number", { ascending: false });
        if (error) throw new Error(error.message);
        const bound = (versions ?? []).find((v) => {
            const bindings = (v.consumer_bindings ?? {}) as ConsumerBindings;
            return bindings.runtime_surface === true;
        });
        if (!bound) continue;
        out.push({
            calculation: calc,
            version: bound as OrganizationCalculationVersionRow,
        });
    }
    return out;
}

/** Bind an exact immutable version to the room-capacity runtime surface (clears siblings). */
export async function bindRuntimeSurfaceVersion(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null; calculationId: string; versionId: string },
): Promise<{ calculation: OrganizationCalculationRow; version: OrganizationCalculationVersionRow }> {
    const loaded = await getOrganizationCalculation(supabase, args.orgId, args.calculationId);
    if (!loaded) throw new Error("Organization calculation not found");
    if (loaded.calculation.lifecycle === "archived") {
        throw new Error("Cannot bind an archived organization calculation");
    }
    const target = loaded.versions.find((v) => v.id === args.versionId);
    if (!target) throw new Error("Version not found");
    if (!target.immutable) throw new Error("Only immutable (published) versions can bind to runtime");

    for (const v of loaded.versions) {
        const bindings = { ...(v.consumer_bindings ?? {}) } as ConsumerBindings;
        const want = v.id === args.versionId;
        if (want === Boolean(bindings.runtime_surface)) continue;
        const next: ConsumerBindings = { ...bindings };
        if (want) next.runtime_surface = true;
        else delete next.runtime_surface;
        const { error } = await supabase
            .from("organization_calculation_versions")
            .update({ consumer_bindings: next })
            .eq("id", v.id)
            .eq("org_id", args.orgId);
        if (error) throw new Error(error.message);
    }

    const refreshed = await getOrganizationCalculation(supabase, args.orgId, args.calculationId);
    if (!refreshed) throw new Error("Organization calculation not found after bind");
    const version = refreshed.versions.find((v) => v.id === args.versionId)!;
    await supabase
        .from("organization_calculations")
        .update({ updated_by: args.userId, updated_at: new Date().toISOString() })
        .eq("id", args.calculationId)
        .eq("org_id", args.orgId);

    return { calculation: refreshed.calculation, version };
}

export async function archiveOrganizationCalculation(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null; id: string },
): Promise<OrganizationCalculationRow> {
    const loaded = await getOrganizationCalculation(supabase, args.orgId, args.id);
    if (!loaded) throw new Error("Organization calculation not found");

    // Clear runtime bindings so archived calcs leave the room surface.
    for (const v of loaded.versions) {
        const bindings = { ...(v.consumer_bindings ?? {}) } as ConsumerBindings;
        if (!bindings.runtime_surface) continue;
        const next = { ...bindings };
        delete next.runtime_surface;
        const { error } = await supabase
            .from("organization_calculation_versions")
            .update({ consumer_bindings: next })
            .eq("id", v.id)
            .eq("org_id", args.orgId);
        if (error) throw new Error(error.message);
    }

    const { data, error } = await supabase
        .from("organization_calculations")
        .update({
            lifecycle: "archived",
            updated_by: args.userId,
            updated_at: new Date().toISOString(),
        })
        .eq("id", args.id)
        .eq("org_id", args.orgId)
        .select("*")
        .single();
    if (error) throw new Error(error.message);
    return data as OrganizationCalculationRow;
}
