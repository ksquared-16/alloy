import { describe, expect, it } from "vitest";
import { resolveOpportunityStatusDisplay } from "@/lib/admin/drawer/opportunityStatusDisplayResolve";
import {
    resolveCustomerStageLabelFromOpportunities,
    resolvePrimaryOpportunityIdForCustomer,
} from "@/lib/admin/drawer/resolveOpportunityStatusLabelsBatch";

describe("resolveOpportunityStatusLabelsBatch helpers", () => {
    it("resolvePrimaryOpportunityIdForCustomer prefers explicit opportunity anchor", () => {
        const customerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        const rows = [
            { id: "11111111-1111-1111-1111-111111111111", customer_id: customerId },
            { id: "22222222-2222-2222-2222-222222222222", customer_id: customerId },
        ];
        expect(
            resolvePrimaryOpportunityIdForCustomer(
                customerId,
                rows,
                "22222222-2222-2222-2222-222222222222"
            )
        ).toBe("22222222-2222-2222-2222-222222222222");
    });

    it("resolveCustomerStageLabelFromOpportunities reads resolved drawer labels", () => {
        const customerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        const oppId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        const rows = [{ id: oppId, customer_id: customerId, status_key: "new_lead" }];
        const labels = new Map([[oppId, "New Lead"]]);
        expect(resolveCustomerStageLabelFromOpportunities(customerId, rows, labels, oppId)).toBe("New Lead");
    });
});

describe("resolveOpportunityStatusDisplay parity", () => {
    it("prefers pipeline stage name over stale inquiry label when status key is stage id", () => {
        const stageId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        const label = resolveOpportunityStatusDisplay({
            statusKey: stageId,
            statusDefs: [{ status_key: stageId, status_label: "New Inquiry" }],
            pipelineStageId: stageId,
            pipelineStageName: "New Lead",
        });
        expect(label).toBe("New Lead");
    });
});
