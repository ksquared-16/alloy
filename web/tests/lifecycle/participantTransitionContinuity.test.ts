import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CARD = readFileSync(
    join(process.cwd(), "app", "forms", "embed", "[token]", "EnrollmentConversationCard.tsx"),
    "utf8",
);
const HOST = readFileSync(
    join(process.cwd(), "app", "forms", "embed", "[token]", "FormEmbedClient.tsx"),
    "utf8",
);

/**
 * TWO THINGS KELLY FELT, PINNED SO THEY CANNOT COME BACK.
 *
 * Both were reported as vague discomfort — "the transition felt abrupt", "it sometimes went back a
 * step" — and both turned out to have exact mechanical causes. Vague symptoms are precisely the ones
 * that regress silently, because nobody can point at the line that broke.
 */

describe("a successful action advances the surface rather than rebuilding it", () => {
    it("keeps the opening line in the transcript once a fact is settled", () => {
        /*
         * The opening line used to be dropped the moment the first fact settled, which produced TWO
         * reflows for one Save: the intro disappeared while the answer was still committing, the
         * content shrank, and only then did the settled card arrive. Measured live: three distinct
         * surface states for one action, the middle one smaller than either neighbour.
         *
         * The comment above it always claimed it was "left in the transcript above". Now it is.
         */
        expect(CARD).toContain("{intro ? (");
        // The removal condition is what regressed the transition; it must not return.
        expect(CARD).not.toContain("{intro && settled.length === 0 ? (");
        // It recedes rather than vanishing.
        expect(CARD).toMatch(/depth=\{settled\.length === 0 \? "recent" : "history"\}/);
    });
});

describe("authoritative state cannot move the parent backward", () => {
    it("hands the advanced objective up to the host on every advance", () => {
        /*
         * The host fetched the objective once and seeded this card with it; the card then owned the
         * live copy. So the host held a frozen snapshot of a journey the parent had moved past — and
         * it re-seeds the card from that snapshot on any remount.
         *
         * That is what Kelly saw as "the page went back a step". Reproduced by editing a watched
         * source file mid-journey: Fast Refresh remounted the card, it re-seeded from the frozen
         * copy, and the surface returned to a question already answered. The page never reloaded —
         * a load counter held across the whole run never moved — so this was in-memory state being
         * rebuilt from a stale owner, not a refetch and not a navigation.
         *
         * The trigger is development-only. The stale second owner is not, so it is closed here.
         */
        expect(CARD).toContain("onObjectiveAdvanced");
        // Both places the card learns a newer objective must report it.
        const advances = CARD.match(/onObjectiveAdvanced\?\.\(/g) ?? [];
        expect(advances.length).toBeGreaterThanOrEqual(2);
        // And the host must actually adopt it, not just receive it.
        expect(HOST).toContain("onObjectiveAdvanced={setEnrollmentObjective}");
    });

    it("still seeds the card from the host, so there is one source of truth on first render", () => {
        // The seed is not the problem; the seed going stale was. Keeping it asserted means the fix
        // above cannot be "solved" by cutting the card loose from the host entirely.
        expect(HOST).toContain("initialObjective={enrollmentObjective}");
    });
});
