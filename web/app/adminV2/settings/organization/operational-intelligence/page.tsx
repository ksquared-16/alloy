import { Suspense } from "react";
import OperationalIntelligenceWorkspace from "@/components/adminV2/settings/operationalIntelligence/OperationalIntelligenceWorkspace";

export const dynamic = "force-dynamic";

/** Canonical Organization Operational Intelligence — `/organization/operational-intelligence`. */
export default function OrganizationOperationalIntelligencePage() {
    return (
        <Suspense fallback={<p className="p-4 text-sm text-alloy-midnight/55">Loading Operational Intelligence…</p>}>
            <OperationalIntelligenceWorkspace />
        </Suspense>
    );
}
