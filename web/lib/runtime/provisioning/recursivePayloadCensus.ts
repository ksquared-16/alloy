/**
 * RECURSIVE PAYLOAD CENSUS — how stable is one answer against the next, measured honestly.
 *
 * ── WHY THIS IS A MODULE AND NOT A ONE-OFF SCRIPT ──
 *
 * Two published retransmission figures for the Focus Panel provisioning answer were wrong, and
 * both failed the same way: they hashed large top-level subtrees, so a single varying leaf marked
 * its whole parent as "changed".
 *
 *   ~71%  an early audit
 *    40%  the census in §21.5 of operator-runtime-performance-certification.md — mine
 *
 * Measured recursively, the same pair of answers is **99.6% identical**: 135,749B of 138,239B, with
 * 565B genuinely different. `focusPanelStageWork` was the trap — its 78KB `published_stage_inputs`
 * child never varies, while two small siblings do, and top-level hashing charged the whole 81KB to
 * "differs".
 *
 * An 80KB subtree charged to the wrong column is the difference between "configuration is 40% of
 * the problem" and "the critical path ships 138KB to say 565 bytes". The first reading gets you a
 * field-deferral project; the second tells you the projection runs on the wrong side of the wire.
 * So the measurement is now code, with tests, rather than a shell pipeline someone re-derives.
 */

/** A leaf that differs between two payloads, with the path that reaches it. */
export type PayloadDifference = {
    /** Dotted path, array indices bracketed: `focusPanelStageWork.work_intent_runtime.work_id`. */
    path: string;
    bytes: number;
    reason: "value" | "present-in-one-side-only";
};

export type PayloadCensus = {
    bytesA: number;
    bytesB: number;
    /** Bytes accounted for by subtrees that are byte-identical in both payloads. */
    identicalBytes: number;
    /** Bytes accounted for by leaves that genuinely differ. */
    differingBytes: number;
    /** `identicalBytes` as a share of everything accounted for. */
    identicalShare: number;
    /** Largest differences first — what actually changed between the two answers. */
    differences: PayloadDifference[];
};

const bytesOf = (value: unknown): number => JSON.stringify(value ?? null).length;

/**
 * Stable stringify, so key order can never be mistaken for a difference.
 *
 * `JSON.stringify` preserves insertion order, and two server compositions of the same
 * configuration may legitimately build an object's keys in a different order. Comparing raw output
 * would report that as changed payload and re-create exactly the overstatement this module exists
 * to stop.
 */
function canonical(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/**
 * Compare two payloads, charging every byte to `identical` or `differing` at the deepest point
 * where they actually diverge. PURE.
 *
 * Descends only while BOTH sides are objects of the same kind. An identical subtree is charged
 * whole and not walked — which is what makes this cheap on a 138KB answer — and a differing leaf
 * is charged at its own size rather than its parent's.
 */
export function recursivePayloadCensus(a: unknown, b: unknown): PayloadCensus {
    let identicalBytes = 0;
    let differingBytes = 0;
    const differences: PayloadDifference[] = [];

    const walk = (left: unknown, right: unknown, path: string): void => {
        if (canonical(left) === canonical(right)) {
            identicalBytes += bytesOf(left);
            return;
        }

        const bothPlainObjects =
            left !== null &&
            right !== null &&
            typeof left === "object" &&
            typeof right === "object" &&
            !Array.isArray(left) &&
            !Array.isArray(right);

        if (bothPlainObjects) {
            const l = left as Record<string, unknown>;
            const r = right as Record<string, unknown>;
            for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
                const childPath = path ? `${path}.${key}` : key;
                const inLeft = key in l;
                const inRight = key in r;
                if (inLeft && inRight) {
                    walk(l[key], r[key], childPath);
                    continue;
                }
                const only = inLeft ? l[key] : r[key];
                differingBytes += bytesOf(only);
                differences.push({ path: childPath, bytes: bytesOf(only), reason: "present-in-one-side-only" });
            }
            return;
        }

        if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
            left.forEach((item, index) => walk(item, right[index], `${path}[${index}]`));
            return;
        }

        /*
         * A leaf, or two shapes too different to align — an array whose length changed, an object
         * replaced by a string. Charging the whole thing is correct here: there is no smaller unit
         * that can honestly be called unchanged.
         */
        differingBytes += bytesOf(left);
        differences.push({ path: path || "(root)", bytes: bytesOf(left), reason: "value" });
    };

    walk(a, b, "");
    const accounted = identicalBytes + differingBytes;
    differences.sort((x, y) => y.bytes - x.bytes);

    return {
        bytesA: bytesOf(a),
        bytesB: bytesOf(b),
        identicalBytes,
        differingBytes,
        identicalShare: accounted === 0 ? 1 : identicalBytes / accounted,
        differences,
    };
}

/**
 * The measurement the superseded figures made — kept so the difference is demonstrable.
 *
 * Hashes each TOP-LEVEL key and charges the whole subtree to one column. This is not a fallback or
 * a cheaper mode: it exists so `recursivePayloadCensus.test.ts` can show, on the real shape, that
 * it reports a materially different and worse answer. Never use it to report payload stability.
 */
export function topLevelPayloadCensusForComparison(a: unknown, b: unknown): PayloadCensus {
    const l = (a ?? {}) as Record<string, unknown>;
    const r = (b ?? {}) as Record<string, unknown>;
    let identicalBytes = 0;
    let differingBytes = 0;
    const differences: PayloadDifference[] = [];
    for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
        const size = bytesOf(key in l ? l[key] : r[key]);
        if (canonical(l[key]) === canonical(r[key])) identicalBytes += size;
        else {
            differingBytes += size;
            differences.push({ path: key, bytes: size, reason: "value" });
        }
    }
    const accounted = identicalBytes + differingBytes;
    differences.sort((x, y) => y.bytes - x.bytes);
    return {
        bytesA: bytesOf(a),
        bytesB: bytesOf(b),
        identicalBytes,
        differingBytes,
        identicalShare: accounted === 0 ? 1 : identicalBytes / accounted,
        differences,
    };
}

/** Bytes a payload spends carrying the same subtree in two places. PURE. */
export function internalDuplicationBytes(payload: unknown, minimumBytes = 1024): {
    totalDuplicatedBytes: number;
    duplicates: { canonicalBytes: number; occurrences: string[] }[];
} {
    const seen = new Map<string, { bytes: number; paths: string[] }>();
    const walk = (value: unknown, path: string): void => {
        if (value === null || typeof value !== "object") return;
        const size = bytesOf(value);
        if (size >= minimumBytes) {
            const key = canonical(value);
            const entry = seen.get(key) ?? { bytes: size, paths: [] };
            entry.paths.push(path || "(root)");
            seen.set(key, entry);
        }
        if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`));
        else for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k);
    };
    walk(payload, "");

    const duplicates = [...seen.values()]
        .filter((entry) => entry.paths.length > 1)
        .map((entry) => ({ canonicalBytes: entry.bytes, occurrences: entry.paths }))
        .sort((a, b) => b.canonicalBytes - a.canonicalBytes);

    return {
        // Every occurrence after the first is a byte the answer did not need to carry.
        totalDuplicatedBytes: duplicates.reduce((sum, d) => sum + d.canonicalBytes * (d.occurrences.length - 1), 0),
        duplicates,
    };
}
