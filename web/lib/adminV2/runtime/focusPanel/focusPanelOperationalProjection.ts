/**
 * THE OPERATIONAL PROJECTION CHOKEPOINT — one place the Focus Panel's projections are computed.
 *
 * ── WHAT THIS CHANGES, AND WHAT IT DOES NOT ──
 *
 * It changes WHERE projection runs. It does not change what projection means: every function called
 * here is the existing canonical owner, called with the existing arguments, returning the existing
 * type. There is no V2 model and no second algorithm — a duplicate would be a second authority, and
 * the whole point is to end up with one.
 *
 * ── WHY IT CAN LIVE ON THE SERVER AT ALL ──
 *
 * `buildBusinessProcessCardEvidence`, `projectProcessCardCommands` and `projectCurrentWork` carry no
 * `"use client"` and no browser import. They already execute under vitest's `environment: "node"` in
 * suites that predate this module, which is the proof: they were never client code, they were merely
 * being *called* from the client.
 *
 * ── THE BOUNDARY, AND WHY IT SITS HERE ──
 *
 * Two things the card does are genuinely the browser's and stay there:
 *
 *   activity preview   formatted against the VIEWER's timezone (`useAdminViewerTimezone`), which the
 *                      server does not know and must not guess
 *   action handlers    `onInvoke` / `onIntent` are functions; they cannot cross a wire, and binding
 *                      them is presentation wiring rather than a decision about what may run
 *
 * Everything that DECIDES — which stage, which work, which commands, in what order, executable or
 * not — is here. `ProcessCardCommandProjection` already carries each command's `status` and
 * `unavailableReason`, so the browser binds a handler to a verdict it did not make.
 *
 * ── WHAT IT IS NOT, YET ──
 *
 * Nothing calls this from the provisioning answer at the time of writing. Attaching it while the
 * cards still project for themselves would ADD its bytes to a payload that already carries the raw
 * inputs — the answer would grow, and two projection authorities would exist at once. So the wiring
 * and the client cutover land together, and this module exists first to be proven against the path
 * it replaces.
 */

/*
 * NO `server-only` MARKER, DELIBERATELY — and this was learned the hard way.
 *
 * C1 added one to express intent. It took the whole Focus Panel down: this module is reached from
 * shared graphs that the client also imports, and a `server-only` module anywhere in that graph
 * fails the Ecmascript parse with "Error: ./…focusPanelOperationalProjection.ts:40 import
 * server-only". Neither typecheck graph sees it and no required check caught it; the panel simply
 * did not render.
 *
 * The marker was never earning anything here. This module holds pure computation — no secrets, no
 * database, no request. What makes the projection server-OWNED is that the two producers are the
 * only callers, and that is enforced by the tests below it, not by a bundler directive that can
 * break the product.
 */
import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { projectProcessCardCommands } from "@/lib/adminV2/runtime/focusPanel/businessProcess/projectProcessCardCommands";
import { projectCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import type { FocusPanelOperationalProjection } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/*
 * The shape lives in `focusPanelOperationalProjectionContract` so `OperationalContext` — which the
 * cards import — can name it without reaching a `server-only` module. Re-exported here so callers
 * of the implementation get the type from the same place they get the function.
 */
export type { FocusPanelOperationalProjection } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";

export type FocusPanelOperationalProjectionInput = {
    context: OperationalContext;
    /**
     * Which participant the operator is currently concerned with. Absent is ordinary and means no
     * emphasis — never "pick one". Carried through unchanged from the card's own call.
     */
    selectedParticipantId?: string | null;
};

/**
 * Run the canonical Focus Panel projections once, server-side. PURE with respect to its context.
 *
 * Order is deliberate but not load-bearing: `projectProcessCardCommands` internally projects current
 * work to resolve its buttons, so the two share a derivation today. Calling them separately is
 * exactly what the client does, and keeping that identical is what makes parity provable rather
 * than argued.
 */
export function projectFocusPanelOperational(
    input: FocusPanelOperationalProjectionInput,
): FocusPanelOperationalProjection {
    const { context, selectedParticipantId = null } = input;
    return {
        businessProcess: {
            evidence: buildBusinessProcessCardEvidence(context, { selectedParticipantId }),
            commands: projectProcessCardCommands(context),
        },
        currentWork: projectCurrentWork(context),
    };
}
