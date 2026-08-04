/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
    editableContactValueKeys,
    resolveContactEditFieldPolicy,
} from "@/lib/adminV2/runtime/focusPanel/household/householdContactFieldPolicy";
import {
    householdContactPatch,
} from "@/lib/adminV2/runtime/focusPanel/household/householdContactEditState";
import {
    buildChildFocusSavePatch,
} from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";
import {
    resolveChildFocusEditPolicy,
} from "@/lib/adminV2/runtime/focusPanel/children/childFocusFieldPolicy";
import type { PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import { CHILD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import { childFocusViewFromConfig } from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";
import { CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS } from "@/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime";
import { defaultNestedSurfaceConfig, CHILDREN_SURFACE_ID, setFieldVisibilityInNestedGroup } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    childrenFocusRowsFromNestedConfig,
    readChildrenNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { HOUSEHOLD_CONTACT_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import { getSurface } from "@/lib/platform/surfaceComposition/surfaceRegistry";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

describe("household contact edit field policy", () => {
    it("hides non-displayed fields and marks non-editable rows read-only", () => {
        const patched = {
            surfaceId: HOUSEHOLD_CONTACT_SURFACE_ID,
            groups: [{
                key: "contact_fields",
                selectedFieldKeys: ["person.email", "person.phone"],
                fieldModes: {
                    "person.email": { displayed: false, editable: true },
                    "person.phone": { displayed: true, editable: false },
                },
            }],
        };
        const policy = resolveContactEditFieldPolicy(patched);
        expect(policy.some((r) => r.configKey === "contact.email" && r.displayed)).toBe(false);
        const phone = policy.find((r) => r.configKey === "contact.phone")!;
        expect(phone.displayed).toBe(true);
        expect(phone.editable).toBe(false);
    });

    it("save payload excludes non-editable fields", () => {
        const baseline: PersonContactValues = {
            first_name: "Jordan",
            last_name: "Johnson",
            email: "jordan@example.com",
            phone: "5550001234",
        };
        const draft: PersonContactValues = {
            ...baseline,
            email: "changed@example.com",
            phone: "5559999999",
        };
        const policy = resolveContactEditFieldPolicy({
            surfaceId: HOUSEHOLD_CONTACT_SURFACE_ID,
            groups: [
                {
                    key: "contact_fields",
                    selectedFieldKeys: ["person.email", "person.phone"],
                    fieldModes: {
                        "person.email": { displayed: true, editable: false },
                        "person.phone": { displayed: true, editable: true },
                    },
                },
            ],
        });
        const editableKeys = editableContactValueKeys(policy);
        const patch = householdContactPatch(draft, baseline, editableKeys);
        expect(patch.email).toBeUndefined();
        expect(patch.phone).toBe("5559999999");
    });
});

describe("child_surface registration + runtime resolver", () => {
    it("registers child_surface in the runtime registry", () => {
        ensureRuntimeSurfacesRegistered();
        expect(getSurface(CHILD_SURFACE_ID)?.id).toBe(CHILD_SURFACE_ID);
    });

    it("seeds default child_surface config with placement fields", () => {
        const config = defaultNestedSurfaceConfig(CHILD_SURFACE_ID);
        expect(config.surfaceId).toBe(CHILD_SURFACE_ID);
        const placement = config.groups.find((g) => g.key === "placement")!;
        expect(placement.expandedFieldKeys ?? []).toContain("inquiry_child.program");
    });

    it("maps published child_surface config to focus view", () => {
        const config = defaultNestedSurfaceConfig(CHILD_SURFACE_ID);
        const patched = {
            ...config,
            groups: config.groups.map((g) =>
                g.key === "placement"
                    ? {
                          ...g,
                          selectedFieldKeys: ["child.room"],
                          fieldModes: { ...g.fieldModes, "child.room": { displayed: true, editable: false } },
                      }
                    : g.key === "identity"
                      ? { ...g, displayOptions: { showAge: false, showDob: false } }
                      : g,
            ),
        };
        const view = childFocusViewFromConfig(patched);
        expect(view.focusFields.map((f) => f.fieldKey)).toContain("child.room");
        expect(view.headerShowAge).toBe(false);
    });

    it("reads child_surface config from published doc metadata", () => {
        const config = defaultNestedSurfaceConfig(CHILD_SURFACE_ID);
        const doc = {
            metadata: { nestedSurfaces: { [CHILD_SURFACE_ID]: config } },
        } as unknown as LayoutDoc;
        expect(readChildrenNestedConfigFromDoc(doc)?.surfaceId).toBe(CHILDREN_SURFACE_ID);
    });
});

describe("child focus edit field policy + save payload", () => {
    it("includes editable child field changes in save payload", () => {
        const baseline = {
            location_id: "",
            program_category_id: "prog-a",
            program_room_cohort_key: "room-a",
            schedule_type: "full_time",
            start_date: "2026-08-01",
            requested_days_per_week: "",
            weekdays: "",
            dob: "2020-01-01",
        };
        const draft = {
            ...baseline,
            program_category_id: "prog-b",
            schedule_type: "part_time",
        };
        const editableKeys = new Set(["program_category_id", "schedule_type"] as const);
        const patch = buildChildFocusSavePatch({
            row: {
                id: "child-1",
                customer_member_id: "cm-1",
                person_id: "p-child",
                display_name: "Alex",
                dob: baseline.dob,
                age: null,
                program_category_id: baseline.program_category_id,
                program_key: null,
                desired_program_label: "Preschool",
                schedule_type: baseline.schedule_type,
                desired_schedule_label: "Full time",
                outcome_status_key: null,
                outcome_status_label: null,
                notes: null,
                start_date: baseline.start_date,
                location_id: null,
                location_label: null,
                program_room_cohort_key: baseline.program_room_cohort_key,
                program_room_cohort_label: null,
                custom_fields: {},
                first_name: "Alex",
                last_name: null,
                linked_on_inquiry: true,
                ocm_id: "ocm-1",
            },
            draft,
            baseline,
            identityBaseline: { first_name: "Alex", last_name: "", dob: baseline.dob },
            editableKeys,
        });
        expect(patch.ocmPatch.program_category_id).toBe("prog-b");
        expect(patch.ocmPatch.schedule_type).toBe("part_time");
        expect(patch.ocmPatch.program_room_cohort_key).toBeUndefined();
        expect(patch.ocmPatch.start_date).toBeUndefined();
    });

    it("excludes read-only and hidden child fields from save payload", () => {
        const baseline = {
            location_id: "",
            program_category_id: "prog-a",
            program_room_cohort_key: "room-a",
            schedule_type: "full_time",
            start_date: "2026-08-01",
            requested_days_per_week: "",
            weekdays: "",
            dob: "2020-01-01",
        };
        const draft = {
            ...baseline,
            program_room_cohort_key: "room-b",
            start_date: "2026-09-01",
            dob: "2020-02-02",
        };
        const editableKeys = new Set(["program_category_id"] as const);
        const patch = buildChildFocusSavePatch({
            row: {
                id: "child-1",
                customer_member_id: "cm-1",
                person_id: "p-child",
                display_name: "Alex",
                dob: baseline.dob,
                age: null,
                program_category_id: baseline.program_category_id,
                program_key: null,
                desired_program_label: null,
                schedule_type: baseline.schedule_type,
                desired_schedule_label: null,
                outcome_status_key: null,
                outcome_status_label: null,
                notes: null,
                start_date: baseline.start_date,
                location_id: null,
                location_label: null,
                program_room_cohort_key: baseline.program_room_cohort_key,
                program_room_cohort_label: null,
                custom_fields: {},
                first_name: "Alex",
                last_name: null,
                linked_on_inquiry: true,
                ocm_id: "ocm-1",
            },
            draft: { ...draft, program_category_id: "prog-changed" },
            baseline,
            identityBaseline: { first_name: "Alex", last_name: "", dob: baseline.dob },
            editableKeys,
        });
        expect(patch.ocmPatch.program_category_id).toBe("prog-changed");
        expect(patch.ocmPatch.program_room_cohort_key).toBeUndefined();
        expect(patch.ocmPatch.start_date).toBeUndefined();
        expect(Object.keys(patch.identityPatch)).toHaveLength(0);
    });

    it("marks unsupported child fields explicit in edit policy", () => {
        const config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const patched = {
            ...config,
            groups: config.groups.map((g) =>
                g.key === "readiness"
                    ? {
                          ...g,
                          selectedFieldKeys: ["child.readiness_summary"],
                          fieldModes: {
                              "child.readiness_summary": { displayed: true, editable: true },
                          },
                      }
                    : g,
            ),
        };
        const policy = resolveChildFocusEditPolicy(patched);
        const readiness = policy.find((r) => r.configKey === "child.readiness_summary")!;
        expect(readiness.unsupported).toBe(true);
        expect(readiness.editable).toBe(false);
    });

    it("published children_surface fieldPolicies drive runtime edit behavior", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const placement = config.groups.find((g) => g.key === "placement");
        if (placement) {
            config = {
                ...config,
                groups: config.groups.map((g) =>
                    g.key === "placement"
                        ? {
                              ...g,
                              selectedFieldKeys: [...new Set([...g.selectedFieldKeys, "inquiry_child.program", "child.start_date"])],
                          }
                        : g,
                ),
            };
            config = setFieldVisibilityInNestedGroup(config, "placement", "inquiry_child.program", "editable");
            config = setFieldVisibilityInNestedGroup(config, "placement", "child.start_date", "read-only");
        } else {
            config = {
                ...config,
                groups: [
                    ...config.groups,
                    {
                        key: "placement",
                        label: "Placement",
                        selectedFieldKeys: ["inquiry_child.program", "child.start_date"],
                        fieldModes: {},
                        fieldPolicies: {
                            "inquiry_child.program": "editable",
                            "child.start_date": "read-only",
                        },
                    } as never,
                ],
            };
        }

        const policy = resolveChildFocusEditPolicy(config);
        const program = policy.find((r) => r.configKey === "inquiry_child.program");
        const start = policy.find((r) => r.configKey === "child.start_date");
        expect(program?.editable).toBe(true);
        expect(start?.editable).toBe(false);

        const focusRows = childrenFocusRowsFromNestedConfig(config);
        expect(focusRows.find((r) => r.fieldKey === "inquiry_child.program")?.editable).toBe(true);
    });

    it("ChildrenCard wires child drill-in save (not preview-only)", () => {
        const src = readFileSync(
            fileURLToPath(new URL("../../components/admin/focusPanel/cards/ChildrenCard.tsx", import.meta.url)),
            "utf8",
        );
        expect(src).toContain("ChildFocusEdit");
        expect(src).toContain("saveInquiryChild");
        expect(src).not.toContain("isn't saveable yet");
    });
});

describe("domain-locked child expanded sections", () => {
    it("declares medical/documents/pickup as domain-locked constants", () => {
        const keys = CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS.map((s) => s.key);
        expect(keys).toEqual(["medical", "documents", "pickup_instructions"]);
    });

    it("ChildrenCard renders configured evidence sections behind expanded archive", () => {
        const src = readFileSync(
            fileURLToPath(new URL("../../components/admin/focusPanel/cards/ChildrenCard.tsx", import.meta.url)),
            "utf8",
        );
        expect(src).toContain("ChildExpandedEvidence");
        expect(src).toContain("buildChildIdentityRecordVM");
        expect(src).toContain("IdentityFieldGrid");
        expect(src).toContain("childrenEvidenceSectionsFromNestedConfig");
        expect(src).toContain("readChildrenNestedConfigFromDoc");
        expect(src).not.toContain("readChildNestedConfigFromDoc");
    });

    it("HouseholdContactEdit consumes published contact_edit field policy", () => {
        const src = readFileSync(
            fileURLToPath(new URL("../../components/admin/focusPanel/cards/HouseholdContactEdit.tsx", import.meta.url)),
            "utf8",
        );
        expect(src).toContain("buildHouseholdContactEditFieldRows");
        expect(src).toContain("IdentityFieldGrid");
        expect(src).toContain("householdContactPatch");
    });
});

describe("queue row frozen guard", () => {
    it("Queue Row builder files remain untouched by drill-in runtime modules", async () => {
        const src = readFileSync(
            fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx", import.meta.url)),
            "utf8",
        );
        expect(src).not.toContain("childNestedSurfaceRuntime");
        expect(src).not.toContain("householdContactFieldPolicy");
    });
});
