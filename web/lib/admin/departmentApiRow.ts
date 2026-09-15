/**
 * The row shape `/api/admin/departments` returns.
 *
 * Rehomed here when the legacy Departments settings client was retired. The department PRODUCT is
 * gone; the row is still internal grouping identity — `docs/platform/core/entity-model.md` files it
 * as "ACL + metadata ownership" — so its API shape needs a neutral home rather than living inside a
 * deleted UI component. Live code must never import a type from a dead screen.
 */
export type DepartmentApiRow = {
    id: string;
    org_id: string;
    key: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
    /** JSONB — attention rules, activity signals, tenant_slice, lifecycle documents. */
    metadata?: unknown;
    created_at: string;
    updated_at: string | null;
};
