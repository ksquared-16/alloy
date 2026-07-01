import type { SupabaseClient } from "@supabase/supabase-js";

export type ValidateStatusTransitionInput = {
    supabase: SupabaseClient;
    orgId: string;
    entityType: string;
    entityId?: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    actionKey?: string | null;
    fromStatusKey?: string | null;
    toStatusKey: string;
    currentMetadata?: Record<string, unknown> | null;
    payload?: Record<string, unknown> | null;
};

export type ValidateStatusTransitionResult = { ok: true } | { ok: false; message: string; ruleId?: string };

type RuleRow = {
    id: string;
    org_id: string;
    entity_type: string;
    department_id: string | null;
    work_unit_id: string | null;
    action_key: string | null;
    from_status_key: string | null;
    to_status_key: string;
    required_metadata_fields: unknown;
    required_payload_fields: unknown;
    blocked: boolean;
    is_active: boolean;
    message: string | null;
};

export function normalizeEntityTypeForStatusRules(entityType: string): string {
    const raw = (entityType ?? "").trim().toLowerCase();
    if (!raw) return "";
    if (raw === "opportunity" || raw === "opportunities") return "opportunities";
    if (raw === "schedule" || raw === "schedules") return "schedules";
    if (raw === "job" || raw === "jobs") return "jobs";
    return raw;
}

function asStringList(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
    // jsonb might arrive as stringified JSON in some environments; tolerate it.
    if (typeof v === "string") {
        const s = v.trim();
        if (!s) return [];
        try {
            const parsed = JSON.parse(s);
            return asStringList(parsed);
        } catch {
            return [];
        }
    }
    return [];
}

function isMissingValue(v: unknown): boolean {
    if (v == null) return true;
    if (typeof v === "string") return v.trim() === "";
    return false;
}

function specificityScore(r: Pick<RuleRow, "action_key" | "work_unit_id" | "department_id" | "from_status_key">): number {
    return (r.action_key ? 8 : 0) + (r.work_unit_id ? 4 : 0) + (r.department_id ? 2 : 0) + (r.from_status_key ? 1 : 0);
}

export async function validateStatusTransition(input: ValidateStatusTransitionInput): Promise<ValidateStatusTransitionResult> {
    const orgId = String(input.orgId ?? "").trim();
    const toStatusKey = String(input.toStatusKey ?? "").trim();
    const entityType = normalizeEntityTypeForStatusRules(String(input.entityType ?? ""));
    if (!orgId || !entityType || !toStatusKey) return { ok: true };

    const { data, error } = await input.supabase
        .from("status_transition_rules")
        .select(
            "id, org_id, entity_type, department_id, work_unit_id, action_key, from_status_key, to_status_key, required_metadata_fields, required_payload_fields, blocked, is_active, message"
        )
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("to_status_key", toStatusKey)
        .eq("is_active", true);

    if (error) throw new Error(error.message);

    const rules = (data ?? []) as unknown as RuleRow[];
    if (rules.length === 0) return { ok: true };

    const fromStatusKey = input.fromStatusKey != null ? String(input.fromStatusKey).trim() : "";
    const departmentId = input.departmentId != null ? String(input.departmentId).trim() : "";
    const workUnitId = input.workUnitId != null ? String(input.workUnitId).trim() : "";
    const actionKey = input.actionKey != null ? String(input.actionKey).trim() : "";

    const candidates = rules
        .filter((r) => {
            if (!r.is_active) return false;
            if (r.from_status_key != null && String(r.from_status_key).trim() !== "") {
                if (!fromStatusKey || String(r.from_status_key).trim() !== fromStatusKey) return false;
            }
            if (r.department_id != null && String(r.department_id).trim() !== "") {
                if (!departmentId || String(r.department_id).trim() !== departmentId) return false;
            }
            if (r.work_unit_id != null && String(r.work_unit_id).trim() !== "") {
                if (!workUnitId || String(r.work_unit_id).trim() !== workUnitId) return false;
            }
            if (r.action_key != null && String(r.action_key).trim() !== "") {
                if (!actionKey || String(r.action_key).trim() !== actionKey) return false;
            }
            return true;
        })
        .sort((a, b) => specificityScore(b) - specificityScore(a));

    if (candidates.length === 0) return { ok: true };

    const md = input.currentMetadata && typeof input.currentMetadata === "object" ? input.currentMetadata : null;
    const payload = input.payload && typeof input.payload === "object" ? input.payload : null;

    for (const rule of candidates) {
        if (rule.blocked) {
            return {
                ok: false,
                message: (rule.message && String(rule.message).trim()) || "This status transition is blocked.",
                ruleId: rule.id,
            };
        }

        const requiredMetadata = asStringList(rule.required_metadata_fields);
        const requiredPayload = asStringList(rule.required_payload_fields);

        const missingMetadata = requiredMetadata.filter((k) => isMissingValue(md ? md[k] : undefined));
        const missingPayload = requiredPayload.filter((k) => isMissingValue(payload ? payload[k] : undefined));

        if (missingMetadata.length || missingPayload.length) {
            const msg = (rule.message && String(rule.message).trim()) || "Missing required fields for this status transition.";
            return { ok: false, message: msg, ruleId: rule.id };
        }
    }

    return { ok: true };
}

