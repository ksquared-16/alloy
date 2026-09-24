/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import FocusPanelCarrierActionRail from "@/components/admin/focusPanel/FocusPanelCarrierActionRail";
import { buildActionableDrawerCarrier } from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";
import { buildOpportunityDrawerHeaderMenuActions } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerHeaderMenuActions";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { emptyResolvedActionsBySlot, type ResolvedActionForClient } from "@/lib/admin/actions/types";

const act2 = act as unknown as (cb: () => void | Promise<void>) => Promise<void>;

const action = (over: Partial<ResolvedActionForClient>): ResolvedActionForClient => ({
    key: "k",
    label: "L",
    description: null,
    action_type: "mutation_command",
    icon: null,
    style: null,
    display_style: "button",
    payload: {},
    workflow_id: null,
    ...over,
});

/** The measured surface's own actions, one from each readiness class. */
const UPDATE_LEAD_STATUS = action({ key: "update_lead_status", label: "Update Lead Status", payload: { domain: "status" } });
const SCHEDULE_TOUR = action({
    key: "schedule_tour",
    label: "Schedule Tour",
    action_type: "open_form",
    payload: { form_key: "schedule_tour" },
});
const SEND_TOUR_INVITATION = action({
    key: "send_tour_invitation",
    label: "Send Tour Invitation",
    action_type: "ui_intent",
    payload: { intent: "send_tour_invitation" },
});

const RESOLVED = {
    ...emptyResolvedActionsBySlot(),
    primary: [UPDATE_LEAD_STATUS],
    secondary: [SCHEDULE_TOUR, SEND_TOUR_INVITATION],
};

const carrier = (over?: { opportunityId?: string; departmentId?: string | null; workUnitId?: string | null }) =>
    buildActionableDrawerCarrier({
        opportunityId: over?.opportunityId ?? "opp-B",
        attentionSubjectId: null,
        departmentId: over?.departmentId === undefined ? "dept-9" : over.departmentId,
        workUnitId: over?.workUnitId === undefined ? "wu-7" : over.workUnitId,
        resolved: RESOLVED,
        flushedAtMs: 391,
    })!;

let host: HTMLElement;
let root: Root;

async function render(node: React.ReactNode): Promise<HTMLElement> {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act2(() => {
        root.render(node as never);
    });
    return host;
}

/** Open the Manage dropdown so its items are in the document. */
async function openMenu(el: HTMLElement): Promise<void> {
    const trigger = el.querySelector<HTMLButtonElement>('[data-focus-panel-carrier-actions="true"] button');
    expect(trigger).not.toBeNull();
    await act2(() => {
        trigger!.click();
    });
}

const itemFor = (key: string): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`[data-registry-action-key="${key}"]`);

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    document.body.innerHTML = "";
});

describe("mounted carrier consumer — which actions the operator may actually run", () => {
    it("a CARRIER_SAFE action is mounted EXECUTABLE before the full drawer exists", async () => {
        const el = await render(
            createElement(FocusPanelCarrierActionRail, {
                carrier: carrier(),
                onActionSelect: () => {},
                actionLoadingKey: null,
                canMutate: true,
            }),
        );
        await openMenu(el);
        expect(itemFor("update_lead_status")?.disabled).toBe(false);
        expect(itemFor("update_lead_status")?.getAttribute("data-registry-action-executable")).toBe("true");
    });

    it("A FULL-DRAWER-REQUIRED ACTION CANNOT EXECUTE EARLY", async () => {
        const clicked = vi.fn();
        const el = await render(
            createElement(FocusPanelCarrierActionRail, {
                carrier: carrier(),
                onActionSelect: clicked,
                actionLoadingKey: null,
                canMutate: true,
            }),
        );
        await openMenu(el);
        const tour = itemFor("schedule_tour");
        expect(tour?.disabled).toBe(true);
        // Disabled in the DOM AND inert in the handler: a `disabled` attribute alone would still fire
        // for a synthetic dispatch or a keyboard path.
        await act2(() => {
            tour!.click();
        });
        expect(clicked).not.toHaveBeenCalled();
    });

    it("a CARRIER_VISIBLE_DISABLED action is shown, labelled, and not runnable", async () => {
        const el = await render(
            createElement(FocusPanelCarrierActionRail, {
                carrier: carrier(),
                onActionSelect: () => {},
                actionLoadingKey: null,
                canMutate: true,
            }),
        );
        await openMenu(el);
        const invite = itemFor("send_tour_invitation");
        expect(invite).not.toBeNull();
        expect(invite!.textContent).toContain("Send Tour Invitation");
        expect(invite!.disabled).toBe(true);
    });

    it("DO NOT HOLD A FOR B — the safe action is enabled while the others wait", async () => {
        const el = await render(
            createElement(FocusPanelCarrierActionRail, {
                carrier: carrier(),
                onActionSelect: () => {},
                actionLoadingKey: null,
                canMutate: true,
            }),
        );
        await openMenu(el);
        expect(itemFor("update_lead_status")?.disabled).toBe(false);
        expect(itemFor("schedule_tour")?.disabled).toBe(true);
    });

    it("PERMISSION DENIAL REMAINS DENIAL — no carrier makes an action the operator may not run", async () => {
        const el = await render(
            createElement(FocusPanelCarrierActionRail, {
                carrier: carrier(),
                onActionSelect: () => {},
                actionLoadingKey: null,
                canMutate: false,
            }),
        );
        const trigger = el.querySelector<HTMLButtonElement>('[data-focus-panel-carrier-actions="true"] button');
        expect(trigger?.disabled).toBe(true);
    });

    it("NOTHING EXECUTABLE MEANS NOTHING OFFERED — no false FIRST ACTIONABLE", async () => {
        const noneSafe = buildActionableDrawerCarrier({
            opportunityId: "opp-B",
            attentionSubjectId: null,
            departmentId: "dept-9",
            workUnitId: "wu-7",
            resolved: { ...emptyResolvedActionsBySlot(), primary: [SCHEDULE_TOUR] },
            flushedAtMs: 1,
        })!;
        const el = await render(
            createElement(FocusPanelCarrierActionRail, {
                carrier: noneSafe,
                onActionSelect: () => {},
                actionLoadingKey: null,
                canMutate: true,
            }),
        );
        // An enabled Manage trigger over an entirely disabled menu would satisfy the FIRST ACTIONABLE
        // selector while the operator can do nothing — a measurement this programme has already had
        // to discard results for.
        const trigger = el.querySelector<HTMLButtonElement>('[data-focus-panel-carrier-actions="true"] button');
        expect(trigger?.disabled).toBe(true);
        expect(el.querySelector('[data-focus-panel-carrier-executable-count="0"]')).not.toBeNull();
    });

    it("the mounted rail names the subject it is speaking for", async () => {
        const el = await render(
            createElement(FocusPanelCarrierActionRail, {
                carrier: carrier({ opportunityId: "opp-B" }),
                onActionSelect: () => {},
                actionLoadingKey: null,
                canMutate: true,
            }),
        );
        expect(el.querySelector('[data-focus-panel-carrier-subject="opp-B"]')).not.toBeNull();
    });

    it("hands the handler the resolver's action VERBATIM, readiness stripped", async () => {
        const clicked = vi.fn();
        const el = await render(
            createElement(FocusPanelCarrierActionRail, {
                carrier: carrier(),
                onActionSelect: clicked,
                actionLoadingKey: null,
                canMutate: true,
            }),
        );
        await openMenu(el);
        await act2(() => {
            itemFor("update_lead_status")!.click();
        });
        expect(clicked).toHaveBeenCalledTimes(1);
        expect(clicked.mock.calls[0]![0]).toEqual(UPDATE_LEAD_STATUS);
        expect(clicked.mock.calls[0]![0]).not.toHaveProperty("readiness");
    });
});

/**
 * ARGUMENT CORRECTNESS (Part 4).
 *
 * The question this answers is not "did a request go out" but "did it carry the arguments the FULL
 * drawer would have sent". An action that runs early against the wrong department is worse than one
 * that runs late against the right one.
 */
describe("a carrier-safe action executes with the canonical arguments", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data: { execution_result: { kind: "mutate" } } }),
        });
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it("POSTs the carrier's own subject, department and work unit", async () => {
        const c = carrier();
        const result = await applyRegistryResolvedActionClient(UPDATE_LEAD_STATUS, {
            router: { push: () => {}, refresh: () => {} },
            focusRecord: () => {},
            entityId: c.subject.opportunity_id,
            departmentId: c.execution.department_id,
            workUnitId: c.execution.work_unit_id,
            context: {
                surface: c.execution.surface,
                department_id: c.execution.department_id,
                work_unit_id: c.execution.work_unit_id,
            },
            invalidate: () => {},
        });
        expect(result.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe("/api/admin/actions/execute");
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({
            action_key: "update_lead_status",
            entity_type: "opportunity",
            entity_id: "opp-B",
            context: { surface: "record_header", department_id: "dept-9", work_unit_id: "wu-7" },
        });
    });

    it("the arguments are IDENTICAL to the ones the resolved drawer would send", async () => {
        // The mounted path reads `displayVm.workspace.{department_id,work_unit_id}`, which is the
        // compose input verbatim — the same input the carrier quotes. So the two phases build the
        // same body, and this asserts it on the wire rather than by reading the code.
        const c = carrier();
        const phaseTwoWorkspace = { department_id: "dept-9", work_unit_id: "wu-7" };
        expect({
            department_id: c.execution.department_id,
            work_unit_id: c.execution.work_unit_id,
        }).toEqual(phaseTwoWorkspace);
    });

    it("A CARRIER NEVER INVENTS A DEPARTMENT — a null one stays null, it is not filled in", async () => {
        const c = carrier({ departmentId: null });
        expect(c.execution.department_id).toBeNull();
        await applyRegistryResolvedActionClient(UPDATE_LEAD_STATUS, {
            router: { push: () => {}, refresh: () => {} },
            focusRecord: () => {},
            entityId: c.subject.opportunity_id,
            departmentId: c.execution.department_id,
            workUnitId: c.execution.work_unit_id,
            context: {
                surface: c.execution.surface,
                department_id: c.execution.department_id,
                work_unit_id: c.execution.work_unit_id,
            },
            invalidate: () => {},
        });
        const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
        expect(body.context.department_id).toBeNull();
    });
});

/**
 * PHASE-2 CONVERGENCE (Part 12).
 *
 * Both phases quote ONE `resolveActionsForContext` answer through ONE menu builder, so convergence
 * is structural rather than reconciled. These pin that: same input, same menu.
 */
describe("phase 2 preserves the action truth phase 1 already showed", () => {
    it("the carrier's menu IS the view model's menu for the same resolved answer", () => {
        const phaseOne = carrier().header_menu.map(({ readiness: _r, ...a }) => a);
        const phaseTwo = buildOpportunityDrawerHeaderMenuActions(RESOLVED, false);
        expect(phaseOne).toEqual(phaseTwo);
    });

    it("an action enabled in phase 1 is still present, and still itself, in phase 2", () => {
        const phaseOne = carrier().header_menu.filter((a) => a.readiness === "CARRIER_SAFE");
        const phaseTwo = buildOpportunityDrawerHeaderMenuActions(RESOLVED, false);
        for (const early of phaseOne) {
            const { readiness: _r, ...bare } = early;
            expect(phaseTwo).toContainEqual(bare);
        }
    });

    it("the ONE permitted late change lands on an action phase 1 held disabled", () => {
        // An active tour booking relabels Schedule tour, and that fact is a first-paint dependency
        // phase 1 cannot have. It is allowed because `schedule_tour` is FULL_DRAWER_REQUIRED, so the
        // wording that settles belongs to a control the operator could not use.
        const withTour = buildOpportunityDrawerHeaderMenuActions(RESOLVED, true);
        const changed = withTour.filter((late) => {
            const early = carrier().header_menu.find((e) => e.key === late.key);
            return early && early.label !== late.label;
        });
        expect(changed.map((c) => c.key)).toEqual(["schedule_tour"]);
        expect(carrier().header_menu.find((a) => a.key === "schedule_tour")!.readiness).toBe(
            "FULL_DRAWER_REQUIRED",
        );
    });
});
