import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import { cardCapabilities } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLifecycle";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";

const EMPTY_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null },
};

function ctx(truth: Record<string, unknown>): OperationalContext {
    return {
        subject: { type: "opportunity", id: "opp-1", label: "Johnson Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: EMPTY_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

const CHILD_MODEL: FocusPanelCardModel = {
    key: "children",
    archetype: "collection",
    title: "Children",
    insight: "—",
    tier: "context",
    span: 1,
    density: "standard",
    visible: true,
};

const TWO_CHILDREN = ctx({
    id: "opp-1",
    _inquiry_children: [
        { id: "c1", display_name: "Emma Johnson", dob: "2018-08-14", age: "6", desired_program_label: "Preschool" },
        { id: "c2", display_name: "Liam Johnson", dob: "2020-04-02", age: "4" },
    ],
});

const readSrc = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Children card — Universal Card Lifecycle wiring", () => {
    it("renders the Summary roster with avatars (initials fallback, no fabricated image)", () => {
        const html = renderToStaticMarkup(<ChildrenCard model={CHILD_MODEL} context={TWO_CHILDREN} />);
        expect(html).toContain('data-children-lifecycle="summary"');
        expect(html).toContain("Emma Johnson");
        expect(html).toContain("Liam Johnson");
        // Avatars render the initials fallback (no image source today).
        expect(html).toContain('data-card-avatar="initials"');
        expect(html).not.toContain('data-card-avatar="image"');
        // Summary offers the lifecycle entry point.
        expect(html).toContain('data-children-action="expand"');
    });

    it("empty state answers honestly", () => {
        const html = renderToStaticMarkup(<ChildrenCard model={CHILD_MODEL} context={ctx({ id: "opp-1", _inquiry_children: [] })} />);
        expect(html).toContain('data-children-lifecycle="empty"');
        expect(html).toContain("No children linked");
    });

    it("drives focus/edit/expanded affordances from the capability matrix", () => {
        const caps = cardCapabilities("children");
        expect(caps.supportsFocus).toBe(true);
        expect(caps.supportsInlineEdit).toBe(true);
        expect(caps.supportsExpanded).toBe(true);
        expect(caps.supportsWorkspace).toBe(false);
        const src = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(src).toContain("cardCapabilities(\"children\")");
        expect(src).toContain("CAPS.supportsInlineEdit"); // edit trigger gated on capability
        expect(src).toContain("CAPS.supportsExpanded"); // expand gated on capability
        expect(src).toContain('data-children-action="expand-evidence"'); // Expanded = more evidence
        expect(src).toContain("cardRelatedViews(\"children\")"); // Related Views drill-downs
        expect(src).toContain("data-related-view"); // related-report links
    });

    it("Expanded shows additional evidence groups (not history); history is a Related View", () => {
        const src = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        // Expanded renders configured evidence groups for the child.
        expect(src).toContain("ChildExpandedEvidence");
        expect(src).toContain('<EvidenceGroup title="Placement">');
        expect(src).toContain('<EvidenceGroup title="Medical">');
        expect(src).toContain('<EvidenceGroup title="Documents">');
        // History lives in a Related View report, not in Expanded.
        expect(src).toContain("ChildRelatedReport");
        expect(src).toContain("data-children-related-report");
        expect(src).toContain("placement_history");
    });

    it("Child inline edit is a READ-ONLY PREVIEW — never fakes persistence", () => {
        const src = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        // The edit surface is explicitly read-only with a clear notice.
        expect(src).toContain('data-children-edit-readonly="true"');
        expect(src).toContain("isn’t saveable yet");
        // No save adapter is wired into Children — no mutation prop or save call.
        expect(src).not.toContain("mutation:"); // not in the Props type
        expect(src).not.toContain("mutation."); // never invokes a mutation adapter
        expect(src).not.toContain("mutation?."); // nor optionally
        expect(src).not.toContain("savePersonContact");
        expect(src).not.toContain("onSave");
    });

    it("uses the shared CardAvatar (profile image with initials fallback)", () => {
        const src = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(src).toContain("import CardAvatar");
        expect(src).toContain("<CardAvatar");
    });
});

describe("Household card — row-level edit save path preserved", () => {
    it("still routes inline contact edits through the real mutation adapter", () => {
        const src = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
        expect(src).toContain("savePersonContact"); // real save path intact
        expect(src).toContain("data-household-edit-contact"); // per-row affordance intact
        expect(src).toContain("CardAvatar"); // identity rows carry avatars
    });
});
