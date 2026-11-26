import { redirect } from "next/navigation";
import { CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF } from "@/lib/admin/canonicalAdminRoutes";

export const dynamic = "force-dynamic";

/** Compatibility: `/settings/calculations` → Organization Operational Intelligence. */
export default function AdminV2SettingsCalculationsPage() {
    redirect(CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF);
}
