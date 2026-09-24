/**
 * EVERY CONTROL A PARENT MUST HIT, AT A THUMB'S SIZE.
 *
 * 44px is the platform's own touch minimum — the fact editor states it twice, in comments that
 * record it being missed before ("at 375px it was 37px high"). Measured on the real participant
 * surface at 390px at the end of the certification, seven controls were below it, including the
 * two that finish an enrollment: the "Tap to sign" overlay at 30px and the electronic-signature
 * acknowledgement's box at 13px.
 *
 * A source guard, deliberately: the heights come from a real browser run, and what can regress
 * silently afterwards is the class being dropped in an edit.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the signature controls clear 44px", () => {
    const src = () => read("app/forms/embed/[token]/SignatureCaptureDialog.tsx");

    it("the acknowledgement row is a 44px target with a real box", () => {
        expect(src()).toContain('className="mt-4 flex min-h-[44px] items-center gap-3');
        expect(src()).toContain('className="h-5 w-5 shrink-0"');
    });

    it("Clear, Type instead and Cancel are all 44px", () => {
        const matches = src().match(/flex min-h-\[44px\] items-center text-\[14px\] text-alloy-midnight\/60 underline/g) ?? [];
        expect(matches.length).toBe(3);
    });

    it("the Tap to sign overlay has a floor, whatever the field's size on the page", () => {
        const canvas = read("app/forms/embed/[token]/ParticipantDocumentCanvas.tsx");
        expect(canvas).toContain('target.style.minHeight = "44px";');
    });
});

describe("the review controls clear 44px", () => {
    it("Attach / Replace is a 44px target", () => {
        expect(read("app/forms/embed/[token]/ParticipantUploads.tsx")).toContain('"min-h-[44px] rounded-xl px-4 py-2.5 text-[14px] font-medium"');
    });

    it("the View link beside an attached file is too", () => {
        expect(read("app/forms/embed/[token]/ParticipantUploads.tsx")).toContain('className="inline-flex min-h-[44px] items-center underline underline-offset-2"');
    });

    it("View larger is a 44px target", () => {
        expect(read("app/forms/embed/[token]/FormEmbedClient.tsx")).toContain('className="min-h-[44px] rounded-xl border border-alloy-midnight/15 px-3.5 py-2 text-[14px] font-medium text-alloy-midnight"');
    });

    it("both Edit affordances are 44px — a fact is corrected from a phone", () => {
        for (const rel of [
            "app/forms/embed/[token]/SemanticFactEditor.tsx",
            "app/forms/embed/[token]/CompiledArtifactReview.tsx",
        ]) {
            expect(read(rel)).toMatch(/flex min-h-\[44px\] shrink-0 items-center/);
        }
    });
});
