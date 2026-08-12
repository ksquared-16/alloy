import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    moveFieldInNestedGroup,
    removeFieldFromNestedGroup,
    reconcileNestedSurfaceConfig,
    setFieldVisibilityInNestedGroup,
    setFieldPresentationLabel,
    setNestedGroupEnabled,
    selectedFieldKeys,
    isNestedGroupEnabled,
    isOptionalNestedGroup,
    isEvidenceSection,
    enabledEvidenceSections,
    isDomainLockedGroup,
    nestedGroupLabel,
    CHILDREN_SURFACE_ID,
    FINANCIAL_CONFIG_SURFACE_ID,
    fieldPresentationLabel,
    availableFieldsForNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    platformSectionOptions,
    evidenceSectionOptions,
    sectionSemanticForGroup,
    CUSTOM_SECTION_OPTION,
} from "@/lib/adminV2/settings/surfaces/sectionCatalog";
import { sortByNestedSectionOrder, moveSectionInNestedConfig, HOUSEHOLD_DEFAULT_SECTION_ORDER } from "@/lib/adminV2/settings/surfaces/nestedSurfaceSectionOrder";
import {
    CHILDREN_FOCUS_GROUP_KEYS,
    childrenEvidenceSectionsFromNestedConfig,
    childrenFocusRowsFromNestedConfig,
    childrenRosterCollapsedFieldKeysFromNestedConfig,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { defaultNavigationTarget, resolveNavigationTarget } from "@/lib/adminV2/settings/surfaces/nestedSurfaceNavigation";
import { composedChildDisplayName } from "@/lib/adminV2/runtime/focusPanel/children/childIdentityCompose";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { householdGroupFieldKeys } from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";
import { renderContactFields } from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import { householdContactPatch } from "@/lib/adminV2/runtime/focusPanel/household/householdContactEditState";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
function readSrc(rel: string): string {
    return readFileSync(resolve(repoRoot, rel), "utf8");
}

function demoContext() {
    const { vm, record } = buildDemoFocusPanelSummaryViewModel();
    return buildOperationalContext({
        subjectId: String(vm.entity.id),
        title: vm.header.title,
        subjectVm: vm,
        truth: record,
        perspective: null,
        statusLabel: "Tour scheduled",
        canMutate: false,
    });
}

describe("Focus Panel drill-in composition model", () => {
    it("registers household_surface with emergency contact as optional section", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        expect(isNestedGroupEnabled(config, "primary_contact")).toBe(true);
        expect(isNestedGroupEnabled(config, "emergency_contacts")).toBe(false);
        expect(selectedFieldKeys(config, "primary_contact")).toContain("person.phone");
    });

    it("adds emergency contact section and configures fields", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setNestedGroupEnabled(config, "emergency_contacts", true);
        config = addFieldToNestedGroup(config, "emergency_contacts", "person.email");
        expect(isNestedGroupEnabled(config, "emergency_contacts")).toBe(true);
        expect(selectedFieldKeys(config, "emergency_contacts")).toContain("person.email");
    });

    it("reorders household primary contact phone before email", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = removeFieldFromNestedGroup(config, "primary_contact", "person.email");
        config = addFieldToNestedGroup(config, "primary_contact", "person.email");
        const keys = selectedFieldKeys(config, "primary_contact");
        expect(keys.indexOf("person.phone")).toBeLessThan(keys.indexOf("person.email"));
    });

    it("sets contact edit field to read-only and excludes from save patch", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "contact.email", "read-only");
        const patch = householdContactPatch(
            { first_name: "A", last_name: "B", email: "new@example.com", phone: "555" },
            { first_name: "A", last_name: "B", email: "old@example.com", phone: "555" },
            new Set(["first_name", "last_name", "phone"]),
        );
        expect(patch.email).toBeUndefined();
    });

    it("hides fields from runtime when behavior is hidden", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "primary_contact", "person.email", "hidden");
        const keys = householdGroupFieldKeys(config, "primary_contact");
        expect(keys).not.toContain("person.email");
        expect(fieldShouldRender("hidden")).toBe(false);
    });

    it("stores presentation labels separate from schema keys", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldPresentationLabel(config, "children", "child.name", "Student");
        expect(fieldPresentationLabel(config, "children", "child.name", "Child Name")).toBe("Student");
    });

    it("runtime household consumes published group field keys for contact phone/email", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.phone");
        config = addFieldToNestedGroup(config, "primary_contact", "person.email");
        const evidence = buildHouseholdCardEvidence(demoContext(), { nestedConfig: config });
        const primary = evidence.primaryContact!;
        const fields = renderContactFields(primary, householdGroupFieldKeys(config, "primary_contact"), {
            masked: false,
        });
        expect(fields.some((f) => f.key === "person.phone")).toBe(true);
        expect(fields.some((f) => f.key === "person.email")).toBe(true);
    });

    it("shows child DOB/age when configured on household children group", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = moveFieldInNestedGroup(config, "children", "child.name", 0);
        config = addFieldToNestedGroup(config, "children", "child.dob_age");
        const keys = selectedFieldKeys(config, "children");
        expect(keys).toContain("child.dob_age");
    });

    it("marks children evidence sections as configurable (not domain-locked)", () => {
        expect(isDomainLockedGroup(CHILDREN_SURFACE_ID, "medical")).toBe(false);
        expect(isDomainLockedGroup(CHILDREN_SURFACE_ID, "documents")).toBe(false);
        expect(isEvidenceSection(CHILDREN_SURFACE_ID, "medical")).toBe(true);
        expect(evidenceSectionOptions(CHILDREN_SURFACE_ID).length).toBeGreaterThan(0);
    });

    it("marks billing periods and line items as domain-locked", () => {
        expect(isDomainLockedGroup(FINANCIAL_CONFIG_SURFACE_ID, "billing_periods")).toBe(true);
        expect(isDomainLockedGroup(FINANCIAL_CONFIG_SURFACE_ID, "line_items")).toBe(true);
    });

    it("reorders household sections via moveSectionInNestedConfig", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setNestedGroupEnabled(config, "emergency_contacts", true);
        const childrenIdx = config.groups.findIndex((g) => g.key === "children");
        const emergencyIdx = config.groups.findIndex((g) => g.key === "emergency_contacts");
        config = moveSectionInNestedConfig(config, "children", emergencyIdx - childrenIdx);
        const after = config.groups.map((g) => g.key);
        expect(after.indexOf("children")).toBeLessThan(after.indexOf("emergency_contacts"));
        expect(after[0]).toBe("primary_contact");
    });
});

describe("Add Field commits to the working composer config (state-update bug)", () => {
    // The composer reads config via `configFor` (= reconcile(stored)) and writes via
    // `updateConfig` (= store reconcile(next)). This simulates the full add → persist →
    // reopen loop so a reconcile that silently wipes newly added fields would fail here.
    const configFor = (surfaceId: string, stored: NestedSurfaceConfig | null) =>
        reconcileNestedSurfaceConfig(surfaceId, stored);
    const addFieldThroughComposer = (
        surfaceId: string,
        groupKey: string,
        fieldKey: string,
        stored: NestedSurfaceConfig | null,
    ): NestedSurfaceConfig => {
        const working = configFor(surfaceId, stored);
        // updateConfig(surfaceId, addFieldToNestedGroup(working, ...)) stores a reconcile.
        return reconcileNestedSurfaceConfig(surfaceId, addFieldToNestedGroup(working, groupKey, fieldKey));
    };

    it("adds a field to a Household group and it survives reopen (reconcile)", () => {
        const initial = configFor(HOUSEHOLD_SURFACE_ID, null);
        const available = availableFieldsForNestedGroup(HOUSEHOLD_SURFACE_ID, "primary_contact", initial, []);
        expect(available.length).toBeGreaterThan(0);
        const fieldKey = available[0]!.key;

        const stored = addFieldThroughComposer(HOUSEHOLD_SURFACE_ID, "primary_contact", fieldKey, null);
        expect(selectedFieldKeys(stored, "primary_contact")).toContain(fieldKey);

        // Reopening the composer re-reads through configFor — the field must persist.
        const reopened = configFor(HOUSEHOLD_SURFACE_ID, stored);
        expect(selectedFieldKeys(reopened, "primary_contact")).toContain(fieldKey);
    });

    it("adds a field to a Children focus group and it appears in focus rows", () => {
        const initial = configFor(CHILDREN_SURFACE_ID, null);
        const available = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "identity", initial, []);
        expect(available.length).toBeGreaterThan(0);
        const fieldKey = available[0]!.key;

        const stored = addFieldThroughComposer(CHILDREN_SURFACE_ID, "identity", fieldKey, null);
        const reopened = configFor(CHILDREN_SURFACE_ID, stored);
        expect(selectedFieldKeys(reopened, "identity")).toContain(fieldKey);

        const focusRows = childrenFocusRowsFromNestedConfig(reopened);
        expect(focusRows.some((row) => row.groupKey === "identity" && row.fieldKey === fieldKey)).toBe(true);
    });

    it("adds a field to a Children evidence section and it appears in that section", () => {
        let stored = configFor(CHILDREN_SURFACE_ID, null);
        stored = reconcileNestedSurfaceConfig(
            CHILDREN_SURFACE_ID,
            setNestedGroupEnabled(stored, "medical", true, { sectionSemantic: "medical" }),
        );
        const available = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "medical", stored, []);
        expect(available.length).toBeGreaterThan(0);
        const fieldKey = available[0]!.key;

        stored = addFieldThroughComposer(CHILDREN_SURFACE_ID, "medical", fieldKey, stored);
        const reopened = configFor(CHILDREN_SURFACE_ID, stored);

        const sections = childrenEvidenceSectionsFromNestedConfig(reopened);
        const medical = sections.find((section) => section.key === "medical");
        expect(medical?.fieldKeys).toContain(fieldKey);
    });
});

describe("Add Field / centered drill-in composer wiring", () => {
    const popover = readSrc("components/admin/focusPanel/drillIn/ComposerFloatingPopover.tsx");
    const canvas = readSrc("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
    const runtimeCss = readSrc("app/adminV2/components/alloyOsRuntime.css");

    it("keeps the Add Field popover open when clicking its own (portaled) items", () => {
        // The portaled popover content is not inside the anchor — the outside-click guard
        // must also skip clicks inside the content, or the selection never commits.
        expect(popover).toContain("contentRef");
        expect(popover).toContain("contentRef.current?.contains(target)");
        expect(popover).toContain("ref={contentRef}");
    });

    it("centers the drill-in by resetting composer canvas scroll on elevation", () => {
        expect(canvas).toContain("useLayoutEffect");
        expect(canvas).toContain("body.scrollTop = 0");
        expect(canvas).toContain("resolveElevatedCellKey");
        expect(canvas).toContain("data-fp-composer-depth-active");
    });

    it("top-pins the elevated drill-in inside the visible composer body", () => {
        expect(runtimeCss).toContain(".alloy-os-fp-composer__body");
        expect(runtimeCss).toContain("top: 12px");
        expect(runtimeCss).toContain("transform: none");
        expect(runtimeCss).toContain("max-height: min(75vh, calc(100% - 24px), calc(100dvh - 120px))");
        expect(runtimeCss).not.toContain("max-height: min(calc(100% - 44px)");
        // Grid is static only inside the composer body — re-parents abspos to the viewport.
        expect(runtimeCss).toMatch(
            /\[data-fp-composer-depth-active="true"\][\s\S]*\.alloy-os-fp-composer__body[\s\S]*position: static/,
        );
        // Composer shell must not trap abspos on the elevated card.
        expect(runtimeCss).toMatch(
            /\[data-fp-composer-depth-active="true"\][\s\S]*\.alloy-os-fp-composer-cell[\s\S]*position: static/,
        );
    });
});

describe("Surface Composer V3 — Add Section flow", () => {
    it("offers platform-defined sections with stable semantic identities", () => {
        const options = platformSectionOptions(HOUSEHOLD_SURFACE_ID);
        const groups = options.map((o) => o.groupKey);
        expect(groups).toEqual(
            expect.arrayContaining([
                "emergency_contacts",
                "authorized_pickups",
                "billing_contact",
                "emergency_medical",
                "custom_notes",
            ]),
        );
        expect(sectionSemanticForGroup(HOUSEHOLD_SURFACE_ID, "emergency_contacts")).toBe("emergency_contact");
        expect(sectionSemanticForGroup(HOUSEHOLD_SURFACE_ID, "authorized_pickups")).toBe("authorized_pickup");
    });

    it("provides one custom-section escape hatch with a stable custom semantic", () => {
        expect(CUSTOM_SECTION_OPTION.custom).toBe(true);
        expect(CUSTOM_SECTION_OPTION.semantic).toBe("custom");
    });

    it("registers the new optional household sections (hidden by default)", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        for (const key of ["authorized_pickups", "billing_contact", "emergency_medical", "custom_notes"]) {
            expect(isOptionalNestedGroup(HOUSEHOLD_SURFACE_ID, key)).toBe(true);
            expect(isNestedGroupEnabled(config, key)).toBe(false);
        }
    });

    it("preserves section semantic + custom label when adding a section", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setNestedGroupEnabled(config, "custom_notes", true, {
            sectionSemantic: "custom",
            sectionLabel: "Field Trip Consent",
        });
        expect(isNestedGroupEnabled(config, "custom_notes")).toBe(true);
        const group = config.groups.find((g) => g.key === "custom_notes");
        expect(group?.sectionSemantic).toBe("custom");
        expect(nestedGroupLabel(config, "custom_notes")).toBe("Field Trip Consent");
    });

    it("enables evidence sections on children surface", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setNestedGroupEnabled(config, "documents", true, { sectionSemantic: "documents" });
        config = setNestedGroupEnabled(config, "medical", true, { sectionSemantic: "medical" });
        const enabled = enabledEvidenceSections(config);
        expect(enabled.map((g) => g.key)).toEqual(expect.arrayContaining(["documents", "medical"]));
    });

    it("resolves default nested surface navigation links", () => {
        expect(defaultNavigationTarget(HOUSEHOLD_SURFACE_ID, "children")?.surfaceId).toBe(CHILDREN_SURFACE_ID);
        expect(resolveNavigationTarget(CHILDREN_SURFACE_ID, "documents", undefined)?.depth).toBe("child-documents");
    });

    it("sorts household runtime groups by canonical section order", () => {
        const sorted = sortByNestedSectionOrder(
            [
                { key: "children" },
                { key: "household_members" },
                { key: "other_parent_guardian" },
                { key: "primary_contact" },
            ],
            null,
            HOUSEHOLD_DEFAULT_SECTION_ORDER,
        );
        expect(sorted.map((g) => g.key)).toEqual([
            "primary_contact",
            "other_parent_guardian",
            "household_members",
            "children",
        ]);
    });

    it("composes child display name from identity fields", () => {
        const name = composedChildDisplayName(
            {
                id: "1",
                name: "Alex Smith",
                firstName: "Alex",
                lastName: "Smith",
                preferredName: "Lex",
                nickname: null,
                dob: null,
                age: null,
                initial: "A",
                imageUrl: null,
                dobAge: null,
                program: null,
                room: null,
                schedule: null,
                teacher: null,
                startDate: null,
                status: null,
                statusTone: "neutral",
                needsAttention: false,
                detailLine: null,
                missingLine: null,
                flags: [],
            },
            defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID),
        );
        expect(name).toBe("Lex");
    });
});

describe("Focus Panel in-canvas drill-in composer wiring", () => {
    const page = readSrc("components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx");
    const editor = readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");
    const canvas = readSrc("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
    const householdCard = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
    const drillInspector = readSrc("components/admin/focusPanel/drillIn/FocusPanelDrillInInspector.tsx");
    const cardInspector = readSrc("components/admin/focusPanel/FocusPanelCardInspector.tsx");

    it("keeps drill-in composition inside the Focus Panel canvas (no separate page editor)", () => {
        expect(page).toContain("FocusPanelSummarySurfaceEditor");
        expect(page).not.toContain("FocusPanelDrillInSurfaceComposer");
        expect(editor).toContain("FocusPanelComposerProvider");
        expect(editor).toContain("FocusPanelDrillInInspector");
        expect(canvas).toContain("onEnterDrillIn");
        expect(canvas).toContain("composer.enterDrillIn");
        expect(canvas).toContain("data-fp-composer-edit-mode");
    });

    it("mounts shared identity builder inspector for household and children drill-in", () => {
        expect(householdCard).toContain("IdentityComposeSectionCanvas");
        expect(householdCard).toContain("IdentityRecordSummary");
        expect(drillInspector).toContain("IdentitySurfaceBuilderInspector");
        expect(drillInspector).toContain('data-focus-panel-drill-in-mode={identitySurface ? "identity-builder" : "metadata"}');
        expect(drillInspector).toContain("metadataOnly");
        expect(cardInspector).toContain("metadataOnly");
    });

    it("Configure opens in-place drill-in via requestFocus, not route change", () => {
        expect(canvas).toContain("onEnterDrillIn?.()");
        expect(canvas).toContain("requestFocus(typeKey, null)");
        expect(canvas).not.toContain("onOpenNestedSurface");
    });

    it("removes blue-gray builder background from Focus Panel editor", () => {
        expect(editor).toContain("bg-white");
        expect(editor).not.toContain("#EEF2F8");
    });

    it("household card wraps runtime regions with composable shells", () => {
        expect(householdCard).toContain("ComposableRegionShell");
        expect(householdCard).toContain("IdentityComposeSectionCanvas");
        expect(householdCard).not.toContain("function RegionEditLayer");
        expect(householdCard).not.toContain("RegionInlineCompose");
        expect(householdCard).not.toContain("Edit fields below");
    });

    it("queue row builder remains untouched", () => {
        const queueRow = readSrc("components/adminV2/settings/surfaces/QueueRowSurfaceEditor.tsx");
        expect(queueRow).toContain("QueueRowBuilderV2");
        expect(queueRow).not.toContain("ComposableRegionShell");
    });

    it("household card uses the Add Section menu (not a single hardcoded button)", () => {
        expect(householdCard).toContain("AddSectionMenu");
        expect(householdCard).toContain("InlineSectionControls");
        expect(householdCard).not.toContain('data-add-section="emergency_contacts"');
    });

    it("composer exposes Edit Mode via isEditMode", () => {
        expect(readSrc("lib/adminV2/settings/surfaces/focusPanelComposerContext.tsx")).toContain("isEditMode");
    });

    it("runtime composer canvas uses FocusPanelCardRenderer (single render path)", () => {
        expect(canvas).toContain("FocusPanelCardRenderer");
        expect(canvas).not.toContain("HouseholdCardPreview");
    });
});

describe("Surface Composer V3.5 — runtime polish (child detail + activity)", () => {
    const childrenCard = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
    const inlineFocusPanel = readSrc("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");

    it("uses one contextual footer edit affordance (staging ChildFocusEdit path)", () => {
        expect(childrenCard).toContain("data-children-edit-trigger");
        expect(childrenCard).toContain("deeperEditLabel");
        expect(childrenCard).toContain("ChildFocusEdit");
        expect(childrenCard).toContain("IdentityRecordSummary");
    });

    it("routes history through Related Views (not inline field chrome)", () => {
        expect(childrenCard).toContain("RelatedViewsRow");
        expect(childrenCard).toContain("ChildRelatedReport");
        expect(childrenCard).not.toContain("data-child-field-history");
    });

    it("renders schedule as structured truth block in focus view", () => {
        expect(childrenCard).toContain("ChildScheduleBlock");
        expect(childrenCard).toContain("data-child-schedule");
    });

    it("keeps View all evidence as a quiet archive entry point", () => {
        expect(childrenCard).toContain("View all evidence →");
        expect(childrenCard).toContain('data-children-action="expand-evidence"');
    });

    it("prewarms full Activity mode when the Focus Panel opens", () => {
        expect(inlineFocusPanel).toContain("useFocusPanelModePrewarm");
        expect(inlineFocusPanel).toContain("prewarmFocusPanelActivityMode");
    });

    it("keeps child identity compose helpers available for nested surfaces", () => {
        const compose = readSrc("lib/adminV2/runtime/focusPanel/children/childIdentityCompose.ts");
        expect(compose).toContain("composedChildDisplayName");
        expect(compose).toContain("composedChildIdentityLines");
        // Staging ChildrenCard owns its identity render; compose helpers remain for nested config.
        expect(childrenCard).toContain("ChildFocusEdit");
    });
});

describe("Final Surface Composer doctrine — runtime sacred, composer overlay", () => {
    const householdCard = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
    const childrenCard = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
    const compactHeader = readSrc("components/admin/focusPanel/FocusPanelCompactHeader.tsx");
    const canvas = readSrc("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
    const inlineFieldList = readSrc("components/admin/focusPanel/drillIn/InlineRuntimeFieldList.tsx");

    it("hides Focus Panel close control in composer preview", () => {
        expect(compactHeader).toContain("hideClose");
        expect(canvas).toContain("hideClose");
    });

    it("keeps runtime GroupRows visible — never swaps to a configuration layout", () => {
        expect(householdCard).toContain("<GroupRows");
        expect(householdCard).not.toContain("RegionInlineCompose");
        expect(householdCard).not.toContain("data-household-compose-preview");
    });

    it("mounts canvas layout composer on Household summary and context configure paths", () => {
        const addField = readSrc("components/admin/focusPanel/drillIn/NestedSurfaceAddField.tsx");
        expect(addField).toContain("ensureRegionSelected");
        expect(addField).toContain("data-canvas-add-field");
        expect(householdCard).toContain("IdentityComposeSectionCanvas");
        expect(householdCard).toContain('composePurpose ?? "summary"');
        expect(householdCard).toContain('composePurpose === "context_facts"');
        expect(householdCard).not.toContain("InlineRuntimeFieldList");
    });

    it("restores child runtime layout — no duplicate compose preview rows", () => {
        expect(childrenCard).not.toContain("data-children-compose-preview");
        expect(childrenCard).toContain("ConfiguredChildEnrollmentBody");
        expect(childrenCard).toContain("ChildSummaryRow");
    });

    it("uses staging ChildFocusEdit + saveInquiryChild for operational edit mode", () => {
        expect(childrenCard).toContain("ChildFocusEdit");
        expect(childrenCard).toContain("saveInquiryChild");
        expect(childrenCard).not.toContain("ChildEnrollmentEdit");
        expect(childrenCard).not.toContain("Preview — schedule/program editing isn’t saveable yet");
    });

    it("preserves evidence empty states in expanded child evidence", () => {
        expect(childrenCard).toContain("EmptyEvidence");
        expect(childrenCard).toContain("ChildExpandedEvidence");
    });
});

describe("Final Focus Panel ship blockers — empty emergency / child edit / dates", () => {
    const householdCard = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
    const childEdit = readSrc("components/admin/focusPanel/cards/ChildFocusEdit.tsx");
    const mutation = readSrc("lib/adminV2/runtime/focusPanel/focusPanelMutation.ts");

    it("renders actionable empty Emergency Contacts section", () => {
        expect(householdCard).toContain("data-household-emergency-empty");
        expect(householdCard).toContain("Add emergency contact →");
        expect(householdCard).toContain("onAddEmergencyContact");
        expect(mutation).toContain("openAddEmergencyContact");
        expect(mutation).toContain("add_emergency_contact");
    });

    it("keeps staging child save path (ChildFocusEdit → saveInquiryChild)", () => {
        const childrenCard = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(mutation).toContain("saveInquiryChild");
        expect(mutation).toContain("patchChildParticipation");
        expect(mutation).toContain("patchInquiryChildIdentityFromDrawer");
        expect(childrenCard).toContain("save={mutation!.saveInquiryChild}");
        expect(childEdit).toContain("buildChildFocusSavePatch");
    });
});

describe("Final Focus Panel Composer ship fixes", () => {
    const householdSpec = readSrc("lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs.ts");
    const householdCard = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
    const childrenCard = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
    const layoutSurface = readSrc("components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface.tsx");
    const avatarComposer = readSrc("components/admin/focusPanel/drillIn/ChildProfileAvatarComposer.tsx");
    const inlineFieldList = readSrc("components/admin/focusPanel/drillIn/InlineRuntimeFieldList.tsx");
    const runtimeCss = readSrc("app/adminV2/components/alloyOsRuntime.css");

    it("registers other_parent_guardian directly after primary_contact on household surface", () => {
        const primaryIdx = householdSpec.indexOf('key: "primary_contact"');
        const otherParentIdx = householdSpec.indexOf('key: "other_parent_guardian"');
        const additionalIdx = householdSpec.indexOf('key: "household_members"');
        expect(primaryIdx).toBeGreaterThan(-1);
        expect(otherParentIdx).toBeGreaterThan(primaryIdx);
        expect(additionalIdx).toBeGreaterThan(otherParentIdx);
    });

    it("sorts household sections with canonical fallback when config omits other_parent_guardian", () => {
        const ordered = sortByNestedSectionOrder(
            [
                { key: "children" },
                { key: "household_members" },
                { key: "primary_contact" },
                { key: "other_parent_guardian" },
            ],
            null,
            HOUSEHOLD_DEFAULT_SECTION_ORDER,
        );
        expect(ordered.map((g) => g.key)).toEqual([
            "primary_contact",
            "other_parent_guardian",
            "household_members",
            "children",
        ]);
    });

    it("keeps Children roster on shared identity renderer (does not reinvent summary layout)", () => {
        expect(childrenCard).toContain("IdentityRecordSummary");
        expect(childrenCard).toContain("buildChildIdentityRecordVM");
        expect(childrenCard).toContain("ChildSummaryRow");
        expect(childrenCard).toContain("ChildFocusEdit");
        expect(childrenCard).not.toContain("ChildEnrollmentEdit");
    });

    it("defaults roster collapsed detail field keys to empty until configured", () => {
        const config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        expect(childrenRosterCollapsedFieldKeysFromNestedConfig(config)).toEqual([]);
    });

    it("keeps Children drill-in runtime-shaped with discoverable focus/evidence tiers", () => {
        expect(childrenCard).toContain("ComposableRegionShell");
        expect(childrenCard).toContain('groupKey="roster"');
        expect(childrenCard).toContain("data-children-focus-tier");
        expect(childrenCard).toContain("data-children-evidence-tier");
        expect(childrenCard).toContain("Focus fields");
        expect(childrenCard).toContain("Evidence sections");
        expect(childrenCard).toContain("NestedSurfaceFieldLayoutSurface");
        expect(childrenCard).toContain("childrenFocusRowsFromNestedConfig");
        expect(childrenCard).toContain("childrenEvidenceSectionsFromNestedConfig");
        expect(childrenCard).not.toContain("ChildEnrollmentEdit");
    });

    it("maps children focus vs evidence config tiers", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "placement", "inquiry_child.program");
        config = addFieldToNestedGroup(config, "identity", "child.nickname");
        config = setNestedGroupEnabled(config, "medical", true, { sectionSemantic: "medical" });

        const focusRows = childrenFocusRowsFromNestedConfig(config);
        expect(focusRows.some((row) => row.groupKey === "placement" && row.fieldKey === "inquiry_child.program")).toBe(true);
        expect(focusRows.some((row) => row.groupKey === "identity" && row.fieldKey === "child.nickname")).toBe(true);
        expect(CHILDREN_FOCUS_GROUP_KEYS).toEqual(["identity", "placement", "readiness"]);

        const evidence = childrenEvidenceSectionsFromNestedConfig(config);
        expect(evidence.some((section) => section.key === "medical")).toBe(true);
        expect(evidence.every((section) => !CHILDREN_FOCUS_GROUP_KEYS.includes(section.key as (typeof CHILDREN_FOCUS_GROUP_KEYS)[number]))).toBe(true);
    });

    it("uses adaptive elevated drill-in height with internal body scroll", () => {
        expect(runtimeCss).toContain("[data-fp-composer-edit-mode=\"true\"]");
        expect(runtimeCss).toContain("height: max-content");
        expect(runtimeCss).toContain("max-height: min(75vh, calc(100dvh - 48px))");
        expect(runtimeCss).not.toContain("min-height: min(70vh");
        expect(runtimeCss).not.toContain("min-height: min(70vh, calc(100% - 32px))");
        expect(runtimeCss).toContain(".alloy-os-ucard__body");
        expect(runtimeCss).toContain("overflow-y: auto");
        expect(runtimeCss).toContain(
            "width: min(var(--alloy-os-focus-panel-max-width, 720px), calc(100% - 32px));",
        );
        expect(runtimeCss).toContain(".fp-composer-tier-label");
    });

    it("uses shared identity field grid for runtime child focus fields", () => {
        const identityFieldGrid = readSrc("components/admin/focusPanel/identity/IdentityFieldGrid.tsx");
        expect(childrenCard).toContain("IdentityFieldGrid");
        expect(childrenCard).toContain("IdentityExpandedDetails");
        expect(childrenCard).not.toContain("function RegionEditLayer");
        expect(layoutSurface).toContain("applyNestedSurfaceFieldDrop");
        expect(layoutSurface).toContain("data-drop-zone=\"beside\"");
        expect(layoutSurface).toContain("data-drop-zone=\"below\"");
        expect(layoutSurface).not.toContain("Half row");
        expect(layoutSurface).not.toContain("fp-inline-field-row__layout");
        expect(inlineFieldList).not.toContain("fp-inline-field-row__layout");
        expect(identityFieldGrid).toContain("identity-field-grid__row--pair");
    });

    it("exposes child profile avatar composer on identity header", () => {
        expect(childrenCard).toContain("ChildProfileAvatarComposer");
        expect(avatarComposer).toContain("setChildAvatarPreviewUrl");
        expect(avatarComposer).toContain("Remove");
        expect(avatarComposer).toContain("groupShowAvatarForNestedGroup");
        expect(avatarComposer).toContain("data-child-avatar-upload");
        expect(avatarComposer).toContain("builder?");
        expect(childrenCard).toContain("imageUrl={previewImageUrl}");
        const childrenDrillIn = readSrc(
            "components/admin/focusPanel/drillIn/FocusPanelChildrenDrillInComposer.tsx",
        );
        expect(childrenDrillIn).toContain("ChildProfileAvatarComposer");
        expect(childrenDrillIn).toContain("builder={{ config, onConfigChange }}");
    });

    it("exposes child profile avatar composer on roster context facts", () => {
        expect(childrenCard).toContain('groupKey="roster"');
        expect(childrenCard).toContain("childRosterAvatarComposer");
        expect(childrenCard).toContain('purpose="context_facts"');
        expect(childrenCard).toContain("renderRecordAvatar");
        const childrenDrillIn = readSrc(
            "components/admin/focusPanel/drillIn/FocusPanelChildrenDrillInComposer.tsx",
        );
        expect(childrenDrillIn).toContain('groupKey="roster"');
        expect(childrenDrillIn).toContain("ChildProfileAvatarComposer");
    });

    it("polish sprint — field instances own controls; evidence sections are cards", () => {
        const addField = readSrc("components/admin/focusPanel/drillIn/NestedSurfaceAddField.tsx");
        const evidenceCard = readSrc("components/admin/focusPanel/drillIn/EvidenceSectionCard.tsx");
        expect(layoutSurface).toContain("fp-field-instance__remove");
        expect(layoutSurface).toContain("FieldInstance");
        expect(layoutSurface).toContain("showAddField");
        expect(addField).toContain("data-canvas-add-field");
        expect(childrenCard).toContain("EvidenceSectionCard");
        expect(childrenCard).not.toContain("InlineRuntimeFieldList");
        expect(evidenceCard).toContain("setNestedGroupEnabled");
        expect(evidenceCard).toContain("showAddField={false}");
        expect(runtimeCss).toContain(".fp-evidence-section");
        expect(runtimeCss).toContain(".fp-field-instance__remove");
    });

    it("household summary supports secondary parent on collapsed card", () => {
        expect(householdCard).toContain('groupKey="other_parent_guardian"');
        expect(householdCard).toContain("buildHouseholdIdentityCardVM");
        expect(householdCard).toContain("secondaryRecords");
    });

    it("composer leak fixes — clean evidence picker, floating add field, drag hints", () => {
        const addSectionMenu = readSrc("components/admin/focusPanel/drillIn/AddSectionMenu.tsx");
        const addField = readSrc("components/admin/focusPanel/drillIn/NestedSurfaceAddField.tsx");
        const floatingPopover = readSrc("components/admin/focusPanel/drillIn/ComposerFloatingPopover.tsx");
        const sectionCatalog = readSrc("lib/adminV2/settings/surfaces/sectionCatalog.ts");
        const surfaceProofs = readSrc("lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs.ts");
        expect(addSectionMenu).toContain("ComposerFloatingPopover");
        expect(addSectionMenu).toContain("fp-add-section-menu__label");
        expect(addSectionMenu).toContain("fp-add-section-menu__desc");
        expect(addSectionMenu).toContain("CUSTOM_SECTION_OPTION.label");
        expect(sectionCatalog).toContain('label: "Documents"');
        expect(sectionCatalog).not.toContain("DocumentsUploaded");
        expect(addField).toContain("ComposerFloatingPopover");
        expect(floatingPopover).toContain("createPortal");
        expect(layoutSurface).toContain("Place beside");
        expect(layoutSurface).toContain("Place below");
        expect(runtimeCss).toContain(".fp-add-section-menu__label");
        expect(runtimeCss).toContain(".fp-layout-drop-hint");
        expect(runtimeCss).toContain("overflow: visible");
        expect(surfaceProofs).toContain("child.medical_summary");
        expect(surfaceProofs).toContain("child.first_name");
    });

    it("evidence sections offer supporting child fields in add-field library", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setNestedGroupEnabled(config, "medical", true, { sectionSemantic: "medical" });
        const medicalGroup = config.groups.find((g) => g.key === "medical");
        expect(medicalGroup?.selectedFieldKeys).toContain("child.medical_summary");
        const available = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "medical", config, []);
        expect(available.some((f) => f.key === "child.medical_summary")).toBe(false);
        expect(available.some((f) => f.key === "inquiry_child.program")).toBe(true);
    });

    it("composer canvas resolves elevated cell keys like runtime work-unit", () => {
        const canvas = readSrc("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
        expect(canvas).toContain("resolveElevatedCellKey");
        expect(canvas).toContain("data-fp-composer-depth-active");
        expect(canvas).not.toContain("const elevatedCellKey = activeDepth?.card ?? null");
    });

    it("field removal promotes orphan half rows and exposes reliable remove chrome", () => {
        const layoutSurface = readSrc("components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface.tsx");
        const runtimeCss = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(layoutSurface).toContain("onAfterRemove");
        expect(layoutSurface).toContain("e.stopPropagation()");
        expect(layoutSurface).toContain("fp-layout-surface--dragging");
        expect(runtimeCss).toContain(".fp-layout-surface--dragging .fp-layout-drop-zone");
        expect(runtimeCss).toContain("[data-fp-composer-depth-active=\"true\"]");
    });

    it("composer drill-in auto-opens household and child focus surfaces", () => {
        const householdCard = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
        const childrenCard = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(householdCard).toContain("composingHouseholdSurface");
        expect(householdCard).toContain("enterContext()");
        expect(childrenCard).toContain("composingChildrenSurface");
        expect(childrenCard).toContain("setDrillDepth({ kind: \"child-focus\"");
    });
});
