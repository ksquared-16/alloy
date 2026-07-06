import EntityLabelsClient from "@/app/legacy-admin/system/entity-labels/EntityLabelsClient";

export const dynamic = "force-dynamic";

/** Operator-facing Entities settings at /settings/entities. */
export default function AdminV2SettingsEntitiesPage() {
    return <EntityLabelsClient adminV2Chrome />;
}
