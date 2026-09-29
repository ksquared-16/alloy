/**
 * THE OPERATOR HAD NO WAY TO SEND A FAMILY THEIR PAPERWORK.
 *
 * Measured on deployed staging against the real configured Enrollment packet: the Process Card
 * offered "Send enrollment paperwork", clicking it answered "This action cannot be run from What's
 * Next — use drawer header actions", and the drawer header's eleven actions did not include it. So
 * the product pointed the operator at a host that does not carry the command, and the launch was
 * unreachable from anywhere in the UI.
 *
 * The cause was metadata, not logic: `send_enrollment_packet` declared no `interactionHost`, so
 * `resolveCurrentWorkActionSurface` fell past the category branches to the `header_delegate`
 * default. Exactly the defect already repaired for `stage_work.start`.
 *
 * ── WHY THIS ONE IS REVIEWED AND THAT ONE IS NOT ──
 *
 * "Nothing left to collect" and "safe to do without looking" are different claims. Starting a piece
 * of stage work is local and undoable; sending a family their enrolment paperwork is not — they
 * receive it. So this capability declares a BODY, and the command surface shows the child, the
 * recipient and the requirement set before anything is sent.
 */
import { describe, expect, it } from "vitest";

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

const KEY = "send_enrollment_packet";

function action(key: string, over: Partial<CurrentWorkActionVM> = {}): CurrentWorkActionVM {
    return {
        key,
        label: "Send enrollment paperwork",
        category: "primary",
        status: "executable",
        resolved: true,
        ...over,
    } as CurrentWorkActionVM;
}

describe("send_enrollment_packet interaction host", () => {
    it("is registered with the command surface, not the record header", () => {
        const canonical = canonicalActionDefinition(KEY);
        expect(canonical, "the capability must be canonical for the host to be read at all").toBeTruthy();
        expect(canonical?.interactionHost).toBe("command_surface");
    });

    it("resolves to the command surface from What's Next", () => {
        // The measured regression: this returned "header_delegate", and the header carries no such
        // command, so the operator reached a dead end.
        expect(resolveCurrentWorkActionSurface(action(KEY))).toBe("command_surface");
        expect(resolveCurrentWorkActionSurface(action(KEY))).not.toBe("header_delegate");
    });

    it("declares a review body, so confirming is not the same click as invoking", () => {
        expect(canonicalActionDefinition(KEY)?.commandSurfaceBody).toBe("enrollment_packet");
    });
});

describe("what the repair must not have changed", () => {
    it("leaves stage_work.start on the command surface with no review body", () => {
        const canonical = canonicalActionDefinition("stage_work.start");
        expect(canonical?.interactionHost).toBe("command_surface");
        // It runs immediately, and must keep doing so: its inputs are bound and its effect is local.
        expect(canonical?.commandSurfaceBody).toBeUndefined();
    });

    it("leaves a communications capability on its composer", () => {
        expect(resolveCurrentWorkActionSurface(action("quick_message", { category: "supporting" })))
            .toBe("communications_composer");
    });
});
