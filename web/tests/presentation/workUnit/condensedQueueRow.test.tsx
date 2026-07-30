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
        current_work_summary: {
            label: "Schedule tour",
            state: "open",
            due_label: "Tue",
            progress_hint: "2 of 3 complete",
            blocker_hint: null,
        },
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
        // Any visible:false flips compactSlotsUsePublishedAuthority → true, so work must
        // carry fieldKeys (generic visible-only slots no longer fall through to frozen context).
        const cfg: CompactRowSlots = {
            ...GENERIC,
            status: { visible: false, label: null },
            contact: { visible: false, label: null },
            attention: { visible: false, label: null },
            work: { visible: true, label: null, fieldKeys: ["queue_row.work_summary"] },
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

    it("configured Stage field renders process stage, not row status or static label", () => {
        const cfg: CompactRowSlots = {
            ...GENERIC,
            status: { visible: true, label: "Stage", fieldKeys: ["queue_row.stage_label"] },
        };
        const el = render(<CondensedQueueRow row={row(fullContext())} rowConfig={cfg} onOpen={vi.fn()} />);
        const text = el.textContent ?? "";
        expect(text).toContain("New Leads");
        expect(text).not.toContain("Stage");
    });

    it("configured Status field renders row status such as Open", () => {
        const statusCtx: QueueRowContext = {
            ...fullContext(),
            row_stage: "Contacting",
            row_status_label: "Open",
        };
        const cfg: CompactRowSlots = {
            ...GENERIC,
            status: { visible: true, label: "Status", fieldKeys: ["opportunity.status_label"] },
        };
        const el = render(<CondensedQueueRow row={row(statusCtx)} rowConfig={cfg} onOpen={vi.fn()} />);
        expect(el.textContent).toContain("Open");
        expect(el.textContent).not.toContain("Contacting");
    });

    it("configured child name renders on child-grain rows", () => {
        const childCtx: QueueRowContext = {
            ...fullContext(),
            row_subject: { subject_type: "child", subject_id: "child-1", display_name: "Avery Lee" },
        };
        const cfg: CompactRowSlots = {
            ...GENERIC,
            groupCount: { visible: true, label: "Child name", fieldKeys: ["child.name"] },
        };
        const el = render(<CondensedQueueRow row={row(childCtx)} rowConfig={cfg} onOpen={vi.fn()} />);
        expect(el.textContent).toContain("Avery Lee");
    });

    it("family-grain child name shows children summary instead of blank", () => {
        const familyCtx: QueueRowContext = {
            ...fullContext(),
            related_subjects_summary: [
                {
                    subject_type: "child",
                    subject_id: "child-1",
                    display_name: "Avery Lee",
                    status_label: "Lead",
                },
            ],
        };
        const cfg: CompactRowSlots = {
            ...GENERIC,
            groupCount: { visible: true, label: "Child name", fieldKeys: ["child.name"] },
        };
        const el = render(<CondensedQueueRow row={row(familyCtx)} rowConfig={cfg} onOpen={vi.fn()} />);
        expect(el.textContent).toContain("Avery Lee");
    });

    it("selected state uses active attribute without a left rail", () => {
        const el = render(
            <CondensedQueueRow row={row(fullContext())} onOpen={vi.fn()} isSelected />,
        );
        expect(el.querySelector('[data-queue-row-active="true"]')).not.toBeNull();
        expect(el.querySelector(".bg-alloy-bend-pine")).toBeNull();
        expect(el.querySelector('[class*="w-[3px]"]')).toBeNull();
        expect(el.querySelector(".alloy-os-queue-row-card--selected")).not.toBeNull();
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

    it("accepts an onPrefetch handler and renders unchanged (hover/focus warm is opt-in)", () => {
        // The row wires the same warm handler to onPointerEnter (mouse) and onFocus (keyboard);
        // that the prop threads through and the row renders stably is type-checked + asserted
        // here. The warm-TARGET logic is proven directly in queueRowWarmTarget.test.ts (raw
        // jsdom can't synthesize React's delegated enter/focus events reliably).
        const model = row(fullContext());
        const el = render(<CondensedQueueRow row={model} onOpen={vi.fn()} onPrefetch={vi.fn()} />);
        expect(el.querySelector("button")).not.toBeNull();
        expect(el.textContent).toContain("Jordan Lee");
    });

    it("contact line wraps instead of truncating and exposes full text via title", () => {
        const longEmail = "rob.digan.with.a.very.long.email.address@example-childcare.org";
        const contactLine = `Rob Digan · (480) 484-4844 · ${longEmail}`;
        const ctx = fullContext();
        ctx.primary_contact = {
            display_name: "Rob Digan",
            phone: "4804844844",
            email: longEmail,
        };
        const rowConfig: CompactRowSlots = {
            ...GENERIC,
            contact: {
                visible: true,
                label: null,
                fieldKeys: ["person.primary_contact_name", "person.phone", "person.email"],
            },
        };
        const el = render(<CondensedQueueRow row={row(ctx)} rowConfig={rowConfig} onOpen={vi.fn()} />);
        const supporting = el.querySelector("[data-queue-row-supporting]");
        expect(supporting).not.toBeNull();
        expect(supporting?.textContent).toContain(longEmail);
        expect(supporting?.getAttribute("title")).toBe(contactLine);
        expect(supporting?.className).toContain("break-words");
        expect(supporting?.className).not.toContain("truncate");
    });
});
