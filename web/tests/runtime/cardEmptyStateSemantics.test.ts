/**
 * POST-DEPLOYMENT REPAIR SLICE 3 — P0-3 / P0-4.
 *
 * Deployed staging reproduced the same degradation on both cards: a state that explained itself
 * ("This child has no active enrollment, so attendance cannot be recorded", "Physical / health
 * assessment — Missing") settled into a bare absence ("No attendance record.", "No health record.").
 * The operator watched Alloy lose knowledge it had just demonstrated.
 *
 * The cause is shared and it is a renderer defect, not a data one. `ProducerResult.state` already
 * distinguishes ready / unavailable / error / forbidden, and its contract says why that matters:
 * "`unavailable` and `error` are different facts … collapsing them would make an outage
 * indistinguishable from an empty one", and a refusal "must say 'you do not have permission' rather
 * than render an empty surface". Both cards were reducing that to `state === "ready" ? data : null`
 * and then printing one sentence for every remaining case.
 *
 * These locks hold the taxonomy at the renderer, where it was being thrown away.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ATT = join(process.cwd(), "components/admin/focusPanel/cards/AttendanceCard.tsx");
const HS = join(process.cwd(), "components/admin/focusPanel/cards/HealthSafetyCard.tsx");
const CONTRACT = join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract.ts");
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the taxonomy exists upstream and is not invented here", () => {
    it("the projection contract already declares all four producer states", () => {
        const code = read(CONTRACT);
        expect(code).toMatch(/ProducerState\s*=\s*"ready"\s*\|\s*"unavailable"\s*\|\s*"error"\s*\|\s*"forbidden"/);
        // Absent `cards` is provisioning, never absence — the rule the cards must not break.
        expect(code.replace(/\s+/g, " ")).toMatch(/"provisioning", never as "no attendance"/);
    });
});

describe("P0-3 — Attendance empty states are distinct", () => {
    const code = strip(read(ATT));

    it("carries the producer verdict instead of collapsing it", () => {
        expect(code).toMatch(/const producerState = provisioned\?\.state \?\? null;/);
    });

    it("a producer FAILURE is not rendered as absence", () => {
        expect(code).toMatch(/producerState === "error" \?/);
        expect(code).toMatch(/data-attendance-empty="error"/);
        expect(code).toMatch(/Attendance could not be loaded\./);
    });

    it("a REFUSAL is not rendered as absence", () => {
        expect(code).toMatch(/producerState === "forbidden" \?/);
        expect(code).toMatch(/data-attendance-empty="permission"/);
    });

    it("UNAVAILABLE is explained rather than printed as no-record", () => {
        expect(code).toMatch(/producerState === "unavailable" \?/);
        expect(code).toMatch(/data-attendance-empty="unavailable"/);
    });

    it("genuine absence keeps its own distinct state", () => {
        expect(code).toMatch(/data-attendance-empty="no-record"/);
        expect(code).toMatch(/No attendance record\./);
    });

    it("loading/provisioning still precedes every verdict", () => {
        expect(code).toMatch(/loading \|\| provisioning \?/);
        expect(code).toMatch(/data-attendance-empty="loading"/);
    });

    it("FORBIDDEN COLLAPSE LOCK: no single ternary prints one sentence for every non-ready state", () => {
        expect(code).not.toMatch(/loading \|\| provisioning \? "Loading the day…" : "No attendance record\."/);
    });

    it("an explanatory loaded state still suppresses invalid commands", () => {
        // A child with no attendable enrolment is explained by the loaded card, which offers no
        // command — the existing contract, unchanged by this slice.
        expect(code).toMatch(/vm\.unavailableReason/);
    });
});

describe("P0-4 — Health & Safety empty states are distinct", () => {
    const code = strip(read(HS));

    it("carries the producer verdict instead of collapsing it", () => {
        expect(code).toMatch(/const producerState = provisioned\?\.state \?\? null;/);
    });

    it("a producer FAILURE is not rendered as absence", () => {
        expect(code).toMatch(/producerState === "error" \?/);
        expect(code).toMatch(/data-health-empty="error"/);
    });

    it("UNAVAILABLE is explained rather than printed as no-record", () => {
        expect(code).toMatch(/producerState === "unavailable" \?/);
        expect(code).toMatch(/data-health-empty="unavailable"/);
    });

    it("a REFUSAL keeps its existing permission state", () => {
        expect(code).toMatch(/denied \?/);
        expect(code).toMatch(/data-health-empty="permission"/);
        expect(code).toMatch(/provisioned\?\.state === "forbidden"/);
    });

    it("required-information meaning survives — the unavailableReason branch is untouched", () => {
        expect(code).toMatch(/vm\?\.unavailableReason \?/);
        expect(code).toMatch(/data-health-empty="unavailable"/);
    });

    it("genuine absence keeps its own distinct state", () => {
        expect(code).toMatch(/data-health-empty="no-record"/);
    });

    it("FORBIDDEN COLLAPSE LOCK: no single ternary prints one sentence for every non-ready state", () => {
        expect(code).not.toMatch(
            /loading \|\| provisioning \? "Loading health information…" : "No health record\."/,
        );
    });
});

describe("shared guards", () => {
    it("neither card gained a fetch, a cache or a second readiness source", () => {
        for (const p of [ATT, HS]) {
            const code = read(p);
            expect(code, `${p}: no new cache`).not.toContain("new Map(");
            expect(code, `${p}: no timer-based readiness`).not.toContain("setTimeout(");
        }
    });

    it("neither card pins a previous subject — both still clear on subject change", () => {
        for (const p of [ATT, HS]) {
            const code = strip(read(p));
            // The projection effect sets the vm from THIS subject's projection, or null. No retention.
            expect(code).toMatch(/setVm\(provisioned\?\.state === "ready" \? provisioned\.data : null\)/);
        }
    });

    it("subject identity still comes from the scoped participant, not the household", () => {
        for (const p of [ATT, HS]) {
            expect(strip(read(p))).toMatch(/const memberId = scope\?\.customerMemberId \?\? null;/);
        }
    });
});
