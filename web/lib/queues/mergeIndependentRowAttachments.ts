/**
 * MERGE TWO INDEPENDENT ATTACHES OVER ONE SET OF ROWS.
 *
 * Effective-Participant-Position and active-tour facts are both PURE attaches: each is
 * `rows.map(row => ({ ...row, <its own fields> }))` over the same population, neither mutates its
 * input, and tours reads only `row.id` — never a field EPP added. They were composed serially
 * (`tours(epp(rows))`) because that is how they were written, not because either needs the other.
 *
 * Running them concurrently means neither result contains the other's fields, so the two have to be
 * recombined. This does that by taking one attach's rows as the base and overlaying ONLY the keys
 * the other attach actually CHANGED against the shared original.
 *
 * WHY A DIFF RATHER THAN A FIELD LIST. Naming tour fields here would make this module a second
 * place that has to know what the tour attach writes, and it would fall silently out of date the
 * first time that owner adds a field — the row would simply lose it, which is exactly the class of
 * defect this programme keeps finding. Diffing against the base asks the owner what it changed.
 *
 * WHY IT REFUSES. If the two attaches disagree about length, the inputs are not what this function
 * believes them to be, and the honest answer is to fall back to the serial composition rather than
 * zip mismatched rows together. A scheduling optimisation must never be the reason a row loses a
 * field or gains someone else's.
 *
 * FAILURE PATHS ARE COVERED BY CONSTRUCTION: both owners return their INPUT rows unchanged when
 * they cannot read. A failed tours attach therefore differs from the base in nothing and overlays
 * nothing, leaving the EPP answer intact; a failed EPP attach still receives the tour fields.
 */
export function mergeIndependentRowAttachments<T extends Record<string, unknown>>(
    base: readonly T[],
    primary: readonly T[],
    secondary: readonly T[],
): T[] {
    if (primary.length !== base.length || secondary.length !== base.length) {
        // Cannot align; the caller's serial composition is the correct answer.
        return [...secondary];
    }
    const out: T[] = [];
    for (let i = 0; i < base.length; i += 1) {
        const b = base[i];
        const p = primary[i];
        const sRow = secondary[i];
        if (sRow === b) {
            // The secondary attach returned the row untouched — nothing to overlay.
            out.push(p);
            continue;
        }
        let merged: Record<string, unknown> | null = null;
        for (const key of Object.keys(sRow)) {
            if (Object.is(sRow[key], b[key])) continue;
            if (!merged) merged = { ...p };
            merged[key] = sRow[key];
        }
        out.push((merged ?? p) as T);
    }
    return out;
}
