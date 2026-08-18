/**
 * The deterministic participant journey, certified before AI is even asked for.
 *
 * Four product defects came out of Director QA, and each had a cause worth naming:
 *
 *  1. Correcting a date of birth offered a generic text box — the confirm control carried no typed
 *     correction at all, so "Change" could only ever be free text.
 *  2. Every answer REPLACED the surface, so a short conversation read as an interrogation.
 *  3. Confirming waited on a full server round trip before anything moved.
 *  4. "Please review and finish it below" appeared with nothing below.
 *
 * (4) is the one worth reading twice. The turn selector skips needs that do not require participant
 * action, so an OPTIONAL missing fact left the turn at `complete_artifact` while the phase — derived
 * separately from `missing.length` — still said `shared_collection`. The card reads the turn and
 * offered the handoff; the host reads the phase and suppressed the artifact. Two readers of one
 * situation, asking different questions, and the parent got a heading with a void beneath it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { controlForTurn, valueControlForTurn } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";

const read = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function turn(over: Record<string, unknown> = {}) {
    return {
        kind: "confirm_known_value",
        prompt: "",
        proposed_value: "2022-08-18",
        resolves_occurrences: 1,
        input_type: "date",
        label: "Child Dob",
        options: [] as string[],
        optional: false,
        ...over,
    } as never;
}

function objective(over: Record<string, unknown> = {}) {
    return {
        stage_key: "enrolling",
        progress: { total_requirements: 1, satisfied_requirements: 0, remaining_requirements: 1 },
        needs: { needs_requiring_action: 1, total_needs: 3, needs: [] },
        known_requiring_confirmation: [],
        missing: [],
        artifact_specific: [],
        next_turn: { kind: "confirm_known_value", need: null, prompt: "", proposed_value: "2022-08-18", resolves_occurrences: 1 },
        ...over,
    } as never;
}

describe("1. typed controls, including the correction path", () => {
    it("a confirm turn carries the AUTHORED control for its correction", () => {
        const control = controlForTurn(turn());
        expect(control.kind).toBe("choice_or_text");
        if (control.kind !== "choice_or_text") return;
        // "Change" used to lead to a free-text box. It now leads to the same control the Form uses.
        expect(control.correction).toMatchObject({ kind: "value", inputType: "date" });
    });

    it("every authored type gets its own control, with no generic fallback", () => {
        const cases: [string, Record<string, unknown>][] = [
            ["date", { kind: "value", inputType: "date" }],
            ["email", { kind: "value", inputType: "email" }],
            ["phone", { kind: "value", inputType: "tel" }],
            ["number", { kind: "value", inputType: "number" }],
            ["boolean", { kind: "boolean" }],
            ["textarea", { kind: "value", inputType: "text", multiline: true }],
        ];
        for (const [authored, expected] of cases) {
            expect(valueControlForTurn(turn({ input_type: authored })), authored).toMatchObject(expected);
        }
        expect(valueControlForTurn(turn({ input_type: "select", options: ["AM", "PM"] }))).toMatchObject({
            kind: "options",
            options: ["AM", "PM"],
        });
        expect(
            valueControlForTurn(turn({ input_type: "multiselect", options: ["A", "B"] })),
        ).toMatchObject({ kind: "options", multiple: true });
    });

    it("an invalid date cannot be submitted", () => {
        const card = code("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        // The control refuses anything that is not a real calendar date — "2022-02-31" round-trips
        // through Date and comes back as March, so the ISO comparison rejects it.
        expect(card).toContain("d.toISOString().slice(0, 10) === raw.trim()");
        expect(card).toContain("disabled={busy || !ready}");
    });

    it("signature stays with the Forms authority — the runtime renders no signature control", () => {
        const card = code("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        expect(card).not.toContain("signature");
    });
});

describe("2 + 3. a continuous surface, and immediate acknowledgement", () => {
    it("settled facts stay on screen instead of being replaced", () => {
        const card = code("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        expect(card).toContain('data-participant-settled="true"');
        expect(card).toContain("setSettled((prev) => [...prev,");
    });

    it("confirming resolves the section before the request returns, and rolls back if refused", () => {
        const card = code("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        // Optimism is presentation only — nothing claims persistence, and a refusal removes it.
        expect(card).toContain("settledAs");
        expect(card).toContain("setSettled((prev) => prev.slice(0, -1))");
        expect(card).not.toContain("Saving");
    });

    it("Change is a local transition, not a server turn", () => {
        const card = code("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        expect(card).toContain("onClick={() => setCorrecting(true)}");
    });
});

describe("5. review is impossible without an artifact", () => {
    it("phase comes from the turn — one authority, so the two cannot disagree", () => {
        expect(participantObjectiveWireModel(objective()).phase).toBe("shared_collection");
        expect(
            participantObjectiveWireModel(
                objective({ next_turn: { kind: "complete_artifact", need: null, prompt: "", proposed_value: null, resolves_occurrences: 0 } }),
            ).phase,
        ).toBe("artifact_review");
        expect(
            participantObjectiveWireModel(
                objective({ next_turn: { kind: "complete", need: null, prompt: "", proposed_value: null, resolves_occurrences: 0 } }),
            ).phase,
        ).toBe("complete");
    });

    it("an OPTIONAL missing need can no longer split the two readers apart", () => {
        // The exact QA state: the turn has moved on, one optional fact is unanswered. Under the old
        // derivation this was `shared_collection` + a handoff card = the empty review screen.
        const wire = participantObjectiveWireModel(
            objective({
                missing: [{ optional: true }],
                next_turn: { kind: "complete_artifact", need: null, prompt: "", proposed_value: null, resolves_occurrences: 0 },
            }),
        );
        expect(wire.phase).toBe("artifact_review");
    });

    it("the host refuses to promise an artifact it cannot render", () => {
        const host = code("app/forms/embed/[token]/FormEmbedClient.tsx");
        expect(host).toContain("artifactRenderable");
        expect(host).toContain("reviewWithoutArtifact");

        const card = code("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        // Truthful and recoverable — never a cheerful heading over a void.
        expect(card).toContain('control.kind === "handoff" && !artifactRenderable');
        expect(card).toContain("no paperwork to complete here yet");
    });
});
