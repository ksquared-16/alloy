/**
 * Room ordering and the site attention line — the two things that turn a list of
 * rooms into "what does today look like".
 *
 * Rooms were ordered alphabetically, which sounds neutral and is not: in the
 * certification tenant the only room with children in it sorts LAST, below the
 * fold, behind two rooms that have nobody in them. A director scanning the
 * surface reads two empty rooms and stops.
 *
 * Attention first, then name. The verdicts themselves come from the read model —
 * nothing here decides whether a room is short.
 */

import type { StaffingSufficiencyVerdict } from "@/components/adminV2/scheduling/staffingChrome";

/**
 * Whether the room has anyone in it at all — any expected child or any scheduled
 * staff member.
 *
 * This is the difference between the two kinds of `unknown`. A room that is
 * operating and has no resolvable ratio rule is a real problem: children are
 * expected and the platform cannot say whether enough adults will be there. A
 * room with nobody expected and nobody scheduled is also `unknown`, and it is
 * nothing at all — an empty room in a wing that is closed today.
 *
 * Ranking them together is how "sort by attention" put two empty rooms above the
 * only room with children in it, which is the same failure alphabetical ordering
 * had, reached more cleverly.
 */
export type RoomOrderingFacts = {
    verdict: StaffingSufficiencyVerdict | undefined;
    operating: boolean;
    name: string;
};

function rank(f: RoomOrderingFacts): number {
    if (f.verdict === "short") return 0;
    if (f.verdict === "unknown") return f.operating ? 1 : 4;
    if (f.verdict === "sufficient") return 2;
    /*
     * IDLE splits the same way UNKNOWN does, and for the same reason.
     *
     * A room nobody was expected in is nothing at all. A room that IS operating — children expected,
     * staff scheduled — and is idle right now is a room whose day has not started yet, and it belongs
     * above the closed wing rather than beneath it. The distinction only became reachable when the
     * Day surface began ordering by the ACTUAL verdict: planned-idle and operating cannot both be
     * true of a plan, so Week is unaffected by this branch.
     */
    if (f.verdict === "idle") return f.operating ? 3 : 5;
    return f.operating ? 1 : 4;
}

export function compareByAttentionThenName<T>(factsOf: (item: T) => RoomOrderingFacts) {
    return (a: T, b: T): number => {
        const fa = factsOf(a);
        const fb = factsOf(b);
        const ra = rank(fa);
        const rb = rank(fb);
        if (ra !== rb) return ra - rb;
        return fa.name.localeCompare(fb.name);
    };
}

export type RosterAttentionCounts = {
    /** Rooms whose demand is known and unmet. */
    short: number;
    /**
     * Rooms that ARE operating and whose demand could not be resolved. Empty
     * unconfigured rooms are excluded deliberately: counting them turns the line
     * into "3 rooms with no staffing requirement" on a campus where nothing is
     * wrong, and a warning that is usually noise stops being read.
     */
    unknownWhileOperating: number;
};

/**
 * The one-line answer to "where are the staffing problems". Both read models have
 * computed `roomsShort` and `roomsUnknown` since they shipped and no surface has
 * ever rendered either.
 *
 * Returns null when there is nothing to attend to — an invented "0 problems"
 * badge is noise, and worse, it is the kind of reassurance that stops being read.
 */
export function attentionSentence(counts: RosterAttentionCounts): string | null {
    const parts: string[] = [];
    if (counts.short > 0) {
        parts.push(`${counts.short} ${counts.short === 1 ? "room" : "rooms"} short`);
    }
    if (counts.unknownWhileOperating > 0) {
        const n = counts.unknownWhileOperating;
        parts.push(`${n} ${n === 1 ? "room has" : "rooms have"} no staffing requirement configured`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}
