import { describe, expect, it, vi, beforeEach } from "vitest";

import { emptyBosCommandDraft } from "@/lib/bos/commandSession/createSession";
import { applyOperatorFieldEdit } from "@/lib/bos/commandSession/draftEdits";
import { upsertSystemDraftField } from "@/lib/bos/commandSession/adapters/shared/bosAdapterDraftHelpers";
import { updateLeadStatusBosCommandAdapter } from "@/lib/bos/commandSession/adapters/updateLeadStatusAdapter";
import { addParentGuardianBosCommandAdapter } from "@/lib/bos/commandSession/adapters/addParentGuardianAdapter";
import { cancelTourBosCommandAdapter } from "@/lib/bos/commandSession/adapters/cancelTourBosAdapter";
import { listBosCommandAdapterKeys } from "@/lib/bos/commandSession/adapters/bosCommandAdapterRegistry";

vi.mock("@/lib/platform/commands/runtime/executePlatformCommandViaActionsApi", () => ({
    executePlatformCommandViaActionsApi: vi.fn(),
}));

import { executePlatformCommandViaActionsApi } from "@/lib/platform/commands/runtime/executePlatformCommandViaActionsApi";

const executeMock = vi.mocked(executePlatformCommandViaActionsApi);

function withSubject(draft = emptyBosCommandDraft()) {
    let next = upsertSystemDraftField(draft, "entity_id", "opp-1");
    next = upsertSystemDraftField(next, "entity_type", "opportunity");
    return next;
}

describe("BOS representative adapters", () => {
    beforeEach(() => {
        executeMock.mockReset();
    });

    it("registry includes the four family proofs", () => {
        expect(listBosCommandAdapterKeys()).toEqual([
            "create_lead",
            "update_lead_status",
            "add_parent_guardian",
            "cancel_tour",
        ]);
    });

    it("update_lead_status executes only via shared actions API bridge", async () => {
        executeMock.mockResolvedValue({
            ok: true,
            correlationId: "c1",
            result: {
                actionKey: "update_lead_status",
                entityType: "opportunity",
                entityId: "opp-1",
                affectedId: "opp-1",
                detail: { kind: "mutation" },
            },
        });
        let draft = withSubject();
        draft = applyOperatorFieldEdit(draft, "target_state", "qualified");
        expect(updateLeadStatusBosCommandAdapter.revalidate(draft, {}).readyToExecute).toBe(true);
        const payload = updateLeadStatusBosCommandAdapter.toExecutePayload(draft, {});
        const result = await updateLeadStatusBosCommandAdapter.execute(payload, {
            departmentId: "d1",
            surface: "bos_recommendations",
        });
        expect(result.ok).toBe(true);
        expect(executeMock).toHaveBeenCalledTimes(1);
        expect(executeMock.mock.calls[0]?.[0]).toMatchObject({
            commandKey: "update_lead_status",
            entityType: "opportunity",
            entityId: "opp-1",
            payload: { target_state: "qualified" },
            origin: "bos",
            mode: "execute",
            confirmation: { confirmed: true },
        });
    });

    it("add_parent_guardian executes only via shared actions API bridge", async () => {
        executeMock.mockResolvedValue({
            ok: true,
            correlationId: "c2",
            result: {
                actionKey: "add_parent_guardian",
                entityType: "opportunity",
                entityId: "opp-1",
                affectedId: "person-1",
                detail: { kind: "relationship" },
            },
        });
        let draft = withSubject();
        draft = upsertSystemDraftField(draft, "source_customer_id", "cust-1");
        draft = applyOperatorFieldEdit(draft, "first_name", "Ada");
        draft = applyOperatorFieldEdit(draft, "last_name", "Lovelace");
        const payload = addParentGuardianBosCommandAdapter.toExecutePayload(draft, {});
        const result = await addParentGuardianBosCommandAdapter.execute(payload, {});
        expect(result.ok).toBe(true);
        expect(executeMock).toHaveBeenCalledTimes(1);
        expect(executeMock.mock.calls[0]?.[0]).toMatchObject({
            commandKey: "add_parent_guardian",
            origin: "bos",
            mode: "execute",
        });
        expect(executeMock.mock.calls[0]?.[0].payload).toMatchObject({
            source_customer_id: "cust-1",
            create_person_draft: { first_name: "Ada", last_name: "Lovelace" },
        });
    });

    it("cancel_tour requires preview token and executes via shared bridge", async () => {
        executeMock.mockResolvedValue({
            ok: true,
            correlationId: "c3",
            result: {
                actionKey: "cancel_tour",
                entityType: "opportunity",
                entityId: "opp-1",
                affectedId: "bk-1",
                detail: { kind: "tour_cancel" },
            },
        });
        let draft = withSubject();
        draft = upsertSystemDraftField(draft, "booking_id", "bk-1");
        draft = upsertSystemDraftField(draft, "preview_token", "tok-abc");
        const payload = cancelTourBosCommandAdapter.toExecutePayload(draft, {});
        const result = await cancelTourBosCommandAdapter.execute(payload, {});
        expect(result.ok).toBe(true);
        expect(executeMock).toHaveBeenCalledTimes(1);
        expect(executeMock.mock.calls[0]?.[0]).toMatchObject({
            commandKey: "cancel_tour",
            mode: "execute",
            previewToken: "tok-abc",
            confirmation: { confirmed: true },
            origin: "bos",
        });
    });

    it("adapters do not invent private fetch URLs", async () => {
        const srcs = [
            require("node:fs").readFileSync(
                require("node:path").resolve(
                    __dirname,
                    "../../../lib/bos/commandSession/adapters/updateLeadStatusAdapter.ts"
                ),
                "utf8"
            ),
            require("node:fs").readFileSync(
                require("node:path").resolve(
                    __dirname,
                    "../../../lib/bos/commandSession/adapters/addParentGuardianAdapter.ts"
                ),
                "utf8"
            ),
            require("node:fs").readFileSync(
                require("node:path").resolve(
                    __dirname,
                    "../../../lib/bos/commandSession/adapters/cancelTourBosAdapter.ts"
                ),
                "utf8"
            ),
        ];
        for (const src of srcs) {
            expect(src).toContain("executePlatformCommandViaActionsApi");
            expect(src).not.toMatch(/\/api\/admin\/mutations\/execute/);
            expect(src).not.toMatch(/\/api\/admin\/relationship-actions\/execute/);
            expect(src).not.toMatch(/\/api\/admin\/tours\/bookings\/.+\/cancel/);
        }
    });
});
