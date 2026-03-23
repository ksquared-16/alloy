import EntityFieldsClient from "@/components/admin/EntityFieldsClient";

export const dynamic = 'force-dynamic';

export default function AdminSystemScheduleFieldsPage() {
    return <EntityFieldsClient entityType="schedule" title="Schedule Fields" />;
}
