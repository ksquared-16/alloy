import EntityFieldsClient from "@/components/admin/EntityFieldsClient";

export const dynamic = 'force-dynamic';

export default function AdminSystemOpportunityFieldsPage() {
    return <EntityFieldsClient entityType="opportunity" title="Opportunity Fields" />;
}
