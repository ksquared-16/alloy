/** @vitest-environment jsdom */

/**
 * Phase 3 — Subject Focus wiring. The SAME CondensedQueueRow emphasizes a different subject based on
 * the resolved variant's subjectFocus, feeding the existing slots. Fallback (no focus) preserves the
 * current frozen-context behavior. No new renderer, no persistence change.
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { CondensedQueueRow } from "@/components/presentation/workUnit/CondensedQueueRow";
import { resolveQueueRowSubjectFocus } from "@/lib/presentation/runtime/resolveQueueRowSubjectFocus";
import { resolveQueueRowPresentation } from "@/lib/presentation/runtime/queueRowVariantResolve";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import type {
    QueueRowContext,
    RelatedSubjectSummary,
} from "@/lib/workUnits/lifecycleSubjectContracts";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function sibling(id: string, name: string): RelatedSubjectSummary {
    return { subject_type: "child", subject_id: id, display_name: name, status_label: "Waitlisted" };
}

function ctx(over: Partial<QueueRowContext>): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Smith Household" },
        case_context: {
            case_id: "opp-1",
            display_name: "Smith Household",
            case_type_label: "Enrollment Case",
            case_status_key: "open",
            case_status_label: "Active",
        },
        primary_contact: { display_name: "Sarah Smith" },
        related_subjects_summary: [],
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "New Lead",
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
        ...over,
    } as QueueRowContext;
}

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
function render(node: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(node));
}
afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    if (container) container.remove();
    container = null;
});
const txt = (sel: string) => container!.querySelector(sel)?.textContent?.trim();

function rowModel(context: QueueRowContext): QueueRowModel {
    return { context, entityType: "opportunity", entityId: "opp-1" };
}

describe("resolveQueueRowPresentation — focus only from an explicit variant subjectFocus", () => {
    const statusCol = {
        id: "c", label: "", width: "status_band" as const, scope: { type: "lifecycle_context" as const },
        blocks: [{ type: "field_group" as const, id: "g", fields: [{ id: "f", fieldKey: "opportunity.status_label", label: "S", display: "pill" as const }] }],
    };
    const base: QueueRecordLayoutConfigV3 = {
        variant: "operational-row", version: 3, columns: [statusCol],
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
    };
    const candidate = ctx({ row_subject: { subject_type: "candidate", subject_id: "pc1", display_name: "Ava" } });

    it("returns focus when the matched variant declares subjectFocus", () => {
        const cfg = { ...base, variants: [{ id: "wl", label: "WL", priority: 10, appliesWhen: { grain: ["candidate" as const] }, subjectFocus: "placement_candidate_child", columns: [statusCol] }] };
        const { focus } = resolveQueueRowPresentation(cfg, candidate, { grain: "candidate" });
        expect(focus?.focus).toBe("placement_candidate_child");
        expect(focus?.primary.subject_type).toBe("candidate");
    });

    it("focus is null when the matched variant has NO subjectFocus (graceful fallback)", () => {
        const cfg = { ...base, variants: [{ id: "wl", label: "WL", priority: 10, appliesWhen: { grain: ["candidate" as const] }, columns: [statusCol] }] };
        const { focus } = resolveQueueRowPresentation(cfg, candidate, { grain: "candidate" });
        expect(focus).toBeNull();
    });
});

describe("CondensedQueueRow — Subject Focus rendering", () => {
    it("family/case grain (household) highlights the household; children as group context", () => {
        const context = ctx({ related_subjects_summary: [sibling("c1", "Ava"), sibling("c2", "Ben")] });
        render(<CondensedQueueRow row={rowModel(context)} focus={resolveQueueRowSubjectFocus(context, "household")} onOpen={() => {}} />);
        expect(txt("[data-queue-row-subject]")).toBe("Smith Household");
        expect(txt("[data-queue-row-supporting]")).toBe("Sarah Smith");
        expect(txt("[data-queue-row-count]")).toBe("Ava, Ben");
    });

    it("child grain (active_child) highlights the child; household+parent support; sibling summary", () => {
        const context = ctx({
            row_subject: { subject_type: "child", subject_id: "c1", display_name: "Ava" },
            related_subjects_summary: [sibling("c1", "Ava"), sibling("c2", "Ben")],
        });
        render(<CondensedQueueRow row={rowModel(context)} focus={resolveQueueRowSubjectFocus(context, "active_child")} onOpen={() => {}} />);
        expect(txt("[data-queue-row-subject]")).toBe("Ava");
        expect(txt("[data-queue-row-supporting]")).toBe("Smith Household · Sarah Smith");
        expect(txt("[data-queue-row-count]")).toBe("Ben"); // excludes the active child
    });

    it("waitlist/candidate grain highlights the candidate; siblings COUNT only", () => {
        const context = ctx({
            row_subject: { subject_type: "candidate", subject_id: "pc1", display_name: "Ava" },
            related_subjects_summary: [sibling("c2", "Ben")],
        });
        render(<CondensedQueueRow row={rowModel(context)} focus={resolveQueueRowSubjectFocus(context, "placement_candidate_child")} onOpen={() => {}} />);
        expect(txt("[data-queue-row-subject]")).toBe("Ava");
        expect(txt("[data-queue-row-count]")).toBe("1 child"); // count only, no names
    });

    it("no focus → frozen-context behavior unchanged (fallback)", () => {
        const context = ctx({});
        render(<CondensedQueueRow row={rowModel(context)} onOpen={() => {}} />);
        expect(txt("[data-queue-row-subject]")).toBe("Smith Household");
        expect(txt("[data-queue-row-supporting]")).toBe("Sarah Smith");
    });
});
