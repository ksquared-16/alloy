/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { CondensedQueueRow } from "@/components/presentation/workUnit/CondensedQueueRow";
import {
    mapQueueRowSurfaceToCompactConfig,
    type CompactRowSlots,
    type QueueRowModel,
} from "@/lib/presentation/runtime";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return container;
}
afterEach(() => {
    if (container) {
        container.remove();
        container = null;
    }
});

/** A single-subject opportunity row context with every compact slot populated. */
function fullContext(): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Jordan Lee" },
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "new_lead",
        row_status_label: "New Lead",
        case_context: {
            case_id: "opp-1",
            display_name: "Jordan Lee",
            case_type_label: "Enrollment",
            case_status_key: "new_lead",
            case_status_label: "New Lead",
        },
        primary_contact: { display_name: "Casey Lee" },
        related_subjects_summary: [],
        attention_summary: { needs_attention: true, primary_reason_label: "Overdue follow-up" },
        work_summary: { open_count: 1, primary_open_label: "Call family" },
        current_work_summary: { label: "Schedule tour", state: "open", due_label: "Tue" },
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
    };
}

function row(context: QueueRowContext): QueueRowModel {
    return { context, entityType: "opportunity", entityId: "opp-1" };
}

/** All-visible, no-override config (the generic-fallback shape). */
const GENERIC: CompactRowSlots = mapQueueRowSurfaceToCompactConfig(null).slots;

describe("CondensedQueueRow — published surface config (visibility + labels)", () => {
    it("null rowConfig → generic-context rendering unchanged (all slots from frozen context)", () => {
        const el = render(<CondensedQueueRow row={row(fullContext())} onOpen={vi.fn()} />);
        const text = el.textContent ?? "";
        expect(text).toContain("Jordan Lee"); // subject
        expect(text).toContain("New Lead"); // status pill (row_status_label)
        expect(text).toContain("Casey Lee"); // contact
        expect(text).toContain("Overdue follow-up"); // attention
        expect(text).toContain("Schedule tour"); // work
        expect(text).toContain("Tue"); // due
        // Attention flag surfaces the data attr.
        expect(el.querySelector("[data-needs-attention]")).not.toBeNull();
    });

    it("hidden slot → that slot absent (config visible:false hides it)", () => {
        const cfg: CompactRowSlots = {
            ...GENERIC,
            status: { visible: false, label: null },
            contact: { visible: false, label: null },
            attention: { visible: false, label: null },
        };
        const el = render(<CondensedQueueRow row={row(fullContext())} rowConfig={cfg} onOpen={vi.fn()} />);
        const text = el.textContent ?? "";
        // Subject + work still render.
        expect(text).toContain("Jordan Lee");
        expect(text).toContain("Schedule tour");
        // Hidden slots gone.
        expect(text).not.toContain("New Lead");
        expect(text).not.toContain("Casey Lee");
        expect(text).not.toContain("Overdue follow-up");
        // Attention hidden → no data-needs-attention marker.
        expect(el.querySelector("[data-needs-attention]")).toBeNull();
    });

    it("label override → status pill shows the configured label instead of the context value", () => {
        const cfg: CompactRowSlots = {
            ...GENERIC,
            status: { visible: true, label: "Disposition" },
        };
        const el = render(<CondensedQueueRow row={row(fullContext())} rowConfig={cfg} onOpen={vi.fn()} />);
        const text = el.textContent ?? "";
        expect(text).toContain("Disposition");
        expect(text).not.toContain("New Lead");
    });

    it("selected rail present when isSelected", () => {
        const el = render(
            <CondensedQueueRow row={row(fullContext())} onOpen={vi.fn()} isSelected />,
        );
        expect(el.querySelector('[data-queue-row-active="true"]')).not.toBeNull();
        // Rail element (juniper bar) rendered.
        expect(el.querySelector(".bg-alloy-juniper")).not.toBeNull();
    });

    it("row is a button that opens on click", () => {
        const onOpen = vi.fn();
        const model = row(fullContext());
        const el = render(<CondensedQueueRow row={model} onOpen={onOpen} isFirst />);
        const button = el.querySelector("button");
        expect(button).not.toBeNull();
        expect(button?.getAttribute("data-queue-row-first")).toBe("true");
        act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(onOpen).toHaveBeenCalledWith(model);
    });
});
