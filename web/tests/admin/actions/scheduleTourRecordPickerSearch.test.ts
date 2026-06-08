import { describe, expect, it, vi, afterEach } from "vitest";
import {
    buildScheduleTourPickerRowFromEntitySearch,
    filterScheduleTourEntitySearchRows,
    searchScheduleTourAccessibleRecords,
} from "@/lib/admin/actions/scheduleTourRecordPickerSearch";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

describe("scheduleTourRecordPickerSearch", () => {
    const candidate: TaskAssistEntitySearchCandidate = {
        entity_type: "opportunities",
        entity_id: "opp-42",
        label: "Hayes Family",
        subtitle: "Customer: Hayes Household",
        source: "opportunity_name",
        matched_fields: ["name"],
        confidence: "medium",
        disambiguation: { location_name: "North Campus" },
    };

    it("buildScheduleTourPickerRowFromEntitySearch maps entity search hits", () => {
        const row = buildScheduleTourPickerRowFromEntitySearch(candidate);
        expect(row?.opportunityId).toBe("opp-42");
        expect(row?.primaryLabel).toBe("Hayes Family");
        expect(row?.statusLine).toContain("North Campus");
    });

    it("buildScheduleTourPickerRowFromEntitySearch strips Family inquiry boilerplate", () => {
        const row = buildScheduleTourPickerRowFromEntitySearch(
            {
                ...candidate,
                entity_id: "opp-chen",
                label: "Family inquiry — Chen / West Campus",
                disambiguation: { location_name: "West Campus", customer_name: "Chen" },
            },
            { opportunityEntityLabel: "Lead" }
        );
        expect(row?.primaryLabel).toBe("Chen / West Campus");
        expect(row?.primaryLabel.toLowerCase()).not.toContain("family inquiry");
    });

    it("filterScheduleTourEntitySearchRows searches labels", () => {
        const rows = filterScheduleTourEntitySearchRows(
            [
                candidate,
                {
                    ...candidate,
                    entity_id: "opp-other",
                    label: "Other Family",
                    subtitle: null,
                },
            ],
            "hayes"
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.opportunityId).toBe("opp-42");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("searchScheduleTourAccessibleRecords calls task-assist entity-search API", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, candidates: [candidate] }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const rows = await searchScheduleTourAccessibleRecords({
            query: "hayes",
            siteId: "site-1",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = String(fetchMock.mock.calls[0]?.[0]);
        expect(url).toContain("/api/admin/ai/task-assist/entity-search");
        expect(url).toContain("entity_type=opportunities");
        expect(url).toContain("site_id=site-1");
        expect(rows[0]?.opportunityId).toBe("opp-42");
    });

    it("searchScheduleTourAccessibleRecords returns empty for short query", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const rows = await searchScheduleTourAccessibleRecords({ query: "a" });
        expect(rows).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
