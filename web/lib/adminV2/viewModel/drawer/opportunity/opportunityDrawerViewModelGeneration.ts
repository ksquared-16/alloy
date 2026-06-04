import { createHash } from "node:crypto";

import { OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";

export function computeOpportunityDrawerViewModelGeneration(input: {
    orgId: string;
    opportunityId: string;
    departmentId: string | null;
    workUnitId: string | null;
    statusKey: string | null;
    layoutVersion: string;
    headerActionKeys: string[];
    aboveFoldSectionKeys: string[];
}): string {
    const payload = JSON.stringify({
        v: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
        orgId: input.orgId.trim(),
        opportunityId: input.opportunityId.trim(),
        departmentId: input.departmentId?.trim() ?? "",
        workUnitId: input.workUnitId?.trim() ?? "",
        statusKey: input.statusKey?.trim() ?? "",
        layoutVersion: input.layoutVersion,
        headerActionKeys: [...input.headerActionKeys].sort(),
        aboveFoldSectionKeys: [...input.aboveFoldSectionKeys].sort(),
    });
    return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}
