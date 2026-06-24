/**
 * Layout Runtime Polish Sprint 1 — regression tests.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import { applyLayoutEditorFieldDisplayPresetToItem, PRIMARY_CONTACT_BADGE_FIELD_PRESET } from "@/lib/layout/layoutEditorFieldDisplayPresets";
import { applySectionRowLayout, segmentSectionsForRowLayout } from "@/lib/layout/layoutEditorSectionLayout";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { mergeCompositionSlotIntoFlowWhenRowGrouped } from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";
import { formatLayoutRuntimeDrawerHeaderPhone } from "@/lib/layout/runtime/formatLayoutRuntimeDrawerHeaderPhone";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";
import {
    LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY,
    LAYOUT_RUNTIME_PRIMARY_CONTACT_LABEL,
} from "@/lib/layout/runtime/layoutRuntimePrimaryContactField";
import {
    LAYOUT_RUNTIME_BODY_SECTION_SURFACE,
    LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
    LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { partitionLayoutRuntimeProfileCardMeta } from "@/lib/layout/runtime/partitionLayoutRuntimeProfileCardMeta";
import { resolvePersonDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolvePersonDrawerHeaderContext";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import type { LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";

describe("layout runtime polish sprint 1", () => {
    it("primary contact badge does not bleed person enrollment status", () => {
        const item = applyLayoutEditorFieldDisplayPresetToItem(
            { id: "f1", kind: "field", refKey: LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY },
            PRIMARY_CONTACT_BADGE_FIELD_PRESET,
        );
        expect(item.renderHint).toBe("badge");

        const resolved = resolveItemValue(
            {
                _status_display: "Pre-Enrolled",
                status_key: "pre_enrolled",
                [LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY]: LAYOUT_RUNTIME_PRIMARY_CONTACT_LABEL,
            },
            item,
        );
        expect(resolved.display).toBe(LAYOUT_RUNTIME_PRIMARY_CONTACT_LABEL);
        expect(resolved.display).not.toBe("Pre-Enrolled");
    });

    it("status renderHint only uses anchor status display for status refKeys", () => {
        const statusItem: LayoutItem = {
            id: "s1",
            kind: "field",
            refKey: "opportunity.status_key",
            renderHint: "status",
        };
        const primaryItem: LayoutItem = {
            id: "p1",
            kind: "field",
            refKey: LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY,
            renderHint: "status",
        };
        const record = {
            _status_display: "Pre-Enrolled",
            status_key: "pre_enrolled",
            [LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY]: "Not primary",
        };
        expect(resolveItemValue(record, statusItem).display).toBe("Pre-Enrolled");
        expect(resolveItemValue(record, primaryItem).display).toBe("Not primary");
    });

    it("does not vocabulary-format primary contact display labels", () => {
        expect(
            formatLayoutRuntimeStatusLabel("Primary contact", {
                refKey: LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY,
                renderHint: "badge",
            }),
        ).toBe("Primary contact");
    });

    it("formats drawer header phones consistently", () => {
        expect(formatLayoutRuntimeDrawerHeaderPhone("1213134321")).toBe("(121) 313-4321");
        const meta = resolvePersonDrawerCommandHeaderMeta({
            "person.primary_phone": "1213134321",
            "person.primary_email": "alex@example.com",
        });
        expect(meta.contactRow).toContain("(121) 313-4321");
    });

    it("peer section row cells stretch via shared layout engine classes", () => {
        expect(LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS).toContain("items-stretch");
        expect(LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS).toContain("h-full");
        expect(LAYOUT_RUNTIME_BODY_SECTION_SURFACE).toContain("h-full");
    });

    it("renders stacked column section groups in builder and runtime flow", () => {
        let doc = buildPersonDrawerDefaultDoc();
        const zoneSections = doc.sections.filter((section) => section.key !== "drawer_header");
        const anchor = zoneSections[0]?.key;
        const middle = zoneSections[1]?.key;
        const trailing = zoneSections[2]?.key;
        if (!anchor || !middle || !trailing) return;

        doc = applySectionRowLayout(doc, anchor, "half_stacked_right");
        const grouped = doc.sections.filter((section) => [anchor, middle, trailing].includes(section.key));
        const segments = segmentSectionsForRowLayout(grouped);
        expect(segments[0]?.kind).toBe("stacked_row");

        const html = renderToStaticMarkup(
            <LayoutEditorSectionFlowView
                sections={grouped}
                renderSection={(section: LayoutSection) => <div data-section-key={section.key}>Body</div>}
            />,
        );
        expect(html).toContain('data-layout-section-segment="stacked_row"');
        expect(html).toContain('data-layout-runtime-stack-role="primary"');
        expect(html).toContain('data-layout-runtime-stack-role="stack"');
    });

    it("partitions child profile meta into headline and detail tiers", () => {
        const { headline, details } = partitionLayoutRuntimeProfileCardMeta([
            { refKey: "child.date_of_birth", label: "DOB" },
            { refKey: "child.age_band", label: "Age" },
            { refKey: "child.status", label: "Status", renderHint: "status" },
            { refKey: "child.program", label: "Program" },
            { refKey: "child.room", label: "Room" },
        ]);
        expect(headline.map((c) => c.refKey)).toEqual(
            expect.arrayContaining(["child.age_band", "child.status"]),
        );
        expect(details.map((c) => c.refKey)).toEqual(
            expect.arrayContaining(["child.date_of_birth", "child.room"]),
        );
    });

    it("merges composition slots into section flow when row-grouped with overflow", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const groupId = "section_row_test_group";
        const patched = {
            ...doc,
            sections: doc.sections.map((section) => {
                if (section.key !== "contact_information" && section.key !== "notes_communication") return section;
                return {
                    ...section,
                    metadata: {
                        ...section.metadata,
                        layoutEditorSectionRowGroup: groupId,
                    },
                };
            }),
        };
        const contact = patched.sections.find((section) => section.key === "contact_information") ?? null;
        const overflowPeer = patched.sections.find((section) => section.key === "notes_communication") ?? null;
        const { slotStandalone, flowSections } = mergeCompositionSlotIntoFlowWhenRowGrouped(
            patched,
            contact,
            overflowPeer ? [overflowPeer] : [],
        );
        expect(slotStandalone).toBeNull();
        expect(flowSections.map((section) => section.key)).toContain("contact_information");
    });

    it("primary contact resolves from household relationship on person runtime record", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({
            personId: "person-1",
            vmRecord: {
                id: "person-1",
                _customer_persons: [{ person_id: "person-1", is_household_primary_contact: true }],
            },
        });
        expect(record[LAYOUT_RUNTIME_PRIMARY_CONTACT_REF_KEY]).toBe(LAYOUT_RUNTIME_PRIMARY_CONTACT_LABEL);
    });
});
