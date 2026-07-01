import { describe, expect, it } from "vitest";
import {
    formatWaitlistCategorySectionTitle,
    resolveWaitlistQueueSection,
    buildWaitlistQueueGroupHeadersFromSections,
} from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";

describe("waitlistQueueSectionPresentation", () => {
    it("collapses duplicate infant keys into one section key", () => {
        const a = resolveWaitlistQueueSection({ cohortKey: "infant", cohortLabel: "Infant" });
        const b = resolveWaitlistQueueSection({ legacyProgramGroupLabel: "Infant" });
        expect(a.sectionKey).toBe(b.sectionKey);
        expect(a.sectionKey).toBe("infant");
        expect(a.sectionTitle).toBe("Infant waitlist");
    });

    it("rolls room-level toddler labels into one org toddler section", () => {
        const a = resolveWaitlistQueueSection({ cohortLabel: "Toddler A" });
        const b = resolveWaitlistQueueSection({ cohortKey: "toddler", cohortLabel: "Toddler — 2–3 years" });
        expect(a.sectionKey).toBe(b.sectionKey);
        expect(a.sectionTitle).toBe("Toddler waitlist");
    });

    it("uses category title not Program waitlist for unknown cohort", () => {
        const s = resolveWaitlistQueueSection({ cohortKey: null, cohortLabel: null });
        expect(s.sectionTitle).toBe("Unspecified category waitlist");
        expect(s.sectionTitle).not.toMatch(/^Program waitlist$/i);
    });

    it("buildWaitlistQueueGroupHeadersFromSections dedupes by key", () => {
        const headers = buildWaitlistQueueGroupHeadersFromSections([
            { sectionKey: "infant", sectionTitle: "Infant waitlist" },
            { sectionKey: "infant", sectionTitle: "Infant waitlist" },
            { sectionKey: "toddler", sectionTitle: "Toddler waitlist" },
        ]);
        expect(Object.keys(headers)).toEqual(["infant", "toddler"]);
    });

    it("multi-child families keep distinct section keys per cohort", () => {
        const infant = resolveWaitlistQueueSection({ cohortKey: "infant", cohortLabel: "Infant" });
        const preschool = resolveWaitlistQueueSection({ cohortKey: "preschool", cohortLabel: "Preschool" });
        expect(infant.sectionKey).not.toBe(preschool.sectionKey);
    });

    it("formatWaitlistCategorySectionTitle avoids double waitlist suffix", () => {
        expect(formatWaitlistCategorySectionTitle("Infant waitlist")).toBe("Infant waitlist");
        expect(formatWaitlistCategorySectionTitle("Toddler")).toBe("Toddler waitlist");
    });
});
