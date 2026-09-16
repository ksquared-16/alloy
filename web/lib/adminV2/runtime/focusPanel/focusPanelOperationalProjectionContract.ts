/**
 * THE SHARED SHAPE OF THE SERVER'S OPERATIONAL PROJECTION — types only, no runtime.
 *
 * Split from `focusPanelOperationalProjection.ts` because that module is `server-only` and this
 * contract is named by `OperationalContext`, which the cards import. A `server-only` module reached
 * from client code fails the build, and the fix is not to weaken the server boundary: it is to let
 * the CONTRACT cross while the IMPLEMENTATION stays put.
 *
 * Both transport frames — the provisioning answer at commit, the drawer VM once settled — carry
 * this same shape, so the browser consumes one contract regardless of which frame is current.
 *
 * Every member is an existing canonical type. This is an envelope, not a model.
 */

import type { BusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import type { ProcessCardCommandProjection } from "@/lib/adminV2/runtime/focusPanel/businessProcess/projectProcessCardCommands";
import type { CurrentWorkViewModel } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import type { AttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import type { HealthSafetyCardVM } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";

export type FocusPanelOperationalProjection = {
    businessProcess: {
        evidence: BusinessProcessCardEvidence;
        /** Command descriptors with their verdicts. Handlers are bound by the renderer. */
        commands: ProcessCardCommandProjection;
    };
    currentWork: CurrentWorkViewModel;
    /**
     * The cards that need their own read, produced inside this same lifecycle.
     *
     * Absent on a frame that projected before the producers ran — the browser treats that as
     * "provisioning", never as "no attendance". Each carries its own readiness so one failure is
     * bounded to one card.
     */
    cards?: FocusPanelCardProducerResults | null;
};

/**
 * One producer's outcome, in the root's vocabulary rather than the card's.
 *
 * `unavailable` and `error` are different facts: no subject to read for is ordinary, a failed read
 * is not, and collapsing them would make an outage indistinguishable from an empty one.
 *
 * `forbidden` is the third: the caller may not see this data. It is NOT `unavailable`, because the
 * card must say "you do not have permission" rather than render an empty surface that reads as "no
 * allergies" — the health endpoint's own reasoning, and the card already renders that refusal. A
 * `forbidden` result carries `data: null`, so nothing the caller may not see crosses the wire.
 */
export type ProducerState = "ready" | "unavailable" | "error" | "forbidden";

export type ProducerResult<T> = { state: ProducerState; data: T | null };

/**
 * DECLARED HERE, NOT IN THE PRODUCER MODULE — and this was learned twice.
 *
 * `focusPanelCardProducers` imports `buildAttendanceCardVM` as a VALUE, and that module is
 * `server-only`. A contract the cards import must not have an edge to it: the first time this
 * happened the whole Focus Panel failed to parse while every required check stayed green.
 *
 * The VM types are reached by `import type` alone, which TypeScript erases — the same way
 * `AttendanceCard` has always named them.
 */
export type FocusPanelCardProducerResults = {
    attendance: ProducerResult<AttendanceCardVM>;
    health: ProducerResult<HealthSafetyCardVM>;
};
