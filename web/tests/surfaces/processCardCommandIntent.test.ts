/**
 * Intent has to survive the trip from the card to the control.
 *
 * Warming a command on hover is worth exactly as much as the gesture that reaches the runtime. The
 * first cut of this wired `onIntent` on the Process card and read it in the renderer, and warmed
 * nothing at all: the adapter in between rebuilt each command and copied `onInvoke` but not
 * `onIntent`. Nothing failed — the card rendered, the commands executed — and the only symptom was
 * that every command still opened cold. Measured against the running app: hovering the Tour control
 * produced no network at all, and click→composer stayed at ~2.3s. With intent carried, hover starts
 * the prepare (`/api/admin/actions/execute`) and the same click→composer took ~0.8s.
 *
 * A silent drop of an optional callback is not something a type checker reports, so it is asserted.
 */

import { describe, expect, it } from "vitest";

import { adaptBusinessProcessEvidenceToProcessCard } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";
import type { ProcessCardActionInput } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";

function evidenceWith(actions: ProcessCardActionInput[]) {
    return adaptBusinessProcessEvidenceToProcessCard({
        // Only the command list matters here; the rest is the smallest evidence the adapter reads.
        evidence: {
            processName: "Enrollment",
            stageLabel: "Waitlist",
            stages: [],
            participants: [],
            stillNeeded: [],
            dueLine: null,
            headline: null,
        } as never,
        subjectLabel: null,
        activity: [],
        actions,
    });
}

describe("a command's intent reaches the control that renders it", () => {
    it("carries onIntent through the adapter, alongside onInvoke", () => {
        let warmed = 0;
        const out = evidenceWith([
            { key: "send_form", label: "Send form", onInvoke: () => {}, onIntent: () => { warmed += 1; } },
        ]);
        const action = out.actions.find((a) => a.key === "send_form");
        expect(action, "the command did not survive the adapter").toBeTruthy();
        expect(typeof action!.onIntent, "intent was dropped between card and control").toBe("function");
        action!.onIntent!();
        expect(warmed).toBe(1);
    });

    it("carries it for grouped commands too — Tour is where the slow prepare lives", () => {
        const seen: string[] = [];
        const out = evidenceWith([
            {
                key: "tour",
                label: "Tour",
                onIntent: () => seen.push("group"),
                menu: [
                    { key: "send_tour_invitation", label: "Send Tour Invitation", onIntent: () => seen.push("member") },
                ],
            },
        ]);
        const group = out.actions.find((a) => a.key === "tour");
        expect(group?.menu?.length).toBe(1);
        group!.onIntent!();
        group!.menu![0].onIntent!();
        expect(seen).toEqual(["group", "member"]);
    });

    it("leaves a command that warms nothing untouched", () => {
        const out = evidenceWith([{ key: "record_outcome", label: "Record outcome" }]);
        expect(out.actions.find((a) => a.key === "record_outcome")?.onIntent).toBeUndefined();
    });
});
