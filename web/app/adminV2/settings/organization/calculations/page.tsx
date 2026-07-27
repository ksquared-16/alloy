import { Suspense } from "react";
import OrganizationCalculationsWorkspace from "@/components/adminV2/settings/organizationCalculations/OrganizationCalculationsWorkspace";

export const dynamic = "force-dynamic";

/** Canonical Organization Calculations — `/organization/calculations`. */
export default function OrganizationCalculationsPage() {
    return (
        <Suspense fallback={<p className="p-4 text-sm text-alloy-midnight/55">Loading Organization Calculations…</p>}>
            <OrganizationCalculationsWorkspace />
        </Suspense>
    );
}
