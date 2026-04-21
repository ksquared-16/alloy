import { OPPORTUNITY_LIFECYCLE_STAGES } from "@/lib/admin/statusDefinitionLifecycle";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import { normalizeQueueDefinitionForCreate } from "@/lib/rrs/queue/queueDefinitionV1";
import {
    DEPARTMENT_KEY_REGEX,
    ENTITY_TYPE_REGEX,
    normalizeDepartmentOrWorkUnitKey,
    normalizeStatusKey,
    STATUS_KEY_REGEX,
} from "@/lib/admin/verticalBootstrap/bootstrapKeys";
import { parseOnboardingContext } from "@/lib/admin/verticalBootstrap/parseOnboardingContext";
import type {
    VerticalBootstrapDepartmentInput,
    VerticalBootstrapPayloadV1,
    VerticalBootstrapStatusInput,
    VerticalBootstrapWorkUnitInput,
} from "@/lib/admin/verticalBootstrap/types";

const LIFECYCLE_SET = new Set<string>(OPPORTUNITY_LIFECYCLE_STAGES);

function pushErr(errors: string[], msg: string) {
    errors.push(msg);
}

function parseDepartment(raw: unknown, i: number, errors: string[]): VerticalBootstrapDepartmentInput | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        pushErr(errors, `departments[${i}]: must be an object`);
        return null;
    }
    const o = raw as Record<string, unknown>;
    const key = normalizeDepartmentOrWorkUnitKey(typeof o.key === "string" ? o.key : "");
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!key || !DEPARTMENT_KEY_REGEX.test(key)) {
        pushErr(errors, `departments[${i}]: key must match ${DEPARTMENT_KEY_REGEX}`);
        return null;
    }
    if (!name) {
        pushErr(errors, `departments[${i}]: name is required`);
        return null;
    }
    const description =
        o.description === null || o.description === undefined
            ? null
            : typeof o.description === "string"
              ? o.description.trim() || null
              : null;
    const sort_order = typeof o.sort_order === "number" && !Number.isNaN(o.sort_order) ? o.sort_order : 0;
    const is_active = o.is_active !== false;
    const metadata =
        o.metadata != null && typeof o.metadata === "object" && !Array.isArray(o.metadata)
            ? (o.metadata as Record<string, unknown>)
            : {};
    return { key, name, description, sort_order, is_active, metadata };
}

function validateStatusMetadata(meta: Record<string, unknown>, path: string, errors: string[]): Record<string, unknown> | null {
    const normalized = normalizeStatusDefinitionMetadata(meta);
    if (normalized.lifecycle_stage !== undefined) {
        const ls = normalized.lifecycle_stage;
        if (typeof ls !== "string" || !LIFECYCLE_SET.has(ls.trim())) {
            pushErr(
                errors,
                `${path}: metadata.lifecycle_stage must be one of ${OPPORTUNITY_LIFECYCLE_STAGES.join(", ")} when set`
            );
            return null;
        }
    }
    return normalized;
}

function parseStatus(raw: unknown, i: number, errors: string[]): VerticalBootstrapStatusInput | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        pushErr(errors, `status_definitions[${i}]: must be an object`);
        return null;
    }
    const o = raw as Record<string, unknown>;
    const entity_type = typeof o.entity_type === "string" ? o.entity_type.trim() : "";
    const status_key = normalizeStatusKey(typeof o.status_key === "string" ? o.status_key : "");
    const status_label = typeof o.status_label === "string" ? o.status_label.trim() : "";
    if (!entity_type || !ENTITY_TYPE_REGEX.test(entity_type)) {
        pushErr(errors, `status_definitions[${i}]: entity_type is invalid`);
        return null;
    }
    if (!status_key || !STATUS_KEY_REGEX.test(status_key)) {
        pushErr(errors, `status_definitions[${i}]: status_key must match ${STATUS_KEY_REGEX}`);
        return null;
    }
    if (!status_label) {
        pushErr(errors, `status_definitions[${i}]: status_label is required`);
        return null;
    }
    const sort_order = typeof o.sort_order === "number" && !Number.isNaN(o.sort_order) ? o.sort_order : 100;
    const is_active = o.is_active !== false;
    const metaRaw =
        o.metadata != null && typeof o.metadata === "object" && !Array.isArray(o.metadata)
            ? (o.metadata as Record<string, unknown>)
            : {};
    const metadata = validateStatusMetadata(metaRaw, `status_definitions[${i}]`, errors);
    if (metadata === null) return null;
    return { entity_type, status_key, status_label, sort_order, is_active, metadata };
}

function parseWorkUnit(raw: unknown, i: number, errors: string[]): VerticalBootstrapWorkUnitInput | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        pushErr(errors, `work_units[${i}]: must be an object`);
        return null;
    }
    const o = raw as Record<string, unknown>;
    const department_key = normalizeDepartmentOrWorkUnitKey(typeof o.department_key === "string" ? o.department_key : "");
    const key = normalizeDepartmentOrWorkUnitKey(typeof o.key === "string" ? o.key : "");
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!department_key || !DEPARTMENT_KEY_REGEX.test(department_key)) {
        pushErr(errors, `work_units[${i}]: department_key is invalid`);
        return null;
    }
    if (!key || !DEPARTMENT_KEY_REGEX.test(key)) {
        pushErr(errors, `work_units[${i}]: key must match ${DEPARTMENT_KEY_REGEX}`);
        return null;
    }
    if (!name) {
        pushErr(errors, `work_units[${i}]: name is required`);
        return null;
    }
    const description =
        o.description === null || o.description === undefined
            ? null
            : typeof o.description === "string"
              ? o.description.trim() || null
              : null;
    const sort_order = typeof o.sort_order === "number" && !Number.isNaN(o.sort_order) ? o.sort_order : 0;
    const is_active = o.is_active !== false;
    const qdNorm = normalizeQueueDefinitionForCreate(o.queue_definition);
    if (!qdNorm.ok) {
        pushErr(errors, `work_units[${i}]: queue_definition — ${qdNorm.error}`);
        return null;
    }
    const metadata =
        o.metadata != null && typeof o.metadata === "object" && !Array.isArray(o.metadata)
            ? (o.metadata as Record<string, unknown>)
            : {};
    return {
        department_key,
        key,
        name,
        description,
        sort_order,
        is_active,
        queue_definition: qdNorm.value,
        metadata,
    };
}

export type ParseVerticalBootstrapPayloadResult =
    | { ok: true; payload: VerticalBootstrapPayloadV1 }
    | { ok: false; errors: string[] };

/**
 * Validate and normalize a vertical bootstrap JSON body. Does not touch the database.
 */
export function parseVerticalBootstrapPayload(raw: unknown): ParseVerticalBootstrapPayloadResult {
    const errors: string[] = [];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, errors: ["payload must be a JSON object"] };
    }
    const root = raw as Record<string, unknown>;
    if (root.schema_version !== 1) {
        pushErr(errors, "schema_version must be 1");
    }
    if (!Array.isArray(root.departments)) {
        pushErr(errors, "departments must be an array");
    }
    if (!Array.isArray(root.status_definitions)) {
        pushErr(errors, "status_definitions must be an array");
    }
    if (!Array.isArray(root.work_units)) {
        pushErr(errors, "work_units must be an array");
    }
    if (errors.length) {
        return { ok: false, errors };
    }

    const departmentsIn: VerticalBootstrapDepartmentInput[] = [];
    const seenDept = new Set<string>();
    for (let i = 0; i < (root.departments as unknown[]).length; i++) {
        const d = parseDepartment((root.departments as unknown[])[i], i, errors);
        if (!d) continue;
        if (seenDept.has(d.key)) {
            pushErr(errors, `duplicate department key in payload: ${d.key}`);
            continue;
        }
        seenDept.add(d.key);
        departmentsIn.push(d);
    }

    const statusesIn: VerticalBootstrapStatusInput[] = [];
    const seenStatus = new Set<string>();
    for (let i = 0; i < (root.status_definitions as unknown[]).length; i++) {
        const s = parseStatus((root.status_definitions as unknown[])[i], i, errors);
        if (!s) continue;
        const sk = `${s.entity_type}\0${s.status_key}`;
        if (seenStatus.has(sk)) {
            pushErr(errors, `duplicate status_definitions entry: ${s.entity_type} / ${s.status_key}`);
            continue;
        }
        seenStatus.add(sk);
        statusesIn.push(s);
    }

    const workUnitsIn: VerticalBootstrapWorkUnitInput[] = [];
    const seenWu = new Set<string>();
    for (let i = 0; i < (root.work_units as unknown[]).length; i++) {
        const w = parseWorkUnit((root.work_units as unknown[])[i], i, errors);
        if (!w) continue;
        const wk = `${w.department_key}\0${w.key}`;
        if (seenWu.has(wk)) {
            pushErr(errors, `duplicate work_units entry: ${w.department_key} / ${w.key}`);
            continue;
        }
        seenWu.add(wk);
        workUnitsIn.push(w);
    }

    if (errors.length) {
        return { ok: false, errors };
    }

    const vertical_key =
        typeof root.vertical_key === "string" && root.vertical_key.trim() !== ""
            ? root.vertical_key.trim()
            : undefined;

    const onboarding_context = parseOnboardingContext(root.onboarding_context, errors);

    if (errors.length) {
        return { ok: false, errors };
    }

    const payload: VerticalBootstrapPayloadV1 = {
        schema_version: 1,
        vertical_key,
        onboarding_context,
        departments: departmentsIn,
        status_definitions: statusesIn,
        work_units: workUnitsIn,
    };

    return { ok: true, payload };
}
