import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import { resolveCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { SEND_ENROLLMENT_PAPERWORK_ACTION_KEY } from "@/lib/adminV2/actions/definitions/sendEnrollmentPaperworkAction";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

/**
 * REGISTERED IN FOUR PLACES AND STILL NOT HOSTABLE.
 *
 * `enrollment.send_paperwork` was a RegisteredAction, a capability-registry entry and a platform
 * catalog entry, and the surface that renders it resolved "unsupported" — because
 * `resolveCurrentWorkActionSurface` asks `canonicalActionDefinition`, which is derived from
 * `ACTION_BUTTON_LIBRARY`, and the action was not in it. Measured on the child's Enrolling card
 * under revision 35: the primary action carried the right key, label and ref and
 * `status: "configuration_error"` with `unsupported_capability`, so the card withheld it and
 * reported drift.
 */

const action = (over: Partial<CurrentWorkActionVM> = {}): CurrentWorkActionVM =>
    ({
        key: SEND_ENROLLMENT_PAPERWORK_ACTION_KEY,
        label: "Send enrollment paperwork",
        category: "primary",
        placement: "current_work_primary",
        handlerKey: SEND_ENROLLMENT_PAPERWORK_ACTION_KEY,
        actionRef: SEND_ENROLLMENT_PAPERWORK_ACTION_KEY,
        ...over,
    }) as CurrentWorkActionVM;

describe("the send capability is hostable where it is configured", () => {
    it("has a canonical definition, which is what declares a host at all", () => {
        const def = canonicalActionDefinition(SEND_ENROLLMENT_PAPERWORK_ACTION_KEY);
        expect(def, "no canonical definition — the runtime has no host to resolve").toBeTruthy();
        expect(def?.runtimeWired).toBe(true);
    });

    it("declares the composer as its host — never a header delegate", () => {
        const def = canonicalActionDefinition(SEND_ENROLLMENT_PAPERWORK_ACTION_KEY);
        // The action PREPARES a draft; the operator confirms the send. A header delegate would
        // fabricate a registry execute and send a family their paperwork with no confirmation.
        expect(def?.interactionHost).toBe("communications_composer");
        expect(def?.category).toBe("communication");
    });

    it("resolves to the composer surface from Current Work", () => {
        expect(resolveCurrentWorkActionSurface(action())).toBe("communications_composer");
    });

    it("is executable rather than a configuration error", () => {
        const execution = resolveCurrentWorkActionExecution(action());
        expect(execution.status, JSON.stringify(execution.blockers)).toBe("executable");
        expect(execution.blockers).toEqual([]);
    });

    it("a blocked action still reports its reason rather than claiming executable", () => {
        const execution = resolveCurrentWorkActionExecution(
            action({ disabled: true, disabledReason: "No parent has an email address." } as Partial<CurrentWorkActionVM>),
        );
        expect(execution.status).toBe("blocked");
        expect(execution.blockers[0]?.message).toContain("email");
    });

    it("the library entry carries the host, not a key the runtime would have to recognise", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/admin/actions/actionDefinitionRegistry.ts"),
            "utf8",
        );
        const i = src.indexOf('key: "enrollment.send_paperwork"');
        expect(i, "the action is absent from ACTION_BUTTON_LIBRARY").toBeGreaterThan(-1);
        const entry = src.slice(i, i + 700);
        expect(entry).toContain('interactionHost: "communications_composer"');
        expect(entry).not.toContain('interactionHost: "header_delegate"');
    });
});
