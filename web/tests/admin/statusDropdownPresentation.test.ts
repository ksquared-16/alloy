import { describe, expect, it } from "vitest";
import {
    mapStatusDropdownOptions,
    statusDropdownDisplayUsesLabel,
} from "@/lib/admin/statusDropdownPresentation";
import {
    buildPersonStatusApplicabilityMetadata,
    PERSON_STATUS_PROFILE_GENERIC,
    resolvePersonStatusLabelForProfile,
} from "@/lib/admin/person/personStatusApplicability";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

describe("mapStatusDropdownOptions", () => {
    it("prefers API label over status_key for display", () => {
        const options = mapStatusDropdownOptions([
            { value: "pre_enrolled", label: "Pre-Enrolled Family", sort_order: 1 },
            { value: "active", label: "Active Family", sort_order: 2 },
        ]);
        expect(options).toEqual([
            { status_key: "pre_enrolled", label: "Pre-Enrolled Family", sort_order: 1 },
            { status_key: "active", label: "Active Family", sort_order: 2 },
        ]);
        expect(statusDropdownDisplayUsesLabel("pre_enrolled", options[0]!.label)).toBe(true);
    });

    it("prefers status_label when label is absent", () => {
        const options = mapStatusDropdownOptions([
            { status_key: "open", status_label: "Open", sort_order: 0 },
        ]);
        expect(options[0]?.label).toBe("Open");
        expect(options[0]?.status_key).toBe("open");
    });

    it("falls back to status_key only when no label fields exist", () => {
        const options = mapStatusDropdownOptions([{ status_key: "legacy_key", sort_order: 0 }]);
        expect(options[0]?.label).toBe("legacy_key");
        expect(statusDropdownDisplayUsesLabel("legacy_key", options[0]!.label)).toBe(false);
    });
});

describe("status label resolution contract", () => {
    it("resolvePersonStatusLabelForProfile matches mapStatusDropdownOptions for profile labels", () => {
        const row: StatusDefinitionRow = {
            id: "active",
            org_id: "org-1",
            industry_key: null,
            entity_type: "persons",
            status_key: "active",
            status_label: "Active",
            sort_order: 0,
            is_active: true,
            is_system: false,
            metadata: {
                ...buildPersonStatusApplicabilityMetadata("both"),
                labels_by_profile: {
                    person_generic: "Active Family",
                    child_lifecycle: "Active",
                },
            },
        };
        const profileLabel = resolvePersonStatusLabelForProfile(row, PERSON_STATUS_PROFILE_GENERIC);
        const mapped = mapStatusDropdownOptions([{ status_key: row.status_key, label: profileLabel }]);
        expect(mapped[0]?.label).toBe("Active Family");
        expect(statusDropdownDisplayUsesLabel("active", mapped[0]!.label)).toBe(true);
    });
});
