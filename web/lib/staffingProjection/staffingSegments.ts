/**
 * THE BOUNDARY ENGINE — where a staffing day is cut, and why there.
 *
 * Staffing questions are asked about moments, and every coarse bucket answers a
 * different question than the one asked. An "AM" bucket over 08:00–12:00 holding
 * ten children and three staff reads as adequate at 1:4, and it is wrong twice:
 * the ten children were never all there at once, and the three staff were never
 * all there at once either. Counting distinct people across a window and
 * comparing them to a peak occupancy is how a roster renders green over a room
 * that was short two staff at 09:00.
 *
 * So the cuts are derived from the facts rather than chosen in advance. Every
 * start and every end of every input — child hours, staff hours, availability,
 * Coverage, observed presence — contributes one boundary. Between two adjacent
 * boundaries nothing changes by construction, which is the property that makes a
 * segment safe to answer a staffing question about.
 *
 * ── HALF-OPEN, LIKE EVERY OTHER INTERVAL IN THIS ESTATE ──
 *
 * `[start, end)`. Coverage's exclusion constraint is half-open, Assignment Time
 * is half-open, and a staffing grid that closed its intervals would double-count
 * every person at every boundary — the 10:00 handover would show both the person
 * leaving and the person arriving. Adjacency is not overlap.
 *
 * Pure: no clock, no database, no timezone. Wall-clock "HH:MM" throughout, which
 * is what an operator means by nine o'clock and what survives a DST change.
 */

/** Wall-clock "HH:MM" in the organisation's local day. */
export type Hhmm = string;

/** A half-open wall-clock interval. */
export type TimeInterval = {
    start: Hhmm;
    end: Hhmm;
};

const HHMM_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function isHhmm(value: unknown): value is Hhmm {
    return typeof value === "string" && HHMM_RE.test(value);
}

/**
 * Normalise a stored time to "HH:MM".
 *
 * Postgres `time` arrives as "HH:MM:SS"; an interval that reached the grid as
 * "08:00:00" beside another as "08:00" would produce two boundaries at the same
 * instant and an empty segment between them.
 */
export function toHhmm(value: string | null | undefined): Hhmm | null {
    if (!value) return null;
    const trimmed = String(value).trim();
    const candidate = trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
    return isHhmm(candidate) ? candidate : null;
}

/** A well-formed half-open interval, or null. Overnight is refused, not wrapped. */
export function toInterval(start: string | null | undefined, end: string | null | undefined): TimeInterval | null {
    const s = toHhmm(start);
    const e = toHhmm(end);
    if (!s || !e) return null;
    if (e <= s) return null;
    return { start: s, end: e };
}

/**
 * Every distinct boundary the inputs imply, ascending.
 *
 * Deterministic for a given input set and independent of the order the inputs
 * arrive in, because two runs that cut the day differently cannot be compared —
 * and a projection nobody can diff against yesterday is not evidence.
 */
export function deriveBoundaries(intervals: readonly TimeInterval[]): Hhmm[] {
    const set = new Set<Hhmm>();
    for (const i of intervals) {
        if (!isHhmm(i.start) || !isHhmm(i.end) || i.end <= i.start) continue;
        set.add(i.start);
        set.add(i.end);
    }
    return [...set].sort();
}

/**
 * The ordered half-open segments between consecutive boundaries.
 *
 * Fewer than two boundaries means the day has no timed facts at all, and the
 * honest answer is no segments rather than one segment spanning a day nobody
 * asserted.
 */
export function deriveSegments(intervals: readonly TimeInterval[]): TimeInterval[] {
    const boundaries = deriveBoundaries(intervals);
    const out: TimeInterval[] = [];
    for (let i = 0; i + 1 < boundaries.length; i += 1) {
        out.push({ start: boundaries[i], end: boundaries[i + 1] });
    }
    return out;
}

/**
 * Does this interval cover the whole segment?
 *
 * Containment, not overlap — and they are the same test here only because the
 * segments were cut at every endpoint. A caller that segments some other way and
 * reuses this will get containment semantics, which is the safer of the two to
 * be wrong about: it under-counts rather than crediting a person for a segment
 * they were present for half of.
 */
export function covers(interval: TimeInterval, segment: TimeInterval): boolean {
    return interval.start <= segment.start && interval.end >= segment.end;
}

/** Does any interval in the set cover the segment? */
export function anyCovers(intervals: readonly TimeInterval[], segment: TimeInterval): boolean {
    return intervals.some((i) => covers(i, segment));
}

/** Minutes since midnight — for durations and ordering, never for display. */
export function minutesOf(value: Hhmm): number {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
}

/** Length of a half-open interval in minutes. */
export function durationMinutes(interval: TimeInterval): number {
    return minutesOf(interval.end) - minutesOf(interval.start);
}

/**
 * Merge overlapping and adjacent intervals into the fewest that describe the
 * same time. Used to state one person's availability or presence as a shape an
 * operator recognises, not as the raw rows that produced it.
 */
export function mergeIntervals(intervals: readonly TimeInterval[]): TimeInterval[] {
    const sorted = intervals
        .filter((i) => isHhmm(i.start) && isHhmm(i.end) && i.end > i.start)
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    const out: TimeInterval[] = [];
    for (const i of sorted) {
        const last = out[out.length - 1];
        if (last && i.start <= last.end) {
            if (i.end > last.end) last.end = i.end;
            continue;
        }
        out.push({ ...i });
    }
    return out;
}
