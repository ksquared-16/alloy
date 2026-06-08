import type { SupabaseClient } from "@supabase/supabase-js";
import { parseVerticalBootstrapPayload } from "@/lib/admin/verticalBootstrap/parseVerticalBootstrapPayload";
import type {
    BootstrapRowAction,
    VerticalBootstrapPayloadV1,
    VerticalBootstrapPreviewResult,
} from "@/lib/admin/verticalBootstrap/types";

function jsonStable(value: unknown): string {
    return JSON.stringify(value);
}

function deptAction(
    desired: VerticalBootstrapPayloadV1["departments"][0],
    existing: {
        id: string;
        name: string;
        description: string | null;
        sort_order: number;
        is_active: boolean;
        metadata: Record<string, unknown> | null;
    } | null
): { action: BootstrapRowAction; existing_id: string | null } {
    const sort = desired.sort_order ?? 0;
    const metaDesired = desired.metadata && typeof desired.metadata === "object" && !Array.isArray(desired.metadata) ? desired.metadata : {};
    if (!existing) {
        return { action: "create", existing_id: null };
    }
    const same =
        existing.name === desired.name &&
        (existing.description ?? null) === (desired.description ?? null) &&
        existing.sort_order === sort &&
        existing.is_active === desired.is_active &&
        jsonStable(existing.metadata ?? {}) === jsonStable(metaDesired);
    if (same) {
        return { action: "noop", existing_id: existing.id };
    }
    return { action: "update", existing_id: existing.id };
}

function statusAction(
    desired: VerticalBootstrapPayloadV1["status_definitions"][0],
    existing: {
        id: string;
        status_label: string;
        sort_order: number;
        is_active: boolean;
        metadata: Record<string, unknown> | null;
    } | null
): { action: BootstrapRowAction; existing_id: string | null } {
    const sort = desired.sort_order ?? 100;
    if (!existing) {
        return { action: "create", existing_id: null };
    }
    const metaEx = existing.metadata ?? {};
    const same =
        existing.status_label === desired.status_label &&
        existing.sort_order === sort &&
        existing.is_active === desired.is_active &&
        jsonStable(metaEx) === jsonStable(desired.metadata);
    if (same) {
        return { action: "noop", existing_id: existing.id };
    }
    return { action: "update", existing_id: existing.id };
}

function workUnitAction(
    desired: VerticalBootstrapPayloadV1["work_units"][0],
    existing: {
        id: string;
        name: string;
        description: string | null;
        sort_order: number;
        is_active: boolean;
        queue_definition: unknown;
    } | null
): { action: BootstrapRowAction; existing_id: string | null } {
    const sort = desired.sort_order ?? 0;
    if (!existing) {
        return { action: "create", existing_id: null };
    }
    const same =
        existing.name === desired.name &&
        (existing.description ?? null) === (desired.description ?? null) &&
        existing.sort_order === sort &&
        existing.is_active === desired.is_active &&
        jsonStable(existing.queue_definition ?? {}) === jsonStable(desired.queue_definition ?? {});
    if (same) {
        return { action: "noop", existing_id: existing.id };
    }
    return { action: "update", existing_id: existing.id };
}

/**
 * Read-only: validate payload shape and describe create/update/noop per row. Resolves department_key
 * against payload departments and existing org departments.
 */
export async function previewVerticalBootstrap(
    supabase: SupabaseClient,
    orgId: string,
    rawPayload: unknown
): Promise<VerticalBootstrapPreviewResult> {
    const parsed = parseVerticalBootstrapPayload(rawPayload);
    if (!parsed.ok) {
        return {
            ok: false,
            errors: parsed.errors,
            warnings: [],
            onboarding_context: undefined,
            departments: [],
            status_definitions: [],
            work_units: [],
        };
    }
    const payload = parsed.payload;
    const onboardingEcho = payload.onboarding_context;
    const errors: string[] = [];
    const warnings: string[] = [];

    const deptKeysFromWu = new Set(payload.work_units.map((w) => w.department_key));
    const allDeptKeys = new Set<string>([...payload.departments.map((d) => d.key), ...deptKeysFromWu]);

    const { data: deptRows, error: deptErr } = await supabase
        .from("departments")
        .select("id, key, name, description, sort_order, is_active, metadata")
        .eq("org_id", orgId)
        .in("key", [...allDeptKeys]);

    if (deptErr) {
        return {
            ok: false,
            errors: [`Failed to load departments: ${deptErr.message}`],
            warnings: [],
            onboarding_context: onboardingEcho,
            departments: [],
            status_definitions: [],
            work_units: [],
        };
    }

    const existingDeptByKey = new Map<string, (typeof deptRows)[0]>();
    for (const r of deptRows ?? []) {
        const row = r as {
            id: string;
            key: string;
            name: string;
            description: string | null;
            sort_order: number;
            is_active: boolean;
            metadata: Record<string, unknown> | null;
        };
        existingDeptByKey.set(row.key, row);
    }

    for (const k of deptKeysFromWu) {
        if (!payload.departments.some((d) => d.key === k) && !existingDeptByKey.has(k)) {
            errors.push(`work_units reference unknown department_key "${k}" (not in payload and not in org)`);
        }
    }

    const existingStatusByPair = new Map<
        string,
        { id: string; status_label: string; sort_order: number; is_active: boolean; metadata: Record<string, unknown> | null }
    >();

    if (payload.status_definitions.length > 0) {
        const { data: statusRows, error: stErr } = await supabase
            .from("status_definitions")
            .select("id, entity_type, status_key, status_label, sort_order, is_active, metadata")
            .eq("org_id", orgId);

        if (stErr) {
            return {
                ok: false,
                errors: [`Failed to load status_definitions: ${stErr.message}`],
                warnings: [],
                onboarding_context: onboardingEcho,
                departments: [],
                status_definitions: [],
                work_units: [],
            };
        }
        for (const r of statusRows ?? []) {
            const row = r as {
                id: string;
                entity_type: string;
                status_key: string;
                status_label: string;
                sort_order: number;
                is_active: boolean;
                metadata: Record<string, unknown> | null;
            };
            const pair = `${row.entity_type}\0${row.status_key}`;
            existingStatusByPair.set(pair, {
                id: row.id,
                status_label: row.status_label,
                sort_order: row.sort_order,
                is_active: row.is_active,
                metadata: row.metadata,
            });
        }
    }

    const departmentPreview = payload.departments.map((d) => {
        const ex = existingDeptByKey.get(d.key) ?? null;
        const { action, existing_id } = deptAction(d, ex);
        return {
            key: d.key,
            action,
            existing_id,
            after: {
                name: d.name,
                description: d.description ?? null,
                sort_order: d.sort_order ?? 0,
                is_active: d.is_active !== false,
            },
        };
    });

    const statusPreview = payload.status_definitions.map((s) => {
        const pair = `${s.entity_type}\0${s.status_key}`;
        const ex = existingStatusByPair.get(pair) ?? null;
        const { action, existing_id } = statusAction(s, ex);
        return {
            entity_type: s.entity_type,
            status_key: s.status_key,
            action,
            existing_id,
            after: {
                status_label: s.status_label,
                sort_order: s.sort_order ?? 100,
                is_active: s.is_active !== false,
                metadata: s.metadata ?? {},
            },
        };
    });

    const wuDeptIds = new Map<string, string | null>();
    for (const d of payload.departments) {
        const ex = existingDeptByKey.get(d.key);
        wuDeptIds.set(d.key, ex?.id ?? null);
    }
    for (const k of allDeptKeys) {
        if (!wuDeptIds.has(k)) {
            const ex = existingDeptByKey.get(k);
            wuDeptIds.set(k, ex?.id ?? null);
        }
    }

    const existingWuByPair = new Map<
        string,
        { id: string; name: string; description: string | null; sort_order: number; is_active: boolean; queue_definition: unknown }
    >();

    if (payload.work_units.length > 0) {
        const deptIds = [...new Set([...wuDeptIds.values()].filter((x): x is string => typeof x === "string" && x.length > 0))];
        if (deptIds.length > 0) {
            const { data: wuRows, error: wuErr } = await supabase
                .from("work_units")
                .select("id, department_id, key, name, description, sort_order, is_active, queue_definition")
                .eq("org_id", orgId)
                .in("department_id", deptIds);

            if (wuErr) {
                return {
                    ok: false,
                    errors: [`Failed to load work_units: ${wuErr.message}`],
                    warnings: [],
                    onboarding_context: onboardingEcho,
                    departments: [],
                    status_definitions: [],
                    work_units: [],
                };
            }
            const deptIdToKey = new Map<string, string>();
            for (const [dk, id] of wuDeptIds) {
                if (id) deptIdToKey.set(id, dk);
            }
            for (const r of wuRows ?? []) {
                const row = r as {
                    id: string;
                    department_id: string;
                    key: string;
                    name: string;
                    description: string | null;
                    sort_order: number;
                    is_active: boolean;
                    queue_definition: unknown;
                };
                const dk = deptIdToKey.get(row.department_id);
                if (dk) {
                    existingWuByPair.set(`${dk}\0${row.key}`, row);
                }
            }
        }
    }

    const workUnitPreview = payload.work_units.map((w) => {
        const deptId = wuDeptIds.get(w.department_key) ?? null;
        const missing = !payload.departments.some((d) => d.key === w.department_key) && !existingDeptByKey.has(w.department_key);
        const pair = `${w.department_key}\0${w.key}`;
        const ex = deptId ? existingWuByPair.get(pair) ?? null : null;
        const { action, existing_id } = workUnitAction(w, ex);
        if (!deptId && !missing) {
            warnings.push(
                `work_units "${w.department_key}/${w.key}": department "${w.department_key}" will be created on apply before this row.`
            );
        }
        return {
            department_key: w.department_key,
            department_id: deptId,
            department_missing: missing,
            key: w.key,
            action,
            existing_id,
            after: {
                name: w.name,
                description: w.description ?? null,
                sort_order: w.sort_order ?? 0,
                is_active: w.is_active !== false,
                queue_definition: (w.queue_definition ?? {}) as Record<string, unknown>,
            },
        };
    });

    const ok = errors.length === 0;
    return {
        ok,
        errors,
        warnings,
        onboarding_context: onboardingEcho,
        departments: departmentPreview,
        status_definitions: statusPreview,
        work_units: workUnitPreview,
    };
}
