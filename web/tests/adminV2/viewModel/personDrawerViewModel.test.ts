import { describe, expect, it } from "vitest";

import {
    buildPersonFirstViewportPlan,
    resolvePersonDrawerVmSurface,
    PERSON_DRAWER_FIRST_PAINT_DEPENDENCIES,
} from "@/lib/adminV2/viewModel/drawer/person/personDrawerFirstViewportContract";
import { buildPersonDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";

function minimalPersonVm(overrides: Partial<PersonDrawerViewModel> = {}): PersonDrawerViewModel {
    return {
        generation: "gen",
        structureSettled: true,
        compose_version: "1.0.0",
        entity: { type: "person", id: "p-1" },
        surface: "parent",
        first_paint: {
            settled: true,
            viewport_slots: ["header", "summary"],
            dependencies: [
                {
                    key: "record_full",
                    disposition: "first_paint_required",
                    status: "ready",
                    satisfied_by: "server_fetch",
                },
            ],
            data: { record_full: { id: "p-1", _person_name: "Parent" } },
            deferred: [],
            background: [],
        },
        header: { title: "Parent", subtitle: null, status_label: "Active" },
        record: { id: "p-1", _person_name: "Parent", _household_adult_links: [] },
        layout: { variant_key: "person_parent_operating_v1", operating_sections: ["parent_summary"] },
        background_refresh: { allowed: ["status_values"] },
        timing: { compose_ms: 10, phases_ms: {} },
        ...overrides,
    };
}

describe("personDrawerFirstViewportContract", () => {
    it("lists current first-paint dependencies", () => {
        expect(PERSON_DRAWER_FIRST_PAINT_DEPENDENCIES).toContain("record_full");
        expect(PERSON_DRAWER_FIRST_PAINT_DEPENDENCIES).toContain("composed_sections");
    });

    it("resolves parent surface from open source", () => {
        expect(resolvePersonDrawerVmSurface({ openSource: "opportunity_primary_contact" })).toBe("parent");
        expect(resolvePersonDrawerVmSurface({ openSource: "global_search" })).toBe("generic");
    });

    it("buildPersonFirstViewportPlan includes parent operating sections", () => {
        const plan = buildPersonFirstViewportPlan("parent");
        expect(plan.viewport_slots).toContain("summary");
        expect(plan.operating_sections).toContain("parent_summary");
    });
});

describe("buildPersonDrawerOpenPreloadFromViewModel", () => {
    it("maps VM to view_model preload with full surface record", () => {
        const preload = buildPersonDrawerOpenPreloadFromViewModel(minimalPersonVm());
        expect(preload.openPath).toBe("view_model");
        expect(preload.first_paint_settled).toBe(true);
        expect(preload.primaryEntity._record_surface).toBe("full");
    });
});
