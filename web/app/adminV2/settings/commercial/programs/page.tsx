import { redirect } from "next/navigation";
import { organizationProgramsHref } from "@/lib/admin/canonicalAdminRoutes";

export const dynamic = "force-dynamic";

/** Compatibility stub — next.config redirects; this never remains a competing page. */
export default function LegacySettingsCommercialProgramsPage() {
    redirect(organizationProgramsHref());
}
