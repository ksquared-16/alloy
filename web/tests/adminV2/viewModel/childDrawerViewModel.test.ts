import { describe, expect, it } from "vitest";

import {
    buildChildFirstViewportPlan,
    isChildDrawerVmOpen,
    CHILD_DRAWER_FIRST_PAINT_DEPENDENCIES,
} from "@/lib/adminV2/viewModel/drawer/child/childDrawerFirstViewportContract";
import { buildChildDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";

describe("childDrawerFirstViewportContract", () => {
    it("lists child first-paint dependencies", () => {
        expect(CHILD_DRAWER_FIRST_PAINT_DEPENDENCIES).toContain("composed_sections");
    });

    it("detects child VM opens", () => {
        expect(isChildDrawerVmOpen({ openSource: "opportunity_inquiry_child" })).toBe(true);
        expect(isChildDrawerVmOpen({ presentationEmphasis: "child_lifecycle" })).toBe(true);
        expect(isChildDrawerVmOpen({ openSource: "opportunity_primary_contact" })).toBe(false);
    });

    it("buildChildFirstViewportPlan includes child summary slot", () => {
        expect(buildChildFirstViewportPlan().viewport_slots).toContain("child_summary");
    });
});

describe("buildChildDrawerOpenPreloadFromViewModel", () => {
    it("stamps child presentation emphasis on paint record", () => {
        const vm: ChildDrawerViewModel = {
            generation: "gen",
            structureSettled: true,
            compose_version: "1.0.0",
            entity: { type: "person", id: "c-1" },
            surface: "child",
            first_paint: {
                settled: true,
                viewport_slots: ["child_summary"],
                dependencies: [],
                data: {},
                deferred: [],
                background: [],
            },
            header: { title: "Child", subtitle: null, status_label: null },
            record: { id: "c-1", _person_name: "Child" },
            layout: { variant_key: "person_child_operating_v1", operating_sections: ["child_summary", "household"] },
            background_refresh: { allowed: ["status_values"] },
            timing: { compose_ms: 5, phases_ms: {} },
        };
        const preload = buildChildDrawerOpenPreloadFromViewModel(vm);
        expect(preload.primaryEntity._drawer_presentation_emphasis).toBe("child_lifecycle");
    });
});
