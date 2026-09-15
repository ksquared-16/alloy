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

export type FocusPanelOperationalProjection = {
    businessProcess: {
        evidence: BusinessProcessCardEvidence;
        /** Command descriptors with their verdicts. Handlers are bound by the renderer. */
        commands: ProcessCardCommandProjection;
    };
    currentWork: CurrentWorkViewModel;
};
