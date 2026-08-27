/**
 * One conversation, one way to answer it.
 *
 * The live run put three response systems on screen at once: a generic text box with a "Use this"
 * button, quiet reply pills, and a composer inviting the parent to "Message Alloy…". A parent had to
 * work out which of them Alloy was actually listening to. These pin the collapse to one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CARD = read("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
/**
 * Comments stripped before asserting absence.
 *
 * The doc comment explaining WHY "Use this" was removed contains the phrase, so a naive search finds
 * its own explanation and fails. Asserting against prose rather than code is a mistake this
 * repository has made before.
 */
const CODE = CARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("one response model", () => {
    it("has no second submit paradigm", () => {
        expect(CODE).not.toContain("Use this");
        expect(CODE).not.toContain("Or just reply here");
    });

    it("gives a typed control only to input types a keyboard cannot supply well", () => {
        // A date picker earns its place; a generic text box beside a composer never did.
        expect(CARD).toContain('NEEDS_ITS_OWN_CONTROL = new Set(["date", "number"])');
        expect(CARD).toMatch(/typedCandidate\.kind === "value" && NEEDS_ITS_OWN_CONTROL\.has\(typedCandidate\.inputType\)/);
    });

    it("names the composer for what it is, and offers it as an alternative only when a control is present", () => {
        expect(CARD).toContain('placeholder={typed ? "Or tell me in your own words…" : "Type your answer…"}');
    });

    it("uses Bend Pine for the primary action, never Midnight Forge", () => {
        // `alloy-midnight` is the navy the Director flagged as masquerading as Pine.
        const primary = CARD.match(/className="[^"]*rounded-xl bg-alloy-[a-z-]+ px-4[^"]*"/g) ?? [];
        expect(primary.length).toBeGreaterThan(0);
        for (const cls of primary) {
            expect(cls, "primary actions must be Bend Pine").toContain("bg-alloy-bend-pine");
            expect(cls).not.toContain("bg-alloy-midnight");
        }
    });
});

describe("a cluster reads as a topic, not a card of fields", () => {
    it("speaks the topic once and lists what it will ask", () => {
        expect(CODE).toContain("data-participant-topic");
        expect(CODE).toContain("data-participant-topic-settled");
        expect(CODE).toContain("data-participant-topic-upcoming");
    });

    it("gives only the ACTIVE question an answer surface", () => {
        /*
         * Three inputs with three buttons is the shape this slice replaced. The composer below the
         * topic answers the one active question, so "which am I answering?" is never ambiguous.
         *
         * The grouped-confirmation editor is excluded from the count and asserted separately below.
         * It is not a competing answer surface for the same question: it is a different MODE, opened
         * deliberately, in which the parent is correcting one named fact rather than answering the
         * conversation. Counting its markup here would score a correct product as a regression.
         */
        /*
         * The correction editor and the new-person form are excluded and asserted separately.
         *
         * Neither is a competing answer surface for the current question: one is a correction mode
         * the parent opened deliberately, the other collects ONE person's identity together — name,
         * phone and email as a single coherent act rather than three turns about fragments of the
         * same person.
         */
        const conversational = CODE
            .replace(/function StructuredFactEditor\([\s\S]*?\n\}\n/, "")
            .replace(/function NewPartyForm\([\s\S]*?\n\}\n/, "");
        const inputs = conversational.match(/<input\b/g) ?? [];
        const textareas = conversational.match(/<textarea\b/g) ?? [];
        expect(inputs.length + textareas.length, "one typed control at most, for date/number").toBeLessThanOrEqual(2);
    });

    it("opens ONE fact editor at a time, wherever the parent reached it from", () => {
        /*
         * The same invariant across three surfaces: the active card, the settled record, and Change
         * on a standalone confirmation. A row becomes editable only when it is THE open one, and
         * one piece of state decides which — it holds a single ref, not a set, so two editors
         * cannot be open at once however many places can host one.
         */
        expect(CODE).toMatch(/const \[editingRef, setEditingRef\] = useState<string \| null>\(null\)/);
        // Every row-hosted editor is gated on that single ref.
        const gated = CODE.match(/editingRef === fact\.ref/g) ?? [];
        expect(gated.length, "each row editor is gated on the open ref").toBeGreaterThanOrEqual(2);
        // The standalone Change editor is gated on `correcting`, which is likewise a single flag.
        expect(CODE).toContain("correcting && turn.editor");
        // And the dock's typed control stands down while it is open, so one question never has two
        // answer surfaces.
        expect(CODE).toMatch(/correcting && turn\.editor\s*\n?\s*\? null/);
    });

    it("collects one PERSON together, not one fragment per turn", () => {
        // A person is a coherent thing: name, phone and email in one form, saved once, persisted
        // through the canonical relationship service so they can later be reused by name.
        expect(CODE).toContain("data-participant-party-form");
        for (const part of ["Full name", "Phone", "Email"]) {
            expect(CODE).toContain(`aria-label="${part}"`);
        }
        // And the alternative to typing someone in is choosing someone already known.
        expect(CODE).toContain("data-participant-party-candidate");
        expect(CODE).toContain("data-participant-party-decline");
    });

    it("gives a whole address structured parts rather than one text box", () => {
        // The reported failure: Change on an address left the composer waiting for prose, so fixing
        // a city meant retyping the street and ZIP from memory.
        expect(CODE).toContain("data-participant-address-editor");
        for (const part of ["Street", "City", "State", "ZIP"]) {
            expect(CODE).toContain(`aria-label="${part}"`);
        }
        // Recomposed into ONE canonical value on save — no component becomes a fact of its own.
        expect(CODE).toContain("composeAddress(parts)");
    });

    it("recedes settled questions and marks them in Bend Pine", () => {
        expect(CODE).toMatch(/text-alloy-midnight\/45/);
        expect(CODE).toContain("text-alloy-bend-pine");
    });

    it("renders a topic only when the wire supplies one", () => {
        expect(CODE).toContain("objective.next_turn.cluster ?");
    });
});
