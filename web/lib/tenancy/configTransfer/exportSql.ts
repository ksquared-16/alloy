/**
 * The export's one read (briefing M8). A single `BEGIN READ ONLY … ROLLBACK` statement that selects named columns
 * of the allowlisted configuration tables for one org, as one JSON document. It names no household, person,
 * record, transaction, document, message, binding or secret table, and selects no `*`: a test pins both.
 *
 * Source ids are read only to link rooms to sites and categories to sites in memory, and to recognise the seed id
 * namespace; `buildExportFile` drops every one of them. The org id is a psql variable, never interpolated.
 */

import { ENROLLMENT_DEPARTMENT_KEYS } from "./allowlist";

/** Every table the export reads. A test pins that the SQL reads nothing else. */
export const EXPORT_READ_TABLES = [
    "orgs",
    "locations",
    "customer_person_role_types",
    "departments",
    "work_units",
] as const;

const deptKeys = ENROLLMENT_DEPARTMENT_KEYS.map((k) => `'${k}'`).join(", ");

export function renderExportSql(): string {
    return `-- Tenant configuration export (briefing M8). Read-only; one org, named columns only.
\\set ON_ERROR_STOP 1
BEGIN READ ONLY;
SELECT json_build_object(
  'org', (SELECT json_build_object('id', o.id, 'name', o.name, 'status', o.status) FROM public.orgs o WHERE o.id = :'org_id'::uuid),
  'locations', (SELECT coalesce(json_agg(json_build_object(
      'id', l.id, 'label', l.label, 'location_type', l.location_type, 'parent_location_id', l.parent_location_id,
      'unit_role', l.unit_role, 'is_active', l.is_active, 'address1', l.address1, 'address2', l.address2,
      'city', l.city, 'state', l.state, 'postal_code', l.postal_code, 'country', l.country,
      'metadata', l.metadata, 'external_source', l.external_source) ORDER BY l.location_type, l.label, l.id), '[]'::json)
    FROM public.locations l
    WHERE l.org_id = :'org_id'::uuid AND l.location_type IN ('site', 'unit')
      AND l.customer_id IS NULL AND l.vendor_id IS NULL AND l.archived_at IS NULL),
  'role_types', (SELECT coalesce(json_agg(json_build_object(
      'id', t.id, 'key', t.key, 'label', t.label, 'description', t.description, 'sort_order', t.sort_order,
      'is_active', t.is_active, 'is_system', t.is_system, 'metadata', t.metadata) ORDER BY t.sort_order, t.key), '[]'::json)
    FROM public.customer_person_role_types t WHERE t.org_id = :'org_id'::uuid),
  'departments', (SELECT coalesce(json_agg(json_build_object(
      'id', d.id, 'key', d.key, 'name', d.name, 'description', d.description, 'sort_order', d.sort_order,
      'is_active', d.is_active, 'builder', d.metadata -> 'lifecycle_builder_v1',
      'metadata_keys', (SELECT coalesce(json_agg(k ORDER BY k), '[]'::json) FROM jsonb_object_keys(coalesce(d.metadata, '{}'::jsonb)) k)
    ) ORDER BY d.key), '[]'::json)
    FROM public.departments d WHERE d.org_id = :'org_id'::uuid AND d.key IN (${deptKeys})),
  'work_units', (SELECT coalesce(json_agg(json_build_object('department_id', w.department_id, 'key', w.key) ORDER BY w.key), '[]'::json)
    FROM public.work_units w WHERE w.org_id = :'org_id'::uuid AND w.is_active IS NOT FALSE AND w.key LIKE 'lifecycle\\_wu\\_%')
);
ROLLBACK;
`;
}
