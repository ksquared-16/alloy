import EntityFieldsClient from "@/components/admin/EntityFieldsClient";

export const dynamic = 'force-dynamic';

export default function AdminSystemCustomerFieldsPage() {
    return <EntityFieldsClient entityType="customer" title="Customer Fields" />;
}
