import { describe, expect, it, vi } from "vitest";
import { resolveOpenLeadFocusPanelHref } from "@/lib/platform/commands/createLead/resolveOpenLeadFocusPanelHref";

describe("resolveOpenLeadFocusPanelHref", () => {
    it("keeps a canonical Work View Focus Panel href", async () => {
        const href = await resolveOpenLeadFocusPanelHref({
            preferredHref:
                "/workspace/work-unit/leads?work_view_id=new_leads&subject_id=opp-1",
            opportunityId: "opp-1",
            fetchImpl: vi.fn(),
        });
        expect(href).toBe(
            "/workspace/work-unit/leads?work_view_id=new_leads&subject_id=opp-1",
        );
    });

    it("rejects lifecycle stage work-unit preferred hrefs", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/api/admin/entity/opportunities/opp-created")) {
                return new Response(
                    JSON.stringify({
                        ok: true,
                        data: {
                            entity: {
                                id: "opp-created",
                                work_unit_id: "wu-lead-id",
                                status_key: "new",
                                stage_key: "lead",
                            },
                        },
                    }),
                    { status: 200 },
                );
            }
            if (url.includes("/api/admin/work-units/wu-lead-id")) {
                return new Response(
                    JSON.stringify({
                        id: "wu-lead-id",
                        key: "lifecycle_wu_lead",
                        department_id: "dept-1",
                    }),
                    { status: 200 },
                );
            }
            if (url.includes("/api/admin/departments/dept-1")) {
                return new Response(
                    JSON.stringify({
                        id: "dept-1",
                        metadata: {
                            lifecycle_builder_v1: {
                                version: 1,
                                active_process_id: "proc-1",
                                processes: [
                                    {
                                        id: "proc-1",
                                        key: "enrollment",
                                        name: "Enrollment",
                                        is_active: true,
                                        stages: [{ key: "lead", label: "Lead", is_active: true }],
                                        work_views_v1: [
                                            {
                                                id: "new_leads",
                                                label: "Leads",
                                                compat_queue_key: "new_leads",
                                                visible_in_runtime: true,
                                                display_order: 1,
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    }),
                    { status: 200 },
                );
            }
            return new Response("not found", { status: 404 });
        }) as unknown as typeof fetch;

        const href = await resolveOpenLeadFocusPanelHref({
            preferredHref: "/workspace/work-unit/lifecycle-wu-lead?subject_id=opp-created",
            opportunityId: "opp-created",
            sessionWorkUnitId: null,
            fetchImpl,
        });

        expect(href).toBe(
            "/workspace/work-unit/leads?work_view_id=new_leads&subject_id=opp-created",
        );
    });

    it("uses success Work View fields without fetching when provided", async () => {
        const fetchImpl = vi.fn() as unknown as typeof fetch;
        const href = await resolveOpenLeadFocusPanelHref({
            preferredHref: "/workspace",
            opportunityId: "opp-created",
            workViewId: "new_leads",
            workViewRouteKey: "leads",
            fetchImpl,
        });
        expect(href).toBe(
            "/workspace/work-unit/leads?work_view_id=new_leads&subject_id=opp-created",
        );
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
