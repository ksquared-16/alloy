import { redirect } from "next/navigation";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import OrganizationCommunicationsPage from "@/components/adminV2/settings/organization/OrganizationCommunicationsPage";

export const dynamic = "force-dynamic";

/**
 * Canonical Organization Communications — `/organization/communications`.
 *
 * The single configuration surface for the channels an organization sends and
 * receives on. `/settings/communications` and `/adminV2/settings/communications`
 * redirect here; there is no second implementation behind them.
 */
export default async function OrganizationCommunicationsRoute() {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    return <OrganizationCommunicationsPage />;
}
