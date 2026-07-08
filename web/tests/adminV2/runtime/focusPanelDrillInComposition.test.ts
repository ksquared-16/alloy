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
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    platformSectionOptions,
    evidenceSectionOptions,
    sectionSemanticForGroup,
    CUSTOM_SECTION_OPTION,
} from "@/lib/adminV2/settings/surfaces/sectionCatalog";
import { sortByNestedSectionOrder, moveSectionInNestedConfig, HOUSEHOLD_DEFAULT_SECTION_ORDER } from "@/lib/adminV2/settings/surfaces/nestedSurfaceSectionOrder";
import { childrenRosterCollapsedFieldKeysFromNestedConfig } from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
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

    it("uses inline runtime field editing and metadata-only drill-in inspector", () => {
        expect(householdCard).toContain("InlineRuntimeFieldList");
        expect(householdCard).toContain("ComposableFieldShell");
        expect(drillInspector).toContain("metadataOnly");
        expect(drillInspector).not.toContain("data-inspector-field-list");
        expect(cardInspector).toContain("metadataOnly");
    });

    it("Configure Household opens in-place drill-in via requestFocus, not route change", () => {
        expect(canvas).toContain("requestFocus(typeKey, null)");
        expect(canvas).not.toContain("onOpenNestedSurface");
    });

    it("removes blue-gray builder background from Focus Panel editor", () => {
        expect(editor).toContain("bg-white");
        expect(editor).not.toContain("#EEF2F8");
    });

    it("household card wraps runtime regions with composable shells", () => {
        expect(householdCard).toContain("ComposableRegionShell");
        expect(householdCard).toContain("RegionEditLayer");
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
        expect(childrenCard).not.toContain("onEditField");
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

    it("hides Focus Panel close control on inline work-unit runtime", () => {
        const inlineFocusPanel = readSrc("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");
        const drawerRuntime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const compactHeader = readSrc("components/admin/focusPanel/FocusPanelCompactHeader.tsx");
        expect(inlineFocusPanel).toContain("hideClose");
        expect(drawerRuntime).toContain("hideClose");
        expect(compactHeader).toContain("data-focus-panel-close-hidden");
    });

    it("keeps runtime GroupRows visible — never swaps to a configuration layout", () => {
        expect(householdCard).toContain("<GroupRows");
        expect(householdCard).not.toContain("RegionInlineCompose");
        expect(householdCard).not.toContain("data-household-compose-preview");
    });

    it("scopes edit-layer field controls to selected regions (overlay, not replacement)", () => {
        expect(inlineFieldList).toContain("whenRegionSelectedOnly");
        expect(inlineFieldList).toContain("suppressPreview");
        expect(householdCard).toContain("suppressPreview");
        expect(householdCard).toContain("whenRegionSelectedOnly");
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
    const childrenCard = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
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

    it("keeps staging ChildrenCard roster meta (does not reinvent summary layout)", () => {
        // Staging ChildrenCard — scannable summary meta via childRosterMeta; ChildFocusEdit owns edit.
        expect(childrenCard).toContain("childRosterMeta");
        expect(childrenCard).toContain("ChildSummaryRow");
        expect(childrenCard).toContain("ChildFocusEdit");
        expect(childrenCard).not.toContain("ChildEnrollmentEdit");
    });

    it("defaults roster collapsed detail field keys to empty until configured", () => {
        const config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        expect(childrenRosterCollapsedFieldKeysFromNestedConfig(config)).toEqual([]);
    });

    it("keeps Children drill-in runtime-shaped while exposing selected-region field controls", () => {
        expect(childrenCard).toContain("ComposableRegionShell");
        expect(childrenCard).toContain('groupKey="roster"');
        expect(childrenCard).toContain('groupKey="placement"');
        expect(childrenCard).toContain('groupKey="identity"');
        expect(childrenCard).toContain("RegionEditLayer");
        expect(childrenCard).toContain("whenRegionSelectedOnly");
        expect(childrenCard).toContain("childrenRosterCollapsedFieldKeysFromNestedConfig");
        expect(childrenCard).toContain("childFocusViewFromConfig(childrenSurfaceConfig)");
        expect(childrenCard).not.toContain("ChildEnrollmentEdit");
    });

    it("gives elevated drill-ins workspace height with internal body scroll", () => {
        expect(runtimeCss).toContain("[data-fp-composer-edit-mode=\"true\"]");
        expect(runtimeCss).toContain("min-height: min(70vh, calc(100% - 32px))");
        expect(runtimeCss).toContain("max-height: min(80vh, calc(100% - 32px))");
        expect(runtimeCss).toContain(".alloy-os-ucard__body");
        expect(runtimeCss).toContain("overflow-y: auto");
        expect(runtimeCss).toContain("width: min(560px, calc(100% - 32px));");
        expect(runtimeCss).toContain(".fp-composable-field__grip");
        expect(runtimeCss).toContain(".fp-composable-region.is-selected");
    });
});
