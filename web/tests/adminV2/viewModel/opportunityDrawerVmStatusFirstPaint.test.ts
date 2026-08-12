import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";
import { resolveOpportunityVmStatusLabel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusLabel";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("resolveOpportunityVmStatusLabel", () => {
    it("uses VM header status when drawer id matches entity", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            entity: { type: "opportunity", id: "opp-1" },
            header: {
            title: "Opp",
            subtitle: null,
            status: { renderAs: "readonly_pill", label: "Tour scheduled" },
            status_can_mutate: false,
            oper_trust_preview: null,
        },
        });
        expect(
            resolveOpportunityVmStatusLabel({
                drawerId: "opp-1",
                displayVm: vm,
                queueSeedStatusLabel: "Waitlist",
            })
        ).toBe("Tour scheduled");
    });

    it("falls back to queue seed when VM not yet applied for target id", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            entity: { type: "opportunity", id: "opp-other" },
            header: { title: "Opp", subtitle: null, status: { renderAs: "readonly_pill", label: "Other" }, status_can_mutate: false, oper_trust_preview: null },
        });
        expect(
            resolveOpportunityVmStatusLabel({
                drawerId: "opp-1",
                displayVm: vm,
                queueSeedStatusLabel: "New lead",
            })
        ).toBe("New lead");
    });

    it("returns null when hidden and no seed", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            entity: { type: "opportunity", id: "opp-1" },
            header: { title: "Opp", subtitle: null, status: { renderAs: "hidden" }, status_can_mutate: false, oper_trust_preview: null },
        });
        expect(
            resolveOpportunityVmStatusLabel({
                drawerId: "opp-1",
                displayVm: vm,
            })
        ).toBeNull();
    });
});
