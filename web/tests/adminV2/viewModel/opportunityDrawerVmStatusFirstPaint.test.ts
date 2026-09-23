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

    it("reports UNKNOWN rather than the queue seed when the VM is not yet applied", () => {
        /*
         * This used to return the seed. The seed is the queue row's configured `status` DISPLAY
         * slot, which is bound per work unit — on `new-leads` it resolves to the process stage —
         * so returning it answered a STATUS question with whatever that slot happened to hold, and
         * the owner then corrected the rendered chip after the frame was complete (measured 14/14
         * on deployed staging). Null here means UNKNOWN and the header reserves the chip.
         */
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
        ).toBeNull();
    });

    it("never returns the seed even when there is no VM at all", () => {
        expect(
            resolveOpportunityVmStatusLabel({
                drawerId: "opp-1",
                displayVm: null,
                queueSeedStatusLabel: "Lead",
            })
        ).toBeNull();
    });

    it("reports UNKNOWN, not the seed, when the owner renders the status hidden", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            entity: { type: "opportunity", id: "opp-1" },
            header: { title: "Opp", subtitle: null, status: { renderAs: "hidden" }, status_can_mutate: false, oper_trust_preview: null },
        });
        expect(
            resolveOpportunityVmStatusLabel({
                drawerId: "opp-1",
                displayVm: vm,
                queueSeedStatusLabel: "Lead",
            })
        ).toBeNull();
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
