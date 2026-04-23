import SettingsFieldsHubClient from "./SettingsFieldsHubClient";

export const dynamic = "force-dynamic";

export default async function AdminV2SettingsFieldsPage({
    searchParams,
}: {
    searchParams: Promise<{ entity?: string }>;
}) {
    const sp = await searchParams;
    const entity = typeof sp.entity === "string" ? sp.entity : undefined;
    return <SettingsFieldsHubClient initialEntity={entity} />;
}
