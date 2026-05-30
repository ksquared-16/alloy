"use client";

import PersonDrawerChildModuleNav from "@/components/admin/entity/PersonDrawerChildModuleNav";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerChildModuleNavModel } from "@/lib/admin/person/resolvePersonDrawerChildModuleNavModel";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import type { DrawerTabKey } from "@/lib/entityPresentation";

/** Child drawer module shortcuts only — no opportunity enrollment pipeline. */
export default function PersonDrawerChildLifecycleRail({
    record,
    chromeHint,
    onSelectTab,
    onOpenOpportunityCommunications,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerChildChromeHint | null;
    onSelectTab: (tab: DrawerTabKey) => void;
    onOpenOpportunityCommunications: (opportunityId: string) => void;
}) {
    if (!personDrawerChildChromeActive(record, chromeHint)) {
        return null;
    }

    const moduleItems = resolvePersonDrawerChildModuleNavModel(record);
    const primaryOpportunityId = resolvePersonDrawerChildSummaryModel(record).primary_opportunity_id;

    const handleModuleClick = (key: string) => {
        if (key === "documents") {
            onSelectTab("documents");
            return;
        }
        if (key === "communications" && primaryOpportunityId) {
            onOpenOpportunityCommunications(primaryOpportunityId);
            return;
        }
        if (key === "activity") {
            onSelectTab("related");
        }
    };

    return (
        <PersonDrawerChildModuleNav items={moduleItems} onModuleClick={handleModuleClick} />
    );
}
