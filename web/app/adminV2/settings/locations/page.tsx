import LocationsConfigurationPage from "@/components/adminV2/settings/locations/LocationsConfigurationPage";
import { parseLocationSettingsLocationId } from "@/lib/admin/canonicalLocationSettingsRoutes";
import { resolveActiveLocationConcern } from "@/lib/locations/locationConcernContract";

export const dynamic = "force-dynamic";

export default async function AdminV2SettingsLocationsPage({
    searchParams,
}: {
    searchParams: Promise<{ locationId?: string; tab?: string; itemId?: string }>;
}) {
    const sp = await searchParams;
    const locationId = parseLocationSettingsLocationId(sp.locationId);
    const { concern: tab } = resolveActiveLocationConcern(sp.tab);
    const itemId = String(sp.itemId ?? "").trim() || null;
    return <LocationsConfigurationPage initialLocationId={locationId} initialTab={tab} initialItemId={itemId} />;
}
