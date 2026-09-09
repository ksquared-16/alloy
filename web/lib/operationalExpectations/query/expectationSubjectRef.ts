/**
 * Reading the subject out of a stored `subject_ref`.
 *
 * ── WHY THIS EXISTS ──
 *
 * The authoring intake stores the tuple's Subject FACET, which is an ARRAY of
 * `{ kind, ref }` — `act.subjectRef = input.subjects`. A consumer that reasons
 * from the column name and reads `subject_ref.id` gets `undefined` for every real
 * row, matches nothing, and reports "no expectations apply" — which is exactly
 * how a known-away child becomes an unexplained missing arrival. The query seam
 * did precisely that until this module existed; its fixtures agreed with it,
 * because they were written from the same wrong assumption.
 *
 * So the shape is read in ONE place, against the shape the intake actually
 * writes, and every consumer shares whatever that turns out to be.
 *
 * `ref` is `string | string[]` in the frozen grammar, and a tuple may govern
 * several subjects, so this returns a LIST. A caller wanting "the" subject takes
 * the first — but matching must consider them all, or an expectation about two
 * children would apply to one of them.
 */

/** Every durable business id named by a stored `subject_ref`, in authored order. */
export function expectationSubjectRefIds(value: unknown): string[] {
    const ids: string[] = [];

    const pushRef = (ref: unknown) => {
        if (typeof ref === "string") {
            if (ref.trim()) ids.push(ref.trim());
            return;
        }
        if (Array.isArray(ref)) {
            for (const r of ref) pushRef(r);
        }
    };

    const pushEntry = (entry: unknown) => {
        if (entry == null) return;
        if (typeof entry === "string") {
            pushRef(entry);
            return;
        }
        if (Array.isArray(entry)) {
            for (const e of entry) pushEntry(e);
            return;
        }
        if (typeof entry !== "object") return;
        const o = entry as Record<string, unknown>;
        // The canonical facet shape, then the flat spellings a hand-written row
        // or an older fixture may carry. Tolerant on read, canonical on write.
        pushRef(o.ref ?? o.id ?? o.subject_id ?? o.subjectId);
    };

    pushEntry(value);
    return ids;
}

/** The first subject id, for consumers whose tuples govern exactly one subject. */
export function primaryExpectationSubjectId(value: unknown): string {
    return expectationSubjectRefIds(value)[0] ?? "";
}

/** Does this stored `subject_ref` name any of `wanted`? */
export function expectationSubjectRefMatches(value: unknown, wanted: ReadonlySet<string>): boolean {
    return expectationSubjectRefIds(value).some((id) => wanted.has(id));
}
