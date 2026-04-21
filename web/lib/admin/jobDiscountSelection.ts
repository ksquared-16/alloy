/**
 * Job discount selection: unified tokens (program:uuid | code:uuid), resolution for admin jobs,
 * and compatibility with legacy discount_codes + migrated programs (legacy_discount_code_id).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateDiscountCodeForJob } from "@/lib/admin/validateDiscountCode";

export type ParsedJobDiscountSelection =
    | { kind: "program"; programId: string }
    | { kind: "legacy_code"; codeId: string };

/** Dropdown / API option row */
export type JobDiscountOptionDto = {
    value: string;
    label: string;
    code: string;
    discount_type: "percent" | "fixed" | null;
    discount_value: number | null;
    applies_to_vertical_slug: string | null;
    first_job_only: boolean | null;
    program_id: string | null;
    legacy_code_id: string | null;
    program_type: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseJobDiscountSelectionInput(raw: string | null | undefined): ParsedJobDiscountSelection | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const idx = s.indexOf(":");
    if (idx > 0) {
        const prefix = s.slice(0, idx).toLowerCase();
        const id = s.slice(idx + 1).trim();
        if (!id || !UUID_RE.test(id)) return null;
        if (prefix === "program") return { kind: "program", programId: id };
        if (prefix === "code") return { kind: "legacy_code", codeId: id };
        return null;
    }
    if (UUID_RE.test(s)) return { kind: "legacy_code", codeId: s };
    return null;
}

export function formatProgramOptionLabel(code: string | null | undefined, programType: string | null | undefined): string {
    const c = (code ?? "").trim() || "(no code)";
    const t = (programType ?? "").trim() || "program";
    return `${c} — ${t}`;
}

export function computeJobDiscountOptionPreviewCents(option: JobDiscountOptionDto, grossCents: number): number {
    const gross = Math.max(0, Math.round(grossCents));
    const type = (option.discount_type ?? "").toLowerCase();
    const val = option.discount_value;
    if (type === "percent") {
        const percent = Math.min(100, Math.max(0, Number(val) ?? 0));
        return Math.round(gross * percent / 100);
    }
    if (type === "fixed") {
        const dollars = Number(val) ?? 0;
        const cents = Math.round(dollars * 100);
        return Math.min(gross, Math.max(0, cents));
    }
    return 0;
}

export function discountProgramRowSelectableForJobAdmin(row: Record<string, unknown>): boolean {
    const st = String(row.status ?? "").trim().toLowerCase();
    if (st && st !== "active") return false;
    const now = Date.now();
    const vf = row.valid_from;
    const vt = row.valid_to;
    if (typeof vf === "string" && vf && new Date(vf).getTime() > now) return false;
    if (typeof vt === "string" && vt && new Date(vt).getTime() < now) return false;
    return true;
}

async function loadVerticalSlugsForProgram(supabase: SupabaseClient, programId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from("discount_program_qualifiers")
        .select("value_json")
        .eq("discount_program_id", programId)
        .eq("qualifier_type", "vertical_slug_in");
    if (error || !data?.length) return [];
    const slugs = new Set<string>();
    for (const q of data as { value_json: unknown }[]) {
        const v = q.value_json;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            const vals = (v as { values?: unknown }).values;
            if (Array.isArray(vals)) {
                for (const x of vals) {
                    const s = String(x).trim();
                    if (s) slugs.add(s);
                }
            }
        }
    }
    return [...slugs];
}

function computeDiscountCentsFromProgramView(row: Record<string, unknown>, grossCents: number): number {
    const gross = Math.max(0, Math.round(grossCents));
    const benefitType = String(row.primary_benefit_type ?? "").trim();
    if (benefitType === "percent_off") {
        const bps = Number(row.primary_benefit_percent_basis_points ?? row.percent_basis_points ?? 0);
        const percent = Math.min(100, Math.max(0, bps / 100));
        return Math.round(gross * percent / 100);
    }
    if (benefitType === "fixed_amount_off") {
        const cents = Math.round(Number(row.primary_benefit_amount_cents ?? row.amount_cents ?? 0));
        return Math.min(gross, Math.max(0, cents));
    }
    if (benefitType === "free_service") {
        return gross;
    }
    return 0;
}

export type ResolvedJobDiscount = {
    discount_code_id: string | null;
    discount_program_id: string | null;
    discount_code: string | null;
    discount_amount: number;
    discounted: boolean;
};

/**
 * Resolve admin job discount selection into persisted job columns.
 * Migrated programs set both discount_program_id and discount_code_id (legacy) when linked.
 */
export async function resolveJobDiscountSelection(
    supabase: SupabaseClient,
    parsed: ParsedJobDiscountSelection | null,
    grossCents: number,
    jobVerticalSlug: string | null,
    orgId: string
): Promise<{ ok: true; value: ResolvedJobDiscount } | { ok: false; error: string }> {
    if (!parsed) {
        return {
            ok: true,
            value: {
                discount_code_id: null,
                discount_program_id: null,
                discount_code: null,
                discount_amount: 0,
                discounted: false,
            },
        };
    }

    if (parsed.kind === "legacy_code") {
        const { data: codeRow, error: codeErr } = await supabase
            .from("discount_codes")
            .select("id, code, is_active, discount_type, discount_value, applies_to_vertical_slug, starts_at, ends_at")
            .eq("id", parsed.codeId)
            .maybeSingle();
        if (codeErr) return { ok: false, error: codeErr.message };
        const result = validateDiscountCodeForJob(
            codeRow as Parameters<typeof validateDiscountCodeForJob>[0],
            grossCents,
            jobVerticalSlug
        );
        if ("error" in result) return { ok: false, error: result.error };
        return {
            ok: true,
            value: {
                discount_code_id: parsed.codeId,
                discount_program_id: null,
                discount_code: result.code,
                discount_amount: result.discount_amount_cents,
                discounted: true,
            },
        };
    }

    const { data: row, error } = await supabase.from("discount_programs_admin_v").select("*").eq("id", parsed.programId).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!row) return { ok: false, error: "Discount program not found" };

    const r = row as Record<string, unknown>;
    const rowOrg = r.org_id as string | null | undefined;
    if (rowOrg && rowOrg !== orgId) {
        return { ok: false, error: "Discount program does not belong to your org" };
    }
    if (!discountProgramRowSelectableForJobAdmin(r)) {
        return { ok: false, error: "Discount program is not active or is outside its valid dates" };
    }

    const verticalSlugs = await loadVerticalSlugsForProgram(supabase, parsed.programId);
    if (verticalSlugs.length > 0) {
        const jobV = (jobVerticalSlug ?? "").trim();
        if (!jobV || !verticalSlugs.includes(jobV)) {
            return { ok: false, error: "Discount program does not apply to this job's vertical" };
        }
    }

    const discount_amount = computeDiscountCentsFromProgramView(r, grossCents);
    const legacyId = (r.legacy_discount_code_id as string | null | undefined) ?? null;
    const codeStr = (r.code as string | null | undefined) ?? "";

    return {
        ok: true,
        value: {
            discount_program_id: parsed.programId,
            discount_code_id: legacyId,
            discount_code: codeStr || null,
            discount_amount,
            discounted: true,
        },
    };
}

/**
 * Infer dropdown token from persisted job row (program id wins; legacy code maps to program when migrated).
 */
/** Infer dropdown token from persisted opportunity discount columns (same token shape as jobs). */
export function inferOpportunityDiscountSelectionToken(opp: {
    discount_program_id?: string | null;
    discount_code_id?: string | null;
}): string {
    const pid = opp.discount_program_id ?? null;
    if (pid) return `program:${pid}`;
    const cid = opp.discount_code_id ?? null;
    if (cid) return `code:${cid}`;
    return "";
}

export async function inferJobDiscountSelectionToken(
    supabase: SupabaseClient,
    job: { discount_program_id?: string | null; discount_code_id?: string | null }
): Promise<string> {
    const pid = job.discount_program_id ?? null;
    if (pid) return `program:${pid}`;
    const cid = job.discount_code_id ?? null;
    if (!cid) return "";
    const { data: prog } = await supabase.from("discount_programs").select("id").eq("legacy_discount_code_id", cid).maybeSingle();
    const found = prog as { id?: string } | null;
    if (found?.id) return `program:${found.id}`;
    return `code:${cid}`;
}

export async function buildJobDiscountDisplayLabel(
    supabase: SupabaseClient,
    job: { discount_program_id?: string | null; discount_code_id?: string | null; discount_code?: string | null }
): Promise<string | null> {
    const pid = job.discount_program_id ?? null;
    if (pid) {
        const { data: v } = await supabase
            .from("discount_programs_admin_v")
            .select("code, name, program_type")
            .eq("id", pid)
            .maybeSingle();
        const vr = v as { code?: string | null; name?: string | null; program_type?: string | null } | null;
        if (vr) {
            const code = (vr.code ?? "").trim();
            const name = (vr.name ?? "").trim();
            const pt = (vr.program_type ?? "").trim() || "program";
            if (name && code) return `${code} — ${pt} (${name})`;
            return formatProgramOptionLabel(code || name || null, pt);
        }
    }
    const cid = job.discount_code_id ?? null;
    if (cid) {
        const { data: dc } = await supabase.from("discount_codes").select("code").eq("id", cid).maybeSingle();
        const c = (dc as { code?: string | null } | null)?.code;
        if (c) return `${c} — legacy code`;
    }
    if (job.discount_code && String(job.discount_code).trim()) {
        return String(job.discount_code).trim();
    }
    return null;
}

/** Map a program view row to preview fields for the options DTO. */
export function programViewRowToPreviewFields(row: Record<string, unknown>): Pick<JobDiscountOptionDto, "discount_type" | "discount_value" | "first_job_only"> {
    const benefitType = String(row.primary_benefit_type ?? "").trim();
    const firstOnly = row.first_time_customer_only === true;
    if (benefitType === "percent_off") {
        const bps = Number(row.primary_benefit_percent_basis_points ?? 0);
        return { discount_type: "percent", discount_value: bps / 100, first_job_only: firstOnly };
    }
    if (benefitType === "fixed_amount_off") {
        const cents = Number(row.primary_benefit_amount_cents ?? 0);
        return { discount_type: "fixed", discount_value: cents / 100, first_job_only: firstOnly };
    }
    if (benefitType === "free_service") {
        return { discount_type: "percent", discount_value: 100, first_job_only: firstOnly };
    }
    return { discount_type: null, discount_value: null, first_job_only: firstOnly };
}

/**
 * Build merged discount options for job admin dropdowns: programs (view) + orphan legacy codes.
 */
export async function fetchJobDiscountOptionsForAdmin(
    supabase: SupabaseClient,
    orgId: string,
    verticalSlug: string | null
): Promise<JobDiscountOptionDto[]> {
    const now = new Date().toISOString();

    const { data: progRows, error: pe } = await supabase
        .from("discount_programs_admin_v")
        .select("*")
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .order("code", { ascending: true })
        .limit(500);
    if (pe) throw new Error(pe.message);

    const programs = (progRows ?? []).filter((raw) => discountProgramRowSelectableForJobAdmin(raw as Record<string, unknown>));

    const programIds = programs.map((p) => (p as { id: string }).id).filter(Boolean);
    const verticalMap = new Map<string, string>();
    if (programIds.length > 0) {
        const { data: quals } = await supabase
            .from("discount_program_qualifiers")
            .select("discount_program_id, value_json")
            .in("discount_program_id", programIds)
            .eq("qualifier_type", "vertical_slug_in");
        for (const q of quals ?? []) {
            const pid = (q as { discount_program_id: string }).discount_program_id;
            const v = (q as { value_json: unknown }).value_json;
            const parts: string[] = [];
            if (v && typeof v === "object" && !Array.isArray(v)) {
                const vals = (v as { values?: unknown }).values;
                if (Array.isArray(vals)) {
                    for (const x of vals) {
                        const s = String(x).trim();
                        if (s) parts.push(s);
                    }
                }
            }
            if (parts.length) verticalMap.set(pid, parts.join(","));
        }
    }

    const options: JobDiscountOptionDto[] = [];
    const legacyLinked = new Set<string>();

    for (const raw of programs) {
        const r = raw as Record<string, unknown>;
        const id = r.id as string;
        const legacy = (r.legacy_discount_code_id as string | null | undefined) ?? null;
        if (legacy) legacyLinked.add(legacy);
        const applies = verticalMap.get(id) ?? null;
        if (verticalSlug && applies) {
            const list = applies.split(",").map((s) => s.trim()).filter(Boolean);
            if (list.length > 0 && !list.includes(verticalSlug)) continue;
        }
        const preview = programViewRowToPreviewFields(r);
        const code = (r.code as string | null) ?? "";
        const pt = (r.program_type as string | null) ?? null;
        options.push({
            value: `program:${id}`,
            label: formatProgramOptionLabel(code, pt),
            code: code || "(no code)",
            discount_type: preview.discount_type,
            discount_value: preview.discount_value,
            applies_to_vertical_slug: applies,
            first_job_only: preview.first_job_only,
            program_id: id,
            legacy_code_id: legacy,
            program_type: pt,
        });
    }

    let cq = supabase
        .from("discount_codes")
        .select("id, code, discount_type, discount_value, applies_to_vertical_slug, first_job_only")
        .eq("is_active", true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("code", { ascending: true });

    if (verticalSlug) {
        cq = cq.or(`applies_to_vertical_slug.is.null,applies_to_vertical_slug.eq.${verticalSlug}`);
    }

    const { data: codes, error: ce } = await cq;
    if (ce) throw new Error(ce.message);

    for (const raw of codes ?? []) {
        const row = raw as {
            id: string;
            code: string | null;
            discount_type: string | null;
            discount_value: number | string | null;
            applies_to_vertical_slug: string | null;
            first_job_only: boolean | null;
        };
        if (legacyLinked.has(row.id)) continue;
        const t = String(row.discount_type ?? "").trim().toLowerCase();
        const dt: "percent" | "fixed" | null = t === "percent" ? "percent" : t === "fixed" ? "fixed" : null;
        const dv = dt ? Number(row.discount_value) : null;
        options.push({
            value: `code:${row.id}`,
            label: `${(row.code ?? "").trim() || row.id.slice(0, 8)} — legacy code`,
            code: row.code ?? "",
            discount_type: dt,
            discount_value: dv != null && Number.isFinite(dv) ? dv : null,
            applies_to_vertical_slug: row.applies_to_vertical_slug ?? null,
            first_job_only: row.first_job_only ?? null,
            program_id: null,
            legacy_code_id: row.id,
            program_type: null,
        });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
}
