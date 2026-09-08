// @vitest-environment jsdom
/**
 * THE LOOP THAT MADE EVERY OVERLAY IN THE FOCUS PANEL CRASH.
 *
 * `OpportunityFocusPanelBody` reports the settled participant scope up to its parent, which
 * stores it in state. The parent builds `commitCritical` and `enriched` for the body while it
 * renders. So reporting by object identity closed a circuit:
 *
 *   report -> parent setState -> parent re-render -> new commitCritical/enriched
 *          -> new `model` -> effect fires -> report ...
 *
 * Nothing about the subject changed on any lap; only references did. It ran continuously and
 * silently, because React schedules those updates rather than blocking on them. It became fatal
 * only when a Radix overlay mounted inside the subtree: the overlay's own commit-phase ref and
 * focus updates nest inside the ones already in flight, and the total crosses React's
 * update-depth limit — which is why Tour, Recent activity and Manage all died the same way.
 *
 * These tests hold the invariant that terminates it: a scope is reported when its VALUE changes,
 * never when its object identity does.
 */
import { useEffect, useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

import { sameParticipantScope } from "@/components/admin/focusPanel/OpportunityFocusPanelBody";
import type { OperationalParticipantScope } from "@/lib/adminV2/runtime/operationalContext/types";

const scope = (over: Partial<OperationalParticipantScope> = {}): OperationalParticipantScope => ({
    participationId: "ocm-1",
    customerMemberId: "cm-1",
    personId: "p-1",
    displayName: "Test Process4",
    imageUrl: null,
    stageKey: "waitlist",
    stageLabel: "Waitlist",
    ...over,
});

beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
});

describe("participant scope equality", () => {
    it("treats a rebuilt object with identical fields as the same scope", () => {
        expect(sameParticipantScope(scope(), scope())).toBe(true);
        expect(sameParticipantScope(null, null)).toBe(true);
    });

    it("reports null and a scope as different, in both directions", () => {
        // Clearing a scope is a real report: it is what stops the previous child's avatar from
        // outliving them in the header.
        expect(sameParticipantScope(null, scope())).toBe(false);
        expect(sameParticipantScope(scope(), null)).toBe(false);
    });

    it("distinguishes every field, so no change can pass as equal", () => {
        const fields: Array<[keyof OperationalParticipantScope, string | null]> = [
            ["participationId", "ocm-2"],
            ["customerMemberId", "cm-2"],
            ["personId", "p-2"],
            ["displayName", "Someone Else"],
            ["imageUrl", "https://example.test/a.png"],
            ["stageKey", "enrolled"],
            ["stageLabel", "Enrolled"],
        ];
        for (const [field, value] of fields) {
            expect(
                sameParticipantScope(scope(), scope({ [field]: value } as Partial<OperationalParticipantScope>)),
                `${String(field)} must be compared`,
            ).toBe(false);
        }
    });
});

/**
 * The circuit itself, reproduced at its own shape: a parent that rebuilds the child's props on
 * every render and stores what the child reports back. This is the Focus Panel's arrangement
 * with everything else stripped away.
 */
function LoopHarness(props: { guard: boolean; renders: { count: number }; cap: number }) {
    const [stored, setStored] = useState<OperationalParticipantScope | null>(null);
    props.renders.count += 1;
    // The parent rebuilds this every render — exactly what the inline `commitCritical` and
    // `enriched` object literals used to do.
    const model = { context: { participantScope: scope() }, stored };
    if (props.renders.count > props.cap) return null;
    return <ReportingChild model={model} guard={props.guard} onScope={setStored} />;
}

function ReportingChild(props: {
    model: { context: { participantScope: OperationalParticipantScope } };
    guard: boolean;
    onScope: (s: OperationalParticipantScope | null) => void;
}) {
    const { model, guard, onScope } = props;
    const reported = useRef<OperationalParticipantScope | null | undefined>(undefined);
    useEffect(() => {
        const next = model.context.participantScope;
        if (guard && reported.current !== undefined && sameParticipantScope(reported.current, next)) return;
        reported.current = next;
        onScope(next);
    }, [model, guard, onScope]);
    return null;
}

describe("the report does not drive the parent in a circle", () => {
    const mount = (guard: boolean) => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        const renders = { count: 0 };
        act(() => root!.render(<LoopHarness guard={guard} renders={renders} cap={400} />));
        return renders;
    };

    it("settles when the scope is reported by value", () => {
        const renders = mount(true);
        // Mount, plus the single re-render for the one real report. Never a stream of them.
        expect(renders.count).toBeLessThanOrEqual(3);
    });

    it("would not settle if it were reported by identity", () => {
        // The control. Without the guard the same arrangement re-renders without limit — this is
        // the defect, held here so a future change cannot quietly reintroduce it and still pass.
        const renders = mount(false);
        expect(renders.count).toBeGreaterThan(50);
    });
});
