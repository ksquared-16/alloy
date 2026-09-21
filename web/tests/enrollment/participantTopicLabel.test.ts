import { describe, expect, it } from "vitest";

import { participantTopicLabel } from "@/lib/enrollment/participantRuntime/participantTopicLabel";

/**
 * A SIGNPOST, NOT A RENAME.
 *
 * The authored section keeps its name everywhere the document is the subject. This is the word the
 * conversation uses in a column beside six people's names, where "Toureeb · Health Information and
 * Developmental History" wraps onto three lines and says nothing the short form does not.
 */
describe("the conversational name for a chapter", () => {
    it("shortens the two headings this packet actually carries", () => {
        expect(participantTopicLabel("Health Information and Developmental History")).toBe("Health & development");
        expect(participantTopicLabel("Emergency Contact Information & Authorized Adults")).toBe("Emergency & pickup");
    });

    it("recognises the concept, not this packet's exact wording", () => {
        expect(participantTopicLabel("Developmental history and general health")).toBe("Health & development");
        // Only when BOTH halves of the concept are there. "Health and daily routines" keeps its own
        // words — an early single-word version returned "Health & medical" for it, inventing a word
        // the author never wrote and dropping one they did.
        expect(participantTopicLabel("Health and daily routines")).toBe("Health and daily routines");
        expect(participantTopicLabel("Authorized adults for emergency pick-up")).toBe("Emergency & pickup");
        expect(participantTopicLabel("Tuition & Enrollment Agreement")).toBe("Tuition & agreement");
        expect(participantTopicLabel("Contact Information")).toBe("Contact details");
    });

    it("keeps the authored words when it recognises nothing — a wrong short label is worse", () => {
        for (const heading of [
            "Outdoor Programme Participation",
            "Section 4B",
            "Wraparound care preferences",
        ]) {
            expect(participantTopicLabel(heading)).toBe(heading);
        }
    });

    it("says nothing about an empty heading", () => {
        expect(participantTopicLabel("")).toBe("");
        expect(participantTopicLabel("   ")).toBe("");
    });

    it("never invents a label for a heading it only half-matches", () => {
        // "health" alone is a concept; "healthy eating" is still about health and keeps a short name,
        // but a heading with neither concept word must come back untouched.
        expect(participantTopicLabel("Snacks and lunches")).toBe("Snacks and lunches");
    });
});
