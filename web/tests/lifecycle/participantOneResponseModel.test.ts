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
        // Three inputs with three buttons is the shape this slice replaced. The composer below the
        // topic answers the one active question, so "which am I answering?" is never ambiguous.
        const inputs = CODE.match(/<input\b/g) ?? [];
        const textareas = CODE.match(/<textarea\b/g) ?? [];
        expect(inputs.length + textareas.length, "one typed control at most, for date/number").toBeLessThanOrEqual(2);
    });

    it("recedes settled questions and marks them in Bend Pine", () => {
        expect(CODE).toMatch(/text-alloy-midnight\/45/);
        expect(CODE).toContain("text-alloy-bend-pine");
    });

    it("renders a topic only when the wire supplies one", () => {
        expect(CODE).toContain("objective.next_turn.cluster ?");
    });
});
