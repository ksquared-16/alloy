import { describe, expect, it, vi } from "vitest";
import { resolveOpenLeadFocusPanelHref } from "@/lib/platform/commands/createLead/resolveOpenLeadFocusPanelHref";

describe("resolveOpenLeadFocusPanelHref", () => {
    it("keeps a canonical Focus Panel href", async () => {
        const href = await resolveOpenLeadFocusPanelHref({
            preferredHref:
                "/workspace/work-unit/lifecycle-wu-lead?subject_id=opp-1",
            opportunityId: "opp-1",
            fetchImpl: vi.fn(),
        });
        expect(href).toBe(
            "/workspace/work-unit/lifecycle-wu-lead?subject_id=opp-1",
        );
    });

    it("resolves from opportunity work_unit_id when session has no Work Unit", async () => {
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
                            },
                        },
                    }),
                    { status: 200 },
                );
            }
            if (url.includes("/api/admin/work-units/wu-lead-id")) {
                return new Response(
                    JSON.stringify({ id: "wu-lead-id", key: "lifecycle_wu_lead" }),
                    { status: 200 },
                );
            }
            return new Response("not found", { status: 404 });
        }) as unknown as typeof fetch;

        const href = await resolveOpenLeadFocusPanelHref({
            preferredHref: "/workspace",
            opportunityId: "opp-created",
            sessionWorkUnitId: null,
            fetchImpl,
        });

        expect(href).toBe(
            "/workspace/work-unit/lifecycle-wu-lead?subject_id=opp-created",
        );
        expect(fetchImpl).toHaveBeenCalled();
    });

    it("uses session Work Unit id without loading the opportunity", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/api/admin/work-units/session-wu")) {
                return new Response(
                    JSON.stringify({ id: "session-wu", key: "lifecycle_wu_lead" }),
                    { status: 200 },
                );
            }
            return new Response("not found", { status: 404 });
        }) as unknown as typeof fetch;

        const href = await resolveOpenLeadFocusPanelHref({
            preferredHref: "/workspace",
            opportunityId: "opp-created",
            sessionWorkUnitId: "session-wu",
            fetchImpl,
        });

        expect(href).toBe(
            "/workspace/work-unit/lifecycle-wu-lead?subject_id=opp-created",
        );
        expect(
            (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
                String(c[0]).includes("/entity/opportunities/"),
            ),
        ).toBe(false);
    });
});
