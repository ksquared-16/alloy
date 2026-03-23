import EntityFieldsClient from "@/components/admin/EntityFieldsClient";

export const dynamic = 'force-dynamic';

export default function AdminSystemJobFieldsPage() {
    return <EntityFieldsClient entityType="job" title="Job Fields" />;
}
