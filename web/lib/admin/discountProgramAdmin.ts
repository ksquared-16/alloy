/**
 * Admin discount programs: validation + CRUD against discount_programs (+ benefits, qualifiers, commitment_rules).
 * Reads use public.discount_programs_admin_v. Legacy discount_codes remain for runtime/job flows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Row shape from discount_programs_admin_v (nullable-friendly). */
export type DiscountProgramAdminViewRow = {
    id: string;
    org_id?: string | null;
    name?: string | null;
    code?: string | null;
    status?: string | null;
    program_type?: string | null;
    stacking_mode?: string | null;
    priority?: number | null;
    valid_from?: string | null;
    valid_to?: string | null;
    first_time_customer_only?: boolean | null;
    auto_apply?: boolean | null;
    applies_to_entity_type?: string | null;
    ghl_tag?: string | null;
    legacy_discount_code_id?: string | null;
    is_legacy_migrated?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
    /** Denormalized primary benefit */
    primary_benefit_id?: string | null;
    primary_benefit_type?: string | null;
    primary_benefit_applies_to?: string | null;
    primary_benefit_service_index?: number | null;
    primary_benefit_amount_cents?: number | null;
    primary_benefit_percent_basis_points?: number | null;
    /** Vertical restriction (UI / enriched from discount_program_qualifiers.vertical_slug_in value_json) */
    applies_to_vertical_slug?: string | null;
    /** Denormalized commitment */
    commitment_rule_id?: string | null;
    enrollment_mode?: string | null;
    commitment_start_mode?: string | null;
    benefit_grant_timing?: string | null;
    required_service_count?: number | null;
    timeframe_days?: number | null;
    qualifying_service_status?: string | null;
    breach_policy?: string | null;
    max_redemptions_per_customer?: number | null;
    [key: string]: unknown;
};

export type DiscountProgramBenefitInput = {
    benefit_type: string;
    applies_to: string;
    service_index?: number | null;
    amount_cents?: number | null;
    percent_basis_points?: number | null;
};

export type DiscountProgramCommitmentInput = {
    enrollment_mode: string;
    commitment_start_mode: string;
    benefit_grant_timing: string;
    required_service_count: number;
    timeframe_days: number;
    qualifying_service_status: string;
    breach_policy: string;
    max_redemptions_per_customer: number;
};

export type DiscountProgramWritePayload = {
    name: string;
    code: string | null;
    status: string;
    program_type: string;
    stacking_mode: string;
    priority: number;
    valid_from: string | null;
    valid_to: string | null;
    first_time_customer_only: boolean;
    auto_apply: boolean;
    applies_to_entity_type: string;
    ghl_tag?: string | null;
    primary_benefit: DiscountProgramBenefitInput;
    applies_to_vertical_slug?: string | null;
    commitment?: DiscountProgramCommitmentInput | null;
};

export function validateDiscountProgramPayload(
    body: unknown,
    mode: "create" | "update"
): { ok: true; value: DiscountProgramWritePayload } | { ok: false; error: string } {
    if (!body || typeof body !== "object") {
        return { ok: false, error: "Invalid JSON body" };
    }
    const o = body as Record<string, unknown>;

    const name = typeof o.name === "string" ? o.name.trim() : "";
    const codeRaw = o.code;
    const code = codeRaw === null || codeRaw === undefined ? null : typeof codeRaw === "string" ? codeRaw.trim().toUpperCase() || null : null;
    const status = typeof o.status === "string" && o.status.trim() ? o.status.trim() : "active";
    const program_type = typeof o.program_type === "string" && o.program_type.trim() ? o.program_type.trim() : "code";
    const stacking_mode = typeof o.stacking_mode === "string" && o.stacking_mode.trim() ? o.stacking_mode.trim() : "exclusive";
    const priority =
        typeof o.priority === "number" && Number.isFinite(o.priority) ? Math.round(o.priority) : typeof o.priority === "string" && o.priority.trim() ? parseInt(o.priority, 10) || 0 : 0;

    const valid_from =
        o.valid_from === null || o.valid_from === undefined || o.valid_from === ""
            ? null
            : typeof o.valid_from === "string"
              ? o.valid_from
              : null;
    const valid_to =
        o.valid_to === null || o.valid_to === undefined || o.valid_to === ""
            ? null
            : typeof o.valid_to === "string"
              ? o.valid_to
              : null;

    if (valid_from && valid_to && new Date(valid_to).getTime() < new Date(valid_from).getTime()) {
        return { ok: false, error: "valid_to must not be earlier than valid_from" };
    }

    const first_time_customer_only = o.first_time_customer_only === true;
    const auto_apply = o.auto_apply === true;
    const applies_to_entity_type =
        typeof o.applies_to_entity_type === "string" && o.applies_to_entity_type.trim() ? o.applies_to_entity_type.trim() : "job";
    const ghl_tag =
        o.ghl_tag === null || o.ghl_tag === undefined
            ? null
            : typeof o.ghl_tag === "string"
              ? o.ghl_tag.trim() || null
              : null;

    if (!name) {
        return { ok: false, error: "name is required" };
    }
    if (mode === "create" && !code) {
        return { ok: false, error: "code is required for create" };
    }

    if (program_type !== "code" && program_type !== "commitment") {
        return { ok: false, error: "program_type must be code or commitment" };
    }

    const pb = o.primary_benefit;
    if (!pb || typeof pb !== "object") {
        return { ok: false, error: "primary_benefit object is required" };
    }
    const benefit = pb as Record<string, unknown>;
    const benefit_type = typeof benefit.benefit_type === "string" ? benefit.benefit_type.trim() : "";
    const applies_to = typeof benefit.applies_to === "string" ? benefit.applies_to.trim() : "";
    if (!benefit_type || !applies_to) {
        return { ok: false, error: "primary_benefit.benefit_type and applies_to are required" };
    }

    const service_index =
        benefit.service_index === null || benefit.service_index === undefined
            ? null
            : typeof benefit.service_index === "number" && Number.isFinite(benefit.service_index)
              ? Math.round(benefit.service_index)
              : typeof benefit.service_index === "string" && benefit.service_index.trim()
                ? parseInt(benefit.service_index, 10)
                : null;

    let amount_cents: number | null = null;
    let percent_basis_points: number | null = null;

    if (benefit_type === "percent_off") {
        const p = benefit.percent_basis_points;
        const n =
            typeof p === "number" && Number.isFinite(p)
                ? Math.round(p)
                : typeof p === "string" && p.trim()
                  ? parseInt(p, 10)
                  : NaN;
        if (!Number.isFinite(n) || n < 0) {
            return { ok: false, error: "percent_off requires primary_benefit.percent_basis_points (non-negative integer)" };
        }
        percent_basis_points = n;
    } else if (benefit_type === "fixed_amount_off") {
        const a = benefit.amount_cents;
        const n =
            typeof a === "number" && Number.isFinite(a)
                ? Math.round(a)
                : typeof a === "string" && a.trim()
                  ? parseInt(a, 10)
                  : NaN;
        if (!Number.isFinite(n) || n < 0) {
            return { ok: false, error: "fixed_amount_off requires primary_benefit.amount_cents (non-negative integer cents)" };
        }
        amount_cents = n;
    } else if (benefit_type === "free_service") {
        amount_cents = null;
        percent_basis_points = null;
    } else {
        return { ok: false, error: "primary_benefit.benefit_type must be percent_off, fixed_amount_off, or free_service" };
    }

    const vertical =
        o.applies_to_vertical_slug === null || o.applies_to_vertical_slug === undefined
            ? null
            : typeof o.applies_to_vertical_slug === "string"
              ? o.applies_to_vertical_slug.trim() || null
              : null;

    let commitment: DiscountProgramCommitmentInput | null = null;
    if (program_type === "commitment") {
        const c = o.commitment;
        if (!c || typeof c !== "object") {
            return { ok: false, error: "commitment object is required when program_type is commitment" };
        }
        const cr = c as Record<string, unknown>;
        const enrollment_mode = typeof cr.enrollment_mode === "string" ? cr.enrollment_mode.trim() : "";
        const commitment_start_mode = typeof cr.commitment_start_mode === "string" ? cr.commitment_start_mode.trim() : "";
        const benefit_grant_timing = typeof cr.benefit_grant_timing === "string" ? cr.benefit_grant_timing.trim() : "";
        const qualifying_service_status = typeof cr.qualifying_service_status === "string" ? cr.qualifying_service_status.trim() : "";
        const breach_policy = typeof cr.breach_policy === "string" ? cr.breach_policy.trim() : "";

        const required_service_count =
            typeof cr.required_service_count === "number" && Number.isFinite(cr.required_service_count)
                ? Math.round(cr.required_service_count)
                : typeof cr.required_service_count === "string" && cr.required_service_count.trim()
                  ? parseInt(cr.required_service_count, 10)
                  : NaN;
        const timeframe_days =
            typeof cr.timeframe_days === "number" && Number.isFinite(cr.timeframe_days)
                ? Math.round(cr.timeframe_days)
                : typeof cr.timeframe_days === "string" && cr.timeframe_days.trim()
                  ? parseInt(cr.timeframe_days, 10)
                  : NaN;
        const max_redemptions_per_customer =
            typeof cr.max_redemptions_per_customer === "number" && Number.isFinite(cr.max_redemptions_per_customer)
                ? Math.round(cr.max_redemptions_per_customer)
                : typeof cr.max_redemptions_per_customer === "string" && cr.max_redemptions_per_customer.trim()
                  ? parseInt(cr.max_redemptions_per_customer, 10)
                  : NaN;

        if (
            !enrollment_mode ||
            !commitment_start_mode ||
            !benefit_grant_timing ||
            !qualifying_service_status ||
            !breach_policy ||
            !Number.isFinite(required_service_count) ||
            required_service_count < 1 ||
            !Number.isFinite(timeframe_days) ||
            timeframe_days < 1 ||
            !Number.isFinite(max_redemptions_per_customer) ||
            max_redemptions_per_customer < 1
        ) {
            return {
                ok: false,
                error:
                    "commitment requires enrollment_mode, commitment_start_mode, benefit_grant_timing, qualifying_service_status, breach_policy, required_service_count (>=1), timeframe_days (>=1), max_redemptions_per_customer (>=1)",
            };
        }
        commitment = {
            enrollment_mode,
            commitment_start_mode,
            benefit_grant_timing,
            required_service_count,
            timeframe_days,
            qualifying_service_status,
            breach_policy,
            max_redemptions_per_customer,
        };
    }

    return {
        ok: true,
        value: {
            name,
            code,
            status,
            program_type,
            stacking_mode,
            priority,
            valid_from,
            valid_to,
            first_time_customer_only,
            auto_apply,
            applies_to_entity_type,
            ghl_tag,
            primary_benefit: {
                benefit_type,
                applies_to,
                service_index,
                amount_cents,
                percent_basis_points,
            },
            applies_to_vertical_slug: vertical,
            commitment,
        },
    };
}

function programInsertRow(orgId: string | null, p: DiscountProgramWritePayload): Record<string, unknown> {
    return {
        org_id: orgId,
        name: p.name,
        code: p.code,
        status: p.status,
        program_type: p.program_type,
        stacking_mode: p.stacking_mode,
        priority: p.priority,
        valid_from: p.valid_from,
        valid_to: p.valid_to,
        first_time_customer_only: p.first_time_customer_only,
        auto_apply: p.auto_apply,
        applies_to_entity_type: p.applies_to_entity_type,
        ghl_tag: p.ghl_tag ?? null,
    };
}

function programUpdatePatch(p: DiscountProgramWritePayload): Record<string, unknown> {
    return {
        name: p.name,
        code: p.code,
        status: p.status,
        program_type: p.program_type,
        stacking_mode: p.stacking_mode,
        priority: p.priority,
        valid_from: p.valid_from,
        valid_to: p.valid_to,
        first_time_customer_only: p.first_time_customer_only,
        auto_apply: p.auto_apply,
        applies_to_entity_type: p.applies_to_entity_type,
        ghl_tag: p.ghl_tag ?? null,
    };
}

function benefitInsertRow(programId: string, b: DiscountProgramBenefitInput): Record<string, unknown> {
    return {
        discount_program_id: programId,
        benefit_type: b.benefit_type,
        applies_to: b.applies_to,
        service_index: b.service_index ?? null,
        amount_cents: b.amount_cents ?? null,
        percent_basis_points: b.percent_basis_points ?? null,
        sort_order: 0,
    };
}

function commitmentInsertRow(programId: string, c: DiscountProgramCommitmentInput): Record<string, unknown> {
    return {
        discount_program_id: programId,
        enrollment_mode: c.enrollment_mode,
        commitment_start_mode: c.commitment_start_mode,
        benefit_grant_timing: c.benefit_grant_timing,
        required_service_count: c.required_service_count,
        timeframe_days: c.timeframe_days,
        qualifying_service_status: c.qualifying_service_status,
        breach_policy: c.breach_policy,
        max_redemptions_per_customer: c.max_redemptions_per_customer,
    };
}

export async function listDiscountProgramsAdmin(supabase: SupabaseClient) {
    const { data, error } = await supabase
        .from("discount_programs_admin_v")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
    if (error) {
        const fallback = await supabase.from("discount_programs_admin_v").select("*").order("code", { ascending: true }).limit(1000);
        if (fallback.error) return { data: null, error: fallback.error };
        const merged = await mergeVerticalSlugsOntoProgramRows(supabase, (fallback.data ?? []) as DiscountProgramAdminViewRow[]);
        return { data: merged, error: null as null };
    }
    const merged = await mergeVerticalSlugsOntoProgramRows(supabase, (data ?? []) as DiscountProgramAdminViewRow[]);
    return { data: merged, error: null as null };
}

async function fetchPrimaryBenefitId(supabase: SupabaseClient, programId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from("discount_program_benefits")
        .select("id")
        .eq("discount_program_id", programId)
        .order("created_at", { ascending: true })
        .limit(1);
    if (error || !data?.length) return null;
    return (data[0] as { id: string }).id;
}

async function fetchCommitmentRuleId(supabase: SupabaseClient, programId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from("discount_program_commitment_rules")
        .select("id")
        .eq("discount_program_id", programId)
        .limit(1)
        .maybeSingle();
    if (error) return null;
    return (data as { id: string } | null)?.id ?? null;
}

/** Parse vertical_slug_in qualifier value_json → comma-separated slugs for the admin text field. */
export function parseVerticalSlugFromQualifierValueJson(value_json: unknown): string | null {
    if (value_json == null || typeof value_json !== "object" || Array.isArray(value_json)) return null;
    const v = value_json as Record<string, unknown>;
    const vals = v.values;
    if (!Array.isArray(vals) || vals.length === 0) return null;
    const parts = vals.map((x) => String(x).trim()).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
}

/** Turn admin vertical field (comma-separated ok) into value_json.values. */
function verticalSlugInputToValueJson(slugInput: string): { values: string[] } {
    const values = slugInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return { values };
}

async function fetchProgramOrgId(supabase: SupabaseClient, programId: string): Promise<string | null> {
    const { data, error } = await supabase.from("discount_programs").select("org_id").eq("id", programId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { org_id?: string | null } | null)?.org_id ?? null;
}

/**
 * Sync vertical restriction: single row with qualifier_type vertical_slug_in, operator in, value_json { values }.
 * Removes prior vertical_slug_in rows and legacy mistaken vertical_slug rows only (other qualifier_types untouched).
 */
async function syncVerticalQualifier(supabase: SupabaseClient, programId: string, slugInput: string | null) {
    await supabase
        .from("discount_program_qualifiers")
        .delete()
        .eq("discount_program_id", programId)
        .in("qualifier_type", ["vertical_slug_in", "vertical_slug"]);

    const trimmed = typeof slugInput === "string" ? slugInput.trim() : "";
    if (!trimmed) return;

    const { values } = verticalSlugInputToValueJson(trimmed);
    if (values.length === 0) return;

    const org_id = await fetchProgramOrgId(supabase, programId);

    const { error } = await supabase.from("discount_program_qualifiers").insert({
        org_id,
        discount_program_id: programId,
        qualifier_type: "vertical_slug_in",
        operator: "in",
        value_json: { values },
        sort_order: 1,
        metadata: {},
    });
    if (error) throw new Error(error.message);
}

async function attachVerticalSlugFromQualifiers(
    supabase: SupabaseClient,
    row: DiscountProgramAdminViewRow
): Promise<DiscountProgramAdminViewRow> {
    const { data, error } = await supabase
        .from("discount_program_qualifiers")
        .select("value_json")
        .eq("discount_program_id", row.id)
        .eq("qualifier_type", "vertical_slug_in")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) return row;
    const parsed = data ? parseVerticalSlugFromQualifierValueJson((data as { value_json: unknown }).value_json) : null;
    if (parsed == null) return row;
    return { ...row, applies_to_vertical_slug: parsed };
}

async function mergeVerticalSlugsOntoProgramRows(
    supabase: SupabaseClient,
    rows: DiscountProgramAdminViewRow[]
): Promise<DiscountProgramAdminViewRow[]> {
    if (!rows.length) return rows;
    const ids = rows.map((r) => r.id).filter(Boolean);
    const { data: quals, error } = await supabase
        .from("discount_program_qualifiers")
        .select("discount_program_id, value_json, sort_order")
        .in("discount_program_id", ids)
        .eq("qualifier_type", "vertical_slug_in")
        .order("discount_program_id", { ascending: true })
        .order("sort_order", { ascending: true });
    if (error || !quals?.length) return rows;

    const firstByProgram = new Map<string, string>();
    for (const q of quals as { discount_program_id: string; value_json: unknown }[]) {
        if (firstByProgram.has(q.discount_program_id)) continue;
        const s = parseVerticalSlugFromQualifierValueJson(q.value_json);
        if (s != null) firstByProgram.set(q.discount_program_id, s);
    }

    return rows.map((r) => ({
        ...r,
        applies_to_vertical_slug: firstByProgram.get(r.id) ?? r.applies_to_vertical_slug ?? null,
    }));
}

export async function createDiscountProgram(supabase: SupabaseClient, orgId: string | null, payload: DiscountProgramWritePayload) {
    const progRow = programInsertRow(orgId, payload);
    const { data: program, error: pErr } = await supabase.from("discount_programs").insert(progRow).select("id").single();
    if (pErr) throw new Error(pErr.message);
    const programId = (program as { id: string }).id;

    const { error: bErr } = await supabase.from("discount_program_benefits").insert(benefitInsertRow(programId, payload.primary_benefit));
    if (bErr) throw new Error(bErr.message);

    await syncVerticalQualifier(supabase, programId, payload.applies_to_vertical_slug ?? null);

    if (payload.program_type === "commitment" && payload.commitment) {
        const { error: cErr } = await supabase
            .from("discount_program_commitment_rules")
            .insert(commitmentInsertRow(programId, payload.commitment));
        if (cErr) throw new Error(cErr.message);
    }

    const { data: viewRow, error: vErr } = await supabase.from("discount_programs_admin_v").select("*").eq("id", programId).maybeSingle();
    if (vErr) throw new Error(vErr.message);
    return attachVerticalSlugFromQualifiers(supabase, viewRow as DiscountProgramAdminViewRow);
}

export async function updateDiscountProgram(supabase: SupabaseClient, programId: string, payload: DiscountProgramWritePayload) {
    const { data: existing, error: exErr } = await supabase
        .from("discount_programs")
        .select("id, legacy_discount_code_id, is_legacy_migrated")
        .eq("id", programId)
        .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Discount program not found");

    const patch = programUpdatePatch(payload);
    const { error: uErr } = await supabase.from("discount_programs").update(patch).eq("id", programId);
    if (uErr) throw new Error(uErr.message);

    const benefitId = await fetchPrimaryBenefitId(supabase, programId);
    const b = payload.primary_benefit;
    const benefitUpdate = {
        benefit_type: b.benefit_type,
        applies_to: b.applies_to,
        service_index: b.service_index ?? null,
        amount_cents: b.amount_cents ?? null,
        percent_basis_points: b.percent_basis_points ?? null,
    };
    if (benefitId) {
        const { error: bErr } = await supabase.from("discount_program_benefits").update(benefitUpdate).eq("id", benefitId);
        if (bErr) throw new Error(bErr.message);
    } else {
        const { error: bErr } = await supabase.from("discount_program_benefits").insert(benefitInsertRow(programId, b));
        if (bErr) throw new Error(bErr.message);
    }

    await syncVerticalQualifier(supabase, programId, payload.applies_to_vertical_slug ?? null);

    if (payload.program_type === "commitment" && payload.commitment) {
        const ruleId = await fetchCommitmentRuleId(supabase, programId);
        const c = payload.commitment;
        const commitmentUpdate = {
            enrollment_mode: c.enrollment_mode,
            commitment_start_mode: c.commitment_start_mode,
            benefit_grant_timing: c.benefit_grant_timing,
            required_service_count: c.required_service_count,
            timeframe_days: c.timeframe_days,
            qualifying_service_status: c.qualifying_service_status,
            breach_policy: c.breach_policy,
            max_redemptions_per_customer: c.max_redemptions_per_customer,
        };
        if (ruleId) {
            const { error: cErr } = await supabase.from("discount_program_commitment_rules").update(commitmentUpdate).eq("id", ruleId);
            if (cErr) throw new Error(cErr.message);
        } else {
            const { error: cErr } = await supabase.from("discount_program_commitment_rules").insert(commitmentInsertRow(programId, c));
            if (cErr) throw new Error(cErr.message);
        }
    }

    const { data: viewRow, error: vErr } = await supabase.from("discount_programs_admin_v").select("*").eq("id", programId).maybeSingle();
    if (vErr) throw new Error(vErr.message);
    return attachVerticalSlugFromQualifiers(supabase, viewRow as DiscountProgramAdminViewRow);
}

export async function deleteDiscountProgram(supabase: SupabaseClient, programId: string) {
    await supabase.from("discount_program_qualifiers").delete().eq("discount_program_id", programId);
    await supabase.from("discount_program_commitment_rules").delete().eq("discount_program_id", programId);
    await supabase.from("discount_program_benefits").delete().eq("discount_program_id", programId);
    const { error } = await supabase.from("discount_programs").delete().eq("id", programId);
    if (error) throw new Error(error.message);
}
