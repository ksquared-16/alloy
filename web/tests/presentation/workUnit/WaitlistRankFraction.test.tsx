import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import WaitlistRankFraction from "@/components/presentation/workUnit/WaitlistRankFraction";
import { parseWaitlistRankParts } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

describe("WaitlistRankFraction", () => {
    it("parses legacy # labels and plain ranks", () => {
        expect(parseWaitlistRankParts("#1/1")).toEqual({
            preview: false,
            numerator: 1,
            denominator: 1,
            compact: "1/1",
        });
        expect(parseWaitlistRankParts("10/12")).toMatchObject({
            numerator: 10,
            denominator: 12,
            compact: "10/12",
        });
    });

    it("renders same-size offset fraction without #", () => {
        const html = renderToStaticMarkup(<WaitlistRankFraction label="1/2" />);
        expect(html).not.toContain("#");
        expect(html).toContain("translateY(-0.2em)");
        expect(html).toContain("translateY(0.2em)");
        expect(html).toContain(">1<");
        expect(html).toContain(">2<");
        expect(html).toContain('data-waitlist-rank-fraction="true"');
    });

    it("keeps multi-digit ranks readable", () => {
        const html = renderToStaticMarkup(<WaitlistRankFraction label="#10/12" />);
        expect(html).toContain(">10<");
        expect(html).toContain(">12<");
        expect(html).not.toContain("#10");
    });
});
