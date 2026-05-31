/**
 * Person employee fields for waitlist household priority (Card 2.5).
 * Native `persons` columns — not field_values.
 */

export type PersonEmployeePlacementValues = {
    is_employee: boolean;
    employee_id: string;
    employee_source: string;
};

const MAX_EMPLOYEE_ID_LEN = 64;
const MAX_EMPLOYEE_SOURCE_LEN = 64;

export function readPersonEmployeePlacementValues(
    record: Record<string, unknown> | null | undefined
): PersonEmployeePlacementValues {
    const r = record ?? {};
    return {
        is_employee: r.is_employee === true,
        employee_id: typeof r.employee_id === "string" ? r.employee_id.trim() : "",
        employee_source: typeof r.employee_source === "string" ? r.employee_source.trim() : "",
    };
}

export function buildPersonEmployeePlacementPatch(
    draft: PersonEmployeePlacementValues,
    baseline: PersonEmployeePlacementValues
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (draft.is_employee !== baseline.is_employee) {
        patch.is_employee = draft.is_employee;
    }
    const nextId = draft.is_employee ? draft.employee_id.trim() || null : null;
    const baseId = baseline.is_employee ? baseline.employee_id.trim() || null : null;
    if (nextId !== baseId) {
        patch.employee_id = nextId;
    }
    const nextSrc = draft.employee_source.trim() || null;
    const baseSrc = baseline.employee_source.trim() || null;
    if (nextSrc !== baseSrc) {
        patch.employee_source = nextSrc;
    }
    if (draft.is_employee === false && baseline.is_employee === true) {
        if (!("employee_id" in patch)) patch.employee_id = null;
    }
    return patch;
}

export type PersonEmployeePlacementPatchParse =
    | {
          ok: true;
          updates: {
              is_employee?: boolean;
              employee_id?: string | null;
              employee_source?: string | null;
          };
      }
    | { ok: false; error: string };

export function parsePersonEmployeePlacementPatchBody(
    body: Record<string, unknown>
): PersonEmployeePlacementPatchParse {
    const out: {
        is_employee?: boolean;
        employee_id?: string | null;
        employee_source?: string | null;
    } = {};

    if (body.is_employee !== undefined) {
        if (typeof body.is_employee !== "boolean") {
            return { ok: false, error: "is_employee must be a boolean" };
        }
        out.is_employee = body.is_employee;
        if (body.is_employee === false) {
            out.employee_id = null;
        }
    }

    if (body.employee_id !== undefined) {
        if (body.employee_id === null || body.employee_id === "") {
            out.employee_id = null;
        } else if (typeof body.employee_id === "string") {
            const t = body.employee_id.trim();
            if (t.length > MAX_EMPLOYEE_ID_LEN) {
                return { ok: false, error: `employee_id must be at most ${MAX_EMPLOYEE_ID_LEN} characters` };
            }
            out.employee_id = t || null;
        } else {
            return { ok: false, error: "employee_id must be a string or null" };
        }
    }

    if (body.employee_source !== undefined) {
        if (body.employee_source === null || body.employee_source === "") {
            out.employee_source = null;
        } else if (typeof body.employee_source === "string") {
            const t = body.employee_source.trim();
            if (t.length > MAX_EMPLOYEE_SOURCE_LEN) {
                return {
                    ok: false,
                    error: `employee_source must be at most ${MAX_EMPLOYEE_SOURCE_LEN} characters`,
                };
            }
            out.employee_source = t || null;
        } else {
            return { ok: false, error: "employee_source must be a string or null" };
        }
    }

    if (out.is_employee === false && body.employee_id === undefined) {
        out.employee_id = null;
    }

    return { ok: true, updates: out };
}

const PERSON_EMPLOYEE_PLACEMENT_PATCH_KEYS = new Set([
    "is_employee",
    "employee_id",
    "employee_source",
]);

/** True when PATCH body only touches native employee placement columns. */
export function isPersonEmployeePlacementOnlyPatch(body: Record<string, unknown>): boolean {
    const keys = Object.keys(body).filter((k) => body[k] !== undefined);
    if (!keys.length) return false;
    return keys.every((k) => PERSON_EMPLOYEE_PLACEMENT_PATCH_KEYS.has(k));
}
