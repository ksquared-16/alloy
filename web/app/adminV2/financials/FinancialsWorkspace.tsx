"use client";

/**
 * FINANCIALS — the workspace body: which section is showing, and nothing else.
 *
 * Every section owns its own surface and reads its own server projection. This file routes and
 * holds no financial state, which is what keeps "the workspace computes no money" true as
 * sections are added: there is no shared place for a total to accumulate.
 */

import FinancialsAccounts from "@/app/adminV2/financials/sections/FinancialsAccounts";
import FinancialsActivity from "@/app/adminV2/financials/sections/FinancialsActivity";
import FinancialsCharges from "@/app/adminV2/financials/sections/FinancialsCharges";
import FinancialsOverview from "@/app/adminV2/financials/sections/FinancialsOverview";
import FinancialsPayments from "@/app/adminV2/financials/sections/FinancialsPayments";
import FinancialsStudio from "@/app/adminV2/financials/sections/FinancialsStudio";
import FinancialsSubsidy from "@/app/adminV2/financials/sections/FinancialsSubsidy";
import type { FinancialWorkQueueState } from "@/app/adminV2/financials/useFinancialWorkQueue";
import type {
    FinancialsOverviewMetrics,
    FinancialsReadState,
} from "@/app/adminV2/financials/useFinancialsReads";
import type { FinancialsSection, FinancialsWorkSection } from "@/app/adminV2/financials/financialsSections";
import type { FinancialActivityFeed } from "@/lib/financials/workspace/resolveFinancialActivity";
import type { FinancialPaymentFlow } from "@/lib/financials/workspace/resolveFinancialPaymentFlow";
import type { FinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";

export default function FinancialsWorkspace({
    section,
    queue,
    metrics,
    position,
    flow,
    activity,
    scopeLabel,
    onOpenSection,
}: {
    section: FinancialsSection;
    queue: FinancialWorkQueueState;
    metrics: FinancialsReadState<FinancialsOverviewMetrics>;
    position: FinancialsReadState<FinancialPositionCohort>;
    flow: FinancialsReadState<FinancialPaymentFlow>;
    activity: FinancialsReadState<FinancialActivityFeed>;
    scopeLabel: string;
    onOpenSection: (section: FinancialsWorkSection) => void;
}) {
    switch (section) {
        case "overview":
            return <FinancialsOverview metrics={metrics} scopeLabel={scopeLabel} onOpenSection={onOpenSection} />;
        case "accounts":
            return <FinancialsAccounts position={position} scopeLabel={scopeLabel} />;
        case "charges":
            return <FinancialsCharges queue={queue} scopeLabel={scopeLabel} />;
        case "payments":
            return <FinancialsPayments flow={flow} scopeLabel={scopeLabel} />;
        case "subsidy":
            return <FinancialsSubsidy position={position} scopeLabel={scopeLabel} />;
        case "activity":
            return <FinancialsActivity activity={activity} scopeLabel={scopeLabel} />;
        case "setup":
            return <FinancialsStudio />;
        default: {
            const _exhaustive: never = section;
            return _exhaustive;
        }
    }
}
