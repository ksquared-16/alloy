import EntityFieldsClient from "@/components/admin/EntityFieldsClient";

export const dynamic = 'force-dynamic';

export default function AdminSystemVendorFieldsPage() {
    return <EntityFieldsClient entityType="vendor" title="Vendor Fields" />;
}
