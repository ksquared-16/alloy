import FieldsConfigurationPage from "@/components/adminV2/settings/fields/FieldsConfigurationPage";

export const dynamic = "force-dynamic";

export default async function AdminV2SettingsFieldsPage({
    searchParams,
}: {
    searchParams: Promise<{ entity?: string }>;
}) {
    const sp = await searchParams;
    const entity = typeof sp.entity === "string" ? sp.entity : undefined;
    return <FieldsConfigurationPage initialEntity={entity} />;
}
