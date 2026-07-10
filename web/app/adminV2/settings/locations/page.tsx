import LocationsConfigurationPage from "@/components/adminV2/settings/locations/LocationsConfigurationPage";
import { parseLocationSettingsLocationId } from "@/lib/admin/canonicalLocationSettingsRoutes";

export const dynamic = "force-dynamic";

export default async function AdminV2SettingsLocationsPage({
    searchParams,
}: {
    searchParams: Promise<{ locationId?: string }>;
}) {
    const sp = await searchParams;
    const locationId = parseLocationSettingsLocationId(sp.locationId);
    return <LocationsConfigurationPage initialLocationId={locationId} />;
}
