/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import FocusPanelCarrierActionRail from "@/components/admin/focusPanel/FocusPanelCarrierActionRail";
import { useActionableDrawerCarrier } from "@/lib/adminV2/viewModel/drawer/opportunity/useActionableDrawerCarrier";
import { clearActionableDrawerCarriersForTests } from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrierStore";
import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import { publishActionableDrawerCarrier } from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrierStore";
import {
    CARRIER_LINE_KEY,
    DRAWER_VIEW_MODEL_LINE_KEY,
    buildActionableDrawerCarrier,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";
import { emptyResolvedActionsBySlot, type ResolvedActionForClient } from "@/lib/admin/actions/types";

const act2 = act as unknown as (cb: () => void | Promise<void>) => Promise<void>;

const UPDATE: ResolvedActionForClient = {
    key: "update_lead_status",
    label: "Update Lead Status",
    description: null,
    action_type: "mutation_command",
    icon: null,
    style: null,
    display_style: "button",
    payload: {},
    workflow_id: null,
};

const OPP = "1a132b7f-4737-42af-897b-b942ccf5546e";

/**
 * A MINIMAL STAND-IN FOR THE PANEL'S UNRESOLVED HEADER.
 *
 * It does exactly what `InlineOpportunityFocusPanel` does before the view model resolves: ask for
 * the carrier belonging to the subject it has committed to, and render the rail when there is one.
 */
function UnresolvedHeader({ subjectId }: { subjectId: string | null }) {
    const carrier = useActionableDrawerCarrier({ opportunityId: subjectId });
    return carrier ?
        createElement(FocusPanelCarrierActionRail, {
            carrier,
            onActionSelect: () => {},
            actionLoadingKey: null,
            canMutate: true,
        })
    :   null;
}

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

const fetchMock = vi.fn();
beforeEach(() => {
    clearActionActionSafe();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
function clearActionActionSafe() {
    clearActionableDrawerCarriersForTests();
}
afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

function streamed(chunks: string[]): Response {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const c of chunks) controller.enqueue(enc.encode(c));
            controller.close();
        },
    });
    return { ok: true, status: 200, body } as unknown as Response;
}

/**
 * THE READER MUST BE REACHABLE — not merely present in the source.
 *
 * Deployed 8e749e03 shipped a correct producer, a correct transport and a correct parser, and
 * mounted nothing: the hover prewarm asserts the queue row's own id as the attention subject
 * (`prewarmRecordWork(opportunity, id)`), the panel asserts none, and the store keyed identity on
 * that difference. `T_carrier_mounted` was absent from every deployed sample while the carrier was
 * arriving at click +164ms.
 *
 * The plant that was supposed to catch this asserted the consumer's JSX EXISTS. It does exist; it
 * was simply never handed a carrier. So this drives the real seam — response stream in, rail in the
 * document out — with the keys the transport actually produces.
 */
describe("the carrier reader is reachable from the real transport", () => {
    it("A CARRIER WARMED BY HOVER MOUNTS FOR THE PANEL THAT ASSERTS NO LENS", async () => {
        // Exactly the deployed shape: the prewarm asserts the row's own id as attention subject.
        const warmed = buildActionableDrawerCarrier({
            opportunityId: OPP,
            attentionSubjectId: OPP,
            departmentId: "dept-9",
            workUnitId: "wu-7",
            resolved: { ...emptyResolvedActionsBySlot(), primary: [UPDATE] },
            flushedAtMs: 385,
        })!;
        expect(warmed.subject.attention_subject_id).toBe(OPP);

        fetchMock.mockResolvedValue(
            streamed([
                `${JSON.stringify({ [CARRIER_LINE_KEY]: warmed })}\n`,
                `${JSON.stringify({ [DRAWER_VIEW_MODEL_LINE_KEY]: { generation: "g" } })}\n`,
            ]),
        );

        // The hover request: transport context asserting the row id, exactly as prewarmRecordWork does.
        await fetchOpportunityDrawerViewModelClient(
            OPP,
            { work_unit_id: "", department_id: "", attention_subject_id: OPP } as never,
            undefined,
            publishActionableDrawerCarrier,
        );

        // The panel commits to the same subject and asserts NO participation lens.
        const el = await render(createElement(UnresolvedHeader, { subjectId: OPP }));
        expect(
            el.querySelector(`[data-focus-panel-carrier-subject="${OPP}"]`),
            "the hover-warmed carrier must be readable by the panel that asks with no lens",
        ).not.toBeNull();
        expect(el.querySelector('[data-focus-panel-carrier-executable-count="1"]')).not.toBeNull();
    });

    it("a carrier for another subject still mounts nothing — the real guard is untouched", async () => {
        publishActionableDrawerCarrier(
            buildActionableDrawerCarrier({
                opportunityId: "opp-OTHER",
                attentionSubjectId: null,
                departmentId: "dept-9",
                workUnitId: "wu-7",
                resolved: { ...emptyResolvedActionsBySlot(), primary: [UPDATE] },
                flushedAtMs: 1,
            })!,
        );
        const el = await render(createElement(UnresolvedHeader, { subjectId: OPP }));
        expect(el.querySelector("[data-focus-panel-carrier-subject]")).toBeNull();
    });

    it("no committed subject mounts nothing", async () => {
        publishActionableDrawerCarrier(
            buildActionableDrawerCarrier({
                opportunityId: OPP,
                attentionSubjectId: null,
                departmentId: "dept-9",
                workUnitId: "wu-7",
                resolved: { ...emptyResolvedActionsBySlot(), primary: [UPDATE] },
                flushedAtMs: 1,
            })!,
        );
        const el = await render(createElement(UnresolvedHeader, { subjectId: null }));
        expect(el.querySelector("[data-focus-panel-carrier-subject]")).toBeNull();
    });

    it("the panel re-renders when the carrier arrives AFTER it has mounted", async () => {
        // The deployed ordering: the panel is already on screen at click +6ms and the carrier lands
        // at +164ms. A reader that only reads on first render would never show it.
        const el = await render(createElement(UnresolvedHeader, { subjectId: OPP }));
        expect(el.querySelector("[data-focus-panel-carrier-subject]")).toBeNull();

        await act2(() => {
            publishActionableDrawerCarrier(
                buildActionableDrawerCarrier({
                    opportunityId: OPP,
                    attentionSubjectId: OPP,
                    departmentId: "dept-9",
                    workUnitId: "wu-7",
                    resolved: { ...emptyResolvedActionsBySlot(), primary: [UPDATE] },
                    flushedAtMs: 385,
                })!,
            );
        });
        expect(el.querySelector(`[data-focus-panel-carrier-subject="${OPP}"]`)).not.toBeNull();
    });
});
