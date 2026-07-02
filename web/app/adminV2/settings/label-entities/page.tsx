import EntityLabelsClient from "@/app/legacy-admin/system/entity-labels/EntityLabelsClient";

export const dynamic = "force-dynamic";

/**
 * Operator-facing Entity Labels settings at /settings/label-entities.
 * Configure tenant labels: opportunity → Lead, opportunity_customer_member →
 * Child Enrollment / Enrollment Participation, etc. Wired to the entity_labels
 * storage + /api/admin/entity-labels via EntityLabelsClient (same page also served
 * at /settings/entity-labels).
 */
export default function AdminV2SettingsLabelEntitiesPage() {
    return <EntityLabelsClient adminV2Chrome />;
}
