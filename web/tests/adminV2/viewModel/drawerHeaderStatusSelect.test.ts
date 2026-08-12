import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPersonDrawerStatusControlVm } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerStatusControlVm";
import {
    buildPersonStatusApplicabilityMetadata,
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
} from "@/lib/admin/person/personStatusApplicability";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

function personStatusDef(
    status_key: string,
    status_label: string,
    profile: "child_lifecycle" | "person_generic" | "both"
): StatusDefinitionRow {
    return {
        id: status_key,
        org_id: "org-1",
        industry_key: null,
        entity_type: "persons",
        status_key,
        status_label,
        sort_order: 0,
        is_active: true,
        is_system: false,
        metadata: buildPersonStatusApplicabilityMetadata(profile),
    };
}

describe("buildPersonDrawerStatusControlVm", () => {
    it("uses profile-specific labels when statusProfile is provided", () => {
        const control = buildPersonDrawerStatusControlVm({
            record: { status_key: "active", _status_display: "Active" },
            statusDefs: [
                {
                    ...personStatusDef("active", "Active", "both"),
                    metadata: {
                        ...buildPersonStatusApplicabilityMetadata("both"),
                        labels_by_profile: {
                            person_generic: "Active Family",
                            child_lifecycle: "Active",
                        },
                    },
                },
                personStatusDef("pre_enrolled", "Pre-Enrolled", "both"),
            ],
            statusProfile: PERSON_STATUS_PROFILE_GENERIC,
        });
        expect(control.renderAs).toBe("dropdown");
        if (control.renderAs === "dropdown") {
            expect(control.options.find((o) => o.status_key === "active")?.label).toBe("Active Family");
        }
    });

    it("returns child lifecycle dropdown options from filtered persons status defs", () => {
        const control = buildPersonDrawerStatusControlVm({
            record: { status_key: "active", _status_display: "Active" },
            statusDefs: [
                personStatusDef("active", "Active", "both"),
                personStatusDef("pre_enrolled", "Pre-Enrolled", "both"),
                personStatusDef("inactive", "Inactive", "both"),
            ],
            statusProfile: PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
        });
        expect(control.renderAs).toBe("dropdown");
        if (control.renderAs === "dropdown") {
            expect(control.options.map((o) => o.status_key).sort()).toEqual(
                ["active", "pre_enrolled", "inactive"].sort()
            );
        }
    });

    it("returns readonly pill when fewer than two defs are supplied", () => {
        const control = buildPersonDrawerStatusControlVm({
            record: { status_key: "active", _status_display: "Active" },
            statusDefs: [personStatusDef("active", "Active", "both")],
        });
        expect(control.renderAs).toBe("readonly_pill");
    });

    it("returns hidden when no status and no defs", () => {
        expect(
            buildPersonDrawerStatusControlVm({
                record: {},
                statusDefs: [],
            })
        ).toEqual({ renderAs: "hidden" });
    });
});

describe("drawer header status select wiring", () => {

    it("compose loads persons status defs with profile filtering", () => {
        const personCompose = read("lib/adminV2/viewModel/drawer/person/composePersonDrawerViewModel.ts");
        expect(personCompose).toContain("buildPersonDrawerStatusControlVm");
        expect(personCompose).toContain("filterPersonStatusDefinitionsForProfile");
        expect(personCompose).toContain("PERSON_STATUS_PROFILE_GENERIC");

        const childCompose = read("lib/adminV2/viewModel/drawer/child/composeChildDrawerViewModel.ts");
        expect(childCompose).toContain("PERSON_STATUS_PROFILE_CHILD_LIFECYCLE");
        expect(childCompose).toContain("buildPersonDrawerStatusControlVm");
    });

});

describe("status profile constants", () => {
    it("child lifecycle profile is distinct from generic person profile", () => {
        expect(PERSON_STATUS_PROFILE_CHILD_LIFECYCLE).not.toBe(PERSON_STATUS_PROFILE_GENERIC);
    });
});
