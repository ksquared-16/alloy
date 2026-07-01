import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import {
    fetchWorkflowsNavKpis,
    fetchWorkflowsNavSummary,
    resetWorkflowsNavSessionCacheForTests,
} from "@/lib/adminV2/workflowsNavSessionCache";

describe("workflowsNavSessionCache", () => {
    beforeEach(() => {
        resetWorkflowsNavSessionCacheForTests();
        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url: string) => {
            if (url.includes("/workflows/summary")) {
                return new Response(JSON.stringify({ workflows: [{ id: "wf-1" }] }), { status: 200 });
            }
            return new Response(JSON.stringify({ kpis: { runs_today: 2 } }), { status: 200 });
        });
    });

    afterEach(() => {
        resetWorkflowsNavSessionCacheForTests();
    });

    it("dedupes concurrent summary fetches", async () => {
        const [a, b] = await Promise.all([fetchWorkflowsNavSummary(), fetchWorkflowsNavSummary()]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const jsonA = await a.json();
        const jsonB = await b.json();
        expect(jsonA).toEqual(jsonB);
    });

    it("serves cached KPI payload immediately on warm read", async () => {
        const first = await fetchWorkflowsNavKpis();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const firstJson = await first.json();
        const second = await fetchWorkflowsNavKpis();
        const secondJson = await second.json();
        expect(secondJson).toEqual(firstJson);
    });
});
