import { describe, expect, it } from "vitest";

import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    findQueueSummaryForSelection,
    isExplicitWorkUnitQueueSelection,
    resolveAuthoritativeWorkUnitQueueKey,
    resolveWorkUnitFetchQueueKeyFromPill,
    resolveWorkUnitQueueCanonicalKey,
    resolveWorkUnitQueueKey,
    resolveWorkUnitQueueKeyFromLocation,
    workUnitActivePillKeyFromSelection,
    workUnitQueuePillKeySelected,
    workUnitQueuePillKeysEquivalent,
    workUnitQueueSelectionFetchQueueKey,
    workUnitQueueSelectionFromLocation,
    workUnitQueueSelectionFromPillKey,
    workUnitQueueSelectionToSearchParams,
} from "@/lib/adminV2/workUnitQueueSelection";
import {
    buildOpportunityDrawerQueueNavigatorFromDisplayItems,
    opportunityDrawerNavigatorMatchesWorkUnitSelection,
} from "@/lib/admin/opportunityDrawerQueueNavigator";

describe("drawer navigator filtered view", () => {
    const selection = workUnitQueueSelectionFromPillKey("wu-1", "enrolled");

    it("navigator carries selection and loaded_record_ids_in_order", () => {
        const nav = buildOpportunityDrawerQueueNavigatorFromDisplayItems({
            work_unit_id: "wu-1",
            department_id: "dept-1",
            queue_key: "enrolled",
            selection,
            displayItems: [
                { id: "r1", title: "1", quickActions: [] },
                { id: "r2", title: "2", quickActions: [] },
            ],
            generation: 1,
        })!;
        expect(nav.selection.queueKey).toBe("enrolled");
        expect(nav.loaded_record_ids_in_order).toEqual(["r1", "r2"]);
    });

    it("rejects navigator when loaded rows do not match selection", () => {
        expect(
            opportunityDrawerNavigatorMatchesWorkUnitSelection({
                selection,
                selected_pill_key: "enrolled",
                loaded_queue_key: "contact_attempted",
                attention_bucket_key: "",
            })
        ).toBe(false);
    });
});
