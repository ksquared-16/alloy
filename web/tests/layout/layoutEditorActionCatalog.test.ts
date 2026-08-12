import { describe, expect, it } from "vitest";

import { MAKE_PRIMARY_CONTACT_ACTION_KEY } from "@/lib/admin/actions/makePrimaryContactAction";
import {
    buildLayoutEditorActionCatalogGroups,
    isLayoutEditorActionRuntimeWired,
    layoutEditorActionButtonConfigFromCatalogEntry,
    layoutEditorActionCatalogEntryForKey,
    layoutEditorRowTemplateActionKeys,
    makeLayoutEditorActionButtonFromCatalogEntry,
    resolveLayoutEditorActionFriendlyLabel,
} from "@/lib/layout/layoutEditorActionCatalog";
import { readLayoutEditorActionButtonConfig } from "@/lib/layout/layoutEditorActionButton";
import {
    applyLayoutEditorFieldDisplayPresetToItem,
    layoutEditorFieldDisplayPresetToCatalogField,
    PRIMARY_CONTACT_BADGE_FIELD_PRESET,
} from "@/lib/layout/layoutEditorFieldDisplayPresets";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    addSectionActionButtonCatalogEntry,
    addSectionFieldDisplayPresetItem,
} from "@/lib/layout/layoutEditorSectionComposition";
import { visibilityConditionForRule } from "@/lib/layout/layoutEditorVisibilityRules";
import { LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS } from "@/lib/layout/layoutEditorContactRoles";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("layout editor action catalog", () => {
    it("groups Make Primary Contact under Relationship Actions for opportunity drawer", () => {
        const groups = buildLayoutEditorActionCatalogGroups({
            surfaceKey: "opportunity_drawer",
            context: "contact_block",
        });
        const relationshipGroup = groups.find((g) => g.groupKey === "relationship_actions");
        expect(relationshipGroup?.actions.some((a) => a.actionKey === MAKE_PRIMARY_CONTACT_ACTION_KEY)).toBe(true);
        expect(relationshipGroup?.actions.find((a) => a.actionKey === MAKE_PRIMARY_CONTACT_ACTION_KEY)?.label).toBe(
            "Make Primary Contact",
        );
    });

    it("selecting Make Primary Contact creates valid _action_button with default visibility", () => {
        const entry = layoutEditorActionCatalogEntryForKey(MAKE_PRIMARY_CONTACT_ACTION_KEY);
        expect(entry).not.toBeNull();
        const item = makeLayoutEditorActionButtonFromCatalogEntry(entry!);
        expect(item.refKey).toBe("_action_button");
        const cfg = readLayoutEditorActionButtonConfig(item.metadata);
        expect(cfg?.actionKey).toBe(MAKE_PRIMARY_CONTACT_ACTION_KEY);
        expect(cfg?.label).toBe("Make Primary Contact");
        expect(item.visibleWhen).toEqual(
            visibilityConditionForRule("show_when_not_primary", "_action_button"),
        );
        expect(item.visibleWhen?.path).toBe(LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.isNotPrimary);
    });

    it("addSectionActionButtonCatalogEntry inserts catalog action into layout doc", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const sectionKey = "household_contact";
        const result = addSectionActionButtonCatalogEntry(
            doc,
            sectionKey,
            0,
            1,
            layoutEditorActionCatalogEntryForKey(MAKE_PRIMARY_CONTACT_ACTION_KEY)!,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const item = result.doc.sections.find((s) => s.key === sectionKey)?.rows[0]?.columns[1]?.items.find(
            (it) => it.id === result.itemId,
        );
        expect(item?.refKey).toBe("_action_button");
        expect(readLayoutEditorActionButtonConfig(item?.metadata)?.actionKey).toBe(MAKE_PRIMARY_CONTACT_ACTION_KEY);
    });

    it("resolveLayoutEditorActionFriendlyLabel hides raw action keys", () => {
        expect(resolveLayoutEditorActionFriendlyLabel(MAKE_PRIMARY_CONTACT_ACTION_KEY)).toBe("Make Primary Contact");
        expect(resolveLayoutEditorActionFriendlyLabel("open_drawer")).toBe("Open record (retired)");
    });

    it("make_primary_contact is runtime wired", () => {
        expect(isLayoutEditorActionRuntimeWired(MAKE_PRIMARY_CONTACT_ACTION_KEY)).toBe(true);
        expect(isLayoutEditorActionRuntimeWired("open_drawer")).toBe(false);
    });

    it("primary contact badge preset uses friendly picker label and badge display", () => {
        const catalogField = layoutEditorFieldDisplayPresetToCatalogField(PRIMARY_CONTACT_BADGE_FIELD_PRESET);
        expect(catalogField.fieldLabel).toBe("Primary contact badge");
        const item = applyLayoutEditorFieldDisplayPresetToItem(
            { id: "x", kind: "field", refKey: "person.is_primary_contact", label: "Primary contact", renderHint: "text" },
            PRIMARY_CONTACT_BADGE_FIELD_PRESET,
        );
        expect(item.renderHint).toBe("status");
        expect(item.editable).toBe(false);
        expect(item.metadata?.layoutEditorDisplay).toMatchObject({
            displayType: "badge",
            statusFormat: "badge",
        });
    });

    it("addSectionFieldDisplayPresetItem adds primary badge field to layout", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = addSectionFieldDisplayPresetItem(doc, "household_contact", 0, 1, PRIMARY_CONTACT_BADGE_FIELD_PRESET);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const item = result.doc.sections.find((s) => s.key === "household_contact")?.rows[0]?.columns[1]?.items.find(
            (it) => it.id === result.itemId,
        );
        expect(item?.refKey).toBe("person.is_primary_contact");
        expect(item?.label).toBe("Primary contact");
    });

    it("row template action keys expose make_primary_contact as a relationship row action", () => {
        // Make Primary Contact is a configurable row/relationship action (not a field/badge),
        // so operators can place it on contact / household-member related lists.
        expect(layoutEditorRowTemplateActionKeys()).toContain("make_primary_contact");
        expect(layoutEditorRowTemplateActionKeys()).toContain("edit_enrollment");
    });

    it("layoutEditorActionButtonConfigFromCatalogEntry includes default visibility", () => {
        const config = layoutEditorActionButtonConfigFromCatalogEntry(
            layoutEditorActionCatalogEntryForKey(MAKE_PRIMARY_CONTACT_ACTION_KEY)!,
        );
        expect(config.defaultVisibility).toBe("show_when_not_primary");
        expect(config.label).toBe("Make Primary Contact");
    });

    it("runtime routes relationship actions through LayoutRuntimeRelationshipActionButton", () => {
        const planView = readFileSync(
            join(process.cwd(), "components/layout/LayoutRuntimePlanView.tsx"),
            "utf8",
        );
        expect(planView).toContain("LayoutRuntimeRelationshipActionButton");
        expect(planView).toContain("isRelationshipActionKey");
    });
});
