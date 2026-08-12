/**
 * Experience Builder field authoring — Sprint 5.18E tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { EXPERIENCE_BUILDER_COMMON_FIELD_REF_KEYS } from "@/lib/layout/layoutBuilderFieldAuthoring";
import {
    applyDisplayConfigToItemPatch,
    LAYOUT_LINK_BEHAVIORS_EDITOR,
    LAYOUT_LINK_BEHAVIOR_LABELS,
    LAYOUT_TYPOGRAPHY_INTENT_LABELS,
    typographyIntentClass,
} from "@/lib/layout/layoutEditorDisplayConfig";
import { addSectionFieldItem } from "@/lib/layout/layoutEditorSectionComposition";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { patchLayoutEditorFieldDisplay } from "@/lib/layout/layoutEditorCompositionModel";
import { renameSectionTitle } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import type { LayoutItem } from "@/lib/layout/layoutV2";

describe("layoutBuilderFieldAuthoring", () => {
    it("exposes MVP link behavior options with operator-friendly labels", () => {
        // `open_drawer` is NOT offered: the record overlay it named is deleted. The value stays in
        // the storage union so published tenant layouts keep parsing — configuration data is not
        // ours to rewrite — but authoring it would author a destination that cannot exist.
        expect(LAYOUT_LINK_BEHAVIORS_EDITOR).toEqual(["none", "open_record", "mailto", "tel"]);
        expect(LAYOUT_LINK_BEHAVIORS_EDITOR).not.toContain("open_drawer");
        expect(LAYOUT_LINK_BEHAVIOR_LABELS.open_record).toBe("Link to record");
        expect(LAYOUT_LINK_BEHAVIOR_LABELS.mailto).toBe("Email");
        expect(LAYOUT_LINK_BEHAVIOR_LABELS.tel).toBe("Call phone number");
    });

    it("maps typography intents to runtime classes", () => {
        expect(typographyIntentClass("primary")).toContain("font-medium");
        expect(typographyIntentClass("secondary")).toContain("text-sm");
        expect(LAYOUT_TYPOGRAPHY_INTENT_LABELS.caption).toBe("Small");
    });

    it("an already-authored open_drawer link behaviour still resolves its adornment", () => {
        const item: LayoutItem = {
            id: "f1",
            kind: "field",
            refKey: "person.primary_email",
            label: "Email",
        };
        const patch = applyDisplayConfigToItemPatch(item, { linkBehavior: "open_drawer" });
        expect(patch.adornment?.action?.type).toBe("open_drawer");
        expect(patch.adornment?.action?.entity).toBe("person");
    });

    it("preserves spaced card titles across rename paths", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const sectionKey = doc.sections[0]!.key;
        const titled = renameSectionTitle(doc, sectionKey, "Primary Contact");
        expect(titled.sections.find((s) => s.key === sectionKey)?.title).toBe("Primary Contact");
    });

    it("preserves spaced custom field labels when patching display", () => {
        const created = createExperienceBuilderCard(buildLeadDrawerDefaultDoc(), {
            title: "Primary Contact",
            widthKey: "third",
            cardType: "fields",
        });
        const field = buildOpportunityDrawerEditorFieldPickerGroups()
            .flatMap((g) => g.fields)
            .find((f) => f.refKey === "person.primary_email");
        expect(field).toBeTruthy();
        const added = addSectionFieldItem(created.doc, created.sectionKey, 0, 0, field!);
        expect(added.ok).toBe(true);
        if (!added.ok) return;
        const next = patchLayoutEditorFieldDisplay(
            added.doc,
            { kind: "field", sectionKey: created.sectionKey, itemId: added.itemId },
            {},
            "Primary Contact Email",
        );
        const updated = next.sections
            .find((s) => s.key === created.sectionKey)!
            .rows[0]!
            .columns[0]!
            .items.find((it) => it.id === added.itemId)!;
        expect(updated.label).toBe("Primary Contact Email");
    });

    it("includes representative child preview sample values for related lists", () => {
        const child = (LAYOUT_DRAWER_PREVIEW_RECORD.children as Record<string, string>[])[0]!;
        expect(child["child.name"]).toBe("Avery Johnson");
        expect(child["child.age"]).toBe("4");
        expect(child["child.program"]).toBe("Preschool");
        expect(child["inquiry_child.start_date"]).toBe("2026-08-19");
    });

    it("lists common quick-pick field ref keys", () => {
        expect(EXPERIENCE_BUILDER_COMMON_FIELD_REF_KEYS).toContain("person.primary_contact_name");
        expect(EXPERIENCE_BUILDER_COMMON_FIELD_REF_KEYS).toContain("child.age");
    });
});
