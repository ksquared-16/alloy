import { describe, expect, it, vi } from "vitest";
import {
    readOpportunityDepartmentIdFromMetadata,
    resolveOpportunityDepartmentId,
} from "@/lib/opportunities/resolveOpportunityDepartmentId";

describe("resolveOpportunityDepartmentId", () => {
    it("reads department_id from opportunity metadata", () => {
        expect(
            readOpportunityDepartmentIdFromMetadata({
                department_id: "dept-meta",
                created_via: "create_lead",
            }),
        ).toBe("dept-meta");
    });

    it("falls back to work unit department when metadata is absent", async () => {
        const maybeSingle = vi.fn().mockResolvedValue({
            data: { department_id: "dept-wu" },
            error: null,
        });
        const supabase = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({ maybeSingle }),
                    }),
                }),
            }),
        };

        const departmentId = await resolveOpportunityDepartmentId(
            supabase as never,
            "org-1",
            { work_unit_id: "wu-1" },
        );

        expect(departmentId).toBe("dept-wu");
        expect(supabase.from).toHaveBeenCalledWith("work_units");
    });

    it("prefers metadata department over work unit lookup", async () => {
        const supabase = { from: vi.fn() };

        const departmentId = await resolveOpportunityDepartmentId(
            supabase as never,
            "org-1",
            { metadata: { department_id: "dept-meta" }, work_unit_id: "wu-1" },
        );

        expect(departmentId).toBe("dept-meta");
        expect(supabase.from).not.toHaveBeenCalled();
    });
});
