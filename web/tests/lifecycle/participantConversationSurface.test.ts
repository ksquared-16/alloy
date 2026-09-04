/**
 * Participant Runtime V1.2 — the public conversational surface.
 *
 * The presentation layer is pure and is tested directly: what control a turn needs, what the parent
 * is told about progress, and what they are told when an answer could not be read. The component
 * itself is asserted by source inspection for the two properties that must hold no matter how it is
 * styled — it sends only words, and it names no internal vocabulary.
 *
 * Source inspection is used deliberately and narrowly. "The browser cannot send a field key" is a
 * claim about what the code CAN do, not about what one rendered interaction happened to do, and a
 * DOM test that clicked a button would prove the weaker thing.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
    controlForTurn,
    progressLine,
    PARTICIPANT_CLARIFICATION_MESSAGE,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

const COMPONENT_SOURCE = readFileSync(
    join(process.cwd(), "app/forms/embed/[token]/EnrollmentConversationCard.tsx"),
    "utf8",
);

/**
 * The component with COMMENTS REMOVED.
 *
 * These controls assert what the component can DO, and a doc comment explaining that the provider is
 * deliberately invisible is not a provider call. Scanning raw source made the file's own explanation
 * of its boundary trip the boundary check — which would push a future author toward deleting the
 * explanation rather than keeping the property.
 */
const COMPONENT = COMPONENT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function wire(overrides: Partial<ParticipantObjectiveWire> = {}): ParticipantObjectiveWire {
    return {
        stage_key: "enrollment",
        subject_display_name: "Ada",
        phase: "shared_collection",
        progress: { total: 2, satisfied: 0, remaining: 2 },
        things_remaining: 2,
        // The PARTICIPANT's own denominator, distinct from the requirement rollup above it.
        work: { total: 3, settled: 1, remaining: 2, percent: 33 },
        next_turn: {
            kind: "confirm_known_value",
            prompt: "We have Date of Birth as 2021-05-04. Is that correct?",
            proposed_value: "2021-05-04",
            resolves_occurrences: 5,
            input_type: "date",
            label: "Date of Birth",
            options: [],
            optional: false,
            field_ids: [],
            // next_turn requires these three. editor and party are
            // nullable and evidence is a list, so the empty shape is
            // exact rather than a placeholder.
            editor: null,
            party: null,
            evidence: [],
        },
        // No question outstanding — the ordinary case.
        // ParticipantObjectiveWire requires both. They are lists, so empty is
        // the exact shape for a fixture with no settled or collected facts.
        settled: [],
        collected: [],
        pending_clarification: null,
        complete: false,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// 2, 4, 5. The prompt and its controls
// ---------------------------------------------------------------------------

describe("turn rendering", () => {
    it("4. a confirm turn offers quick Yes/No AND free text", () => {
        const control = controlForTurn(wire().next_turn);
        expect(control.kind).toBe("choice_or_text");
        if (control.kind !== "choice_or_text") return;
        expect(control.affirm).toContain("Yes");
        // "Change" — a correction is not a denial, and the button leads to a TYPED control.
        expect(control.deny).toBe("Change");
        expect(control.correction).toMatchObject({ kind: "value", inputType: "date" });
    });

    it("5. a collect turn gets a field-appropriate deterministic input", () => {
        // The AUTHORED control now reaches the wire — `input_type` used to be the constant "text"
        // for every need, which is why label-sniffing was the only signal and why a date of birth
        // arrived as a plain box. An authored type is a decision and leads; the label is consulted
        // only when the form carries no usable type.
        const authored: [string, string][] = [
            ["date", "date"],
            ["email", "email"],
            ["phone", "tel"],
            ["text", "text"],
        ];
        for (const [hint, expected] of authored) {
            const control = controlForTurn({
                ...wire().next_turn,
                kind: "collect_missing_value",
                proposed_value: null,
                input_type: hint,
                label: "Date of Birth",
            });
            expect(control.kind).toBe("value");
            if (control.kind !== "value") continue;
            expect(control.inputType, `authored ${hint} must win`).toBe(expected);
        }

        // Fallback, for older forms whose fields carry no type at all.
        const sniffed = controlForTurn({
            ...wire().next_turn,
            kind: "collect_missing_value",
            proposed_value: null,
            input_type: null,
            label: "Date of Birth",
        });
        expect(sniffed).toMatchObject({ kind: "value", inputType: "date" });
    });

    it("13. an artifact turn hands off rather than duplicating Form controls", () => {
        const control = controlForTurn({ ...wire().next_turn, kind: "complete_artifact" });
        expect(control.kind).toBe("handoff");
        // No input is offered — the Form owns review, signatures and legal acknowledgments.
        expect(control).not.toHaveProperty("inputType");
    });

    it("a completed objective renders done, not an empty question", () => {
        expect(controlForTurn({ ...wire().next_turn, kind: "complete" }).kind).toBe("done");
    });

    it("rendering never consults a provider — the component imports no Trust or AI module", () => {
        // The accurate property. A blunt substring scan flagged `participantObjectiveWireModel`
        // for containing "model", which is an import name rather than a provider call — and a
        // control that fires on a legitimate identifier trains people to weaken it.
        const imports = [...COMPONENT.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
        for (const path of imports) {
            expect(path.startsWith("@/lib/trust")).toBe(false);
            expect(path.startsWith("@/lib/ai")).toBe(false);
        }
        // And no governed-execution symbol is referenced by any name.
        for (const symbol of [
            "interpretParticipantResponseViaTrust",
            "executeDecisionContract",
            "executeGovernedProviderReasoning",
            "DecisionPackage",
        ]) {
            expect(COMPONENT).not.toContain(symbol);
        }
    });
});

// ---------------------------------------------------------------------------
// 3. Progress, from the deterministic projection only
// ---------------------------------------------------------------------------

describe("3. progress is deterministic and truthful", () => {
    it("counts things still requiring the participant, not requirements", () => {
        // Parent-centric wording: these are questions left to answer, not Form controls. The old
        // "8 to add · 1 to sign or upload" described the implementation to someone who cannot see it.
        // Subtle, conversational, and never a stepper — "Step 2 of 3" describes the machine's plan.
        expect(progressLine(wire({ things_remaining: 3 }))).toBe("Just 3 things left");
        expect(progressLine(wire({ things_remaining: 1 }))).toBe("Just one more thing");
    });

    it("offers no percentage over a denominator a parent cannot see", () => {
        // The requirement total legitimately includes unrealized and unsupported items, so a
        // percentage over it would move for invisible reasons.
        const line = progressLine(wire({ progress: { total: 9, satisfied: 1, remaining: 8 } }));
        expect(line).not.toMatch(/%/);
    });

    it("says done when the objective is complete", () => {
        expect(progressLine(wire({ complete: true }))).toContain("All done");
    });

    it("progress comes from the wire model, which withholds internal identifiers", () => {
        const objective = {
            process_instance_id: "pi-secret",
            session_id: "session-secret",
            business_process_revision_id: "rev-secret",
            stage_key: "enrollment",
            progress: { total_requirements: 2, satisfied_requirements: 1, remaining_requirements: 1 },
            needs: { needs_requiring_action: 1, needs: [] },
            next_turn: { kind: "complete", need: null, prompt: "x", proposed_value: null, resolves_occurrences: 0 },
        } as never;
        const serialized = JSON.stringify(participantObjectiveWireModel(objective));
        for (const secret of ["pi-secret", "session-secret", "rev-secret"]) {
            expect(serialized).not.toContain(secret);
        }
    });
});

// ---------------------------------------------------------------------------
// 14. The browser cannot redirect authority
// ---------------------------------------------------------------------------

describe("14. the browser sends words, never authority", () => {
    it("the request body carries only words, a value, or a bare intent", () => {
        /*
         * `decline` joined `text` and `value` when leaving a question blank stopped being a value.
         * It names no field, no need and no target — the server decides whether the current turn may
         * be declined — so the vocabulary widened without the browser gaining anything to claim.
         *
         * `confirmGroup` and `editFact` joined it on the same terms when known facts began being
         * confirmed by subject. `confirmGroup` is a bare flag: the server re-derives which facts the
         * card held. `editFact` carries an OPAQUE handle the server itself issued moments earlier,
         * and matches it against the card it is currently offering — so it addresses a fact without
         * being able to name one, and a handle for anything else is refused.
         */
        const bodyKeys = [...COMPONENT.matchAll(/submit\(\{\s*([a-zA-Z_]+)/g)].map((m) => m[1]);
        expect(new Set(bodyKeys)).toEqual(
            new Set(["text", "value", "decline", "confirmGroup", "editFact", "party"]),
        );
        // The handle is passed straight through from the server's own payload — never composed in
        // the browser out of anything the parent or the DOM could supply.
        for (const call of COMPONENT.match(/editFact: \{[^}]*\}/g) ?? []) {
            expect(call).toMatch(/^editFact: \{ ref, value \}$/);
        }
    });

    it("no authority-bearing identifier appears anywhere in the component", () => {
        for (const forbidden of [
            "field_key",
            "requirement_id",
            "semantic_key",
            "stage_key",
            "process_instance_id",
            "session_id",
            "command",
        ]) {
            expect(COMPONENT).not.toContain(forbidden);
        }
    });

    it("it posts to the existing participant endpoint, not a new API family", () => {
        expect(COMPONENT).toContain("/api/public/forms/");
        expect(COMPONENT).toContain("enrollment-turn");
    });
});

// ---------------------------------------------------------------------------
// 9, 15. Duplicate submit and product language
// ---------------------------------------------------------------------------

describe("9. duplicate submit is prevented at the request, not just the button", () => {
    it("an in-flight ref guards the handler synchronously", () => {
        // A disabled button is an affordance; a keyboard repeat can still fire before React
        // re-renders, so the guard has to be checked before the fetch.
        expect(COMPONENT).toContain("inFlight.current");
        expect(COMPONENT).toMatch(/if \(inFlight\.current\) return;/);
    });

    it("controls are disabled while a request is pending", () => {
        expect(COMPONENT).toContain("disabled={busy}");
    });

    it("a pending state is announced for assistive technology", () => {
        expect(COMPONENT).toContain('aria-live="polite"');
    });
});

describe("15. provider failure never leaks internal vocabulary", () => {
    it("the participant sees product language only", () => {
        expect(PARTICIPANT_CLARIFICATION_MESSAGE).toContain("didn't catch that");
        for (const internal of [
            "REASONING_UNABLE",
            "Trust",
            "provider",
            "decision class",
            "privacy",
            "refusal",
            "adapter",
        ]) {
            expect(PARTICIPANT_CLARIFICATION_MESSAGE.toLowerCase()).not.toContain(internal.toLowerCase());
        }
    });

    it("it tells the parent what they CAN do instead", () => {
        expect(PARTICIPANT_CLARIFICATION_MESSAGE).toMatch(/buttons|type/i);
    });

    it("a refused or unchanged outcome shows that message and keeps the controls", () => {
        expect(COMPONENT).toContain('outcome === "refused"');
        expect(COMPONENT).toContain('outcome === "no_change"');
        expect(COMPONENT).toContain("PARTICIPANT_CLARIFICATION_MESSAGE");
    });
});

// ---------------------------------------------------------------------------
// The ask-once ratio, made visible
// ---------------------------------------------------------------------------

describe("the parent is told when one answer covers many places", () => {
    it("surfaces resolves_occurrences when it is more than one", () => {
        expect(COMPONENT).toContain("resolves_occurrences > 1");
    });

    it("says nothing when the answer covers exactly one place", () => {
        // Claiming "covers 1 place" would be noise, and claiming more would be false.
        const control = controlForTurn({ ...wire().next_turn, resolves_occurrences: 1 });
        expect(control.kind).toBe("choice_or_text");
    });
});
