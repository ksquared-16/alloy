import { redirect } from "next/navigation";
import OrganizationConfigurationPage, {
    type OrganizationConfigurationLocation,
} from "@/components/adminV2/settings/organization/OrganizationConfigurationPage";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { heldAccessCapabilities, isOrganizationDomainVisible } from "@/lib/access/surfaceCapabilities";
import { organizationConfigurationDomains } from "@/lib/configRuntime/organizationRuntime";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function AdminV2OrganizationSettingsPage() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        redirect(ctx.status === 401 ? "/login" : "/unauthorized");
    }

    // W49-F2. Which domain cards this principal may be *offered* — decided here, from the surface
    // declaration, so a card can never link to a page that redirects. Both context loaders share
    // one request-memoized bundle, so this costs no additional query.
    const access = await getAdminAccessContextCached();
    const held = access.ok ? heldAccessCapabilities(access) : new Set<string>();
    const visibleDomainKeys = organizationConfigurationDomains()
        .map((domain) => domain.key)
        .filter((key) => isOrganizationDomainVisible(key, held));

    const supabase = createAdminClient();
    const [organizationResult, locationsResult] = await Promise.all([
        supabase.from("orgs").select("id, name, status").eq("id", ctx.orgId).maybeSingle(),
        supabase
            .from("locations")
            .select("id, label, city, state, is_active")
            .eq("org_id", ctx.orgId)
            .eq("location_type", "site")
            .order("is_active", { ascending: false })
            .order("label", { ascending: true }),
    ]);

    if (organizationResult.error) {
        throw new Error(`Unable to load organization configuration: ${organizationResult.error.message}`);
    }
    if (locationsResult.error) {
        throw new Error(`Unable to load organization locations: ${locationsResult.error.message}`);
    }
    if (!organizationResult.data) {
        throw new Error("Unable to load organization configuration: organization not found.");
    }

    const organization = organizationResult.data;
    const locations: OrganizationConfigurationLocation[] = (locationsResult.data ?? []).map((location) => ({
        id: String(location.id),
        label: String(location.label ?? "").trim() || "Untitled location",
        locality:
            [location.city, location.state]
                .map((value) => String(value ?? "").trim())
                .filter(Boolean)
                .join(", ") || null,
        isActive: location.is_active !== false,
    }));

    return (
        <OrganizationConfigurationPage
            organization={{
                id: String(organization.id),
                name: String(organization.name ?? "").trim() || "Organization",
                status: String(organization.status ?? "active").trim() || "active",
            }}
            locations={locations}
            visibleDomainKeys={visibleDomainKeys}
        />
    );
}
