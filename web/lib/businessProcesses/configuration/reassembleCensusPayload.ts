/**
 * Rebuild a deployed Business Process payload from a chunked census result, and refuse anything
 * short of a provably complete reconstruction.
 *
 * ## Why chunks, and why this is strict
 *
 * The corrected revision's Law 4 checksum is sha256 over a JS-canonical serialization of the exact
 * deployed bytes, so the whole payload has to come back — a summary cannot produce it. The trusted
 * host parses one line per row, so a single very long line risks truncation, and a TRUNCATED
 * payload is the dangerous case: it can still parse as JSON, still validate, and still produce a
 * confident checksum over configuration the tenant does not have.
 *
 * So every failure mode is named and refused rather than worked around. A missing index, a repeated
 * index, a length that disagrees with what the database declared, or JSON that does not parse all
 * stop here. There is no partial success and no best-effort path: this either returns the deployed
 * payload or it returns why it cannot.
 *
 * Indexes are 1-based because `generate_series(1, chunk_total)` is what the census artifact emits.
 * That is asserted rather than assumed — an off-by-one between the query and this reader would
 * silently drop the first or last chunk, which is exactly the truncation being guarded against.
 */

export type CensusChunk = { department_id: string; revision_id: string; i: number; text: string };

export type ReassembledRevision = {
    readonly department_id: string;
    readonly revision_id: string;
    readonly revision_number: number;
    readonly payload_checksum: string;
    readonly payload_length: number;
    readonly chunk_total: number;
    /** The reconstructed payload, proven complete. */
    readonly payload: Record<string, unknown>;
};

export type ReassemblyFailure = { readonly department_id: string | null; readonly reason: string };

export type ReassemblyResult = {
    readonly revisions: ReassembledRevision[];
    readonly failures: ReassemblyFailure[];
};

type IdentityRow = {
    department_id: string;
    revision_id: string;
    revision_number: number;
    payload_checksum: string;
    payload_length: number;
    chunk_total: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Pull the labeled question rows out of whatever envelope the trusted host wrapped them in.
 *
 * The host's own result shape is `{ results: { questions: { <id>: { rows: [...] } } } }`, and the
 * evidence file adds one more `{ trusted_host_action_id, query_hash, results }` layer around it.
 * Both are unwrapped here so the caller passes a path, not a shape.
 */
export function questionRows(censusJson: unknown, questionId: string): unknown[] {
    const root = isRecord(censusJson) ? censusJson : {};
    const results = isRecord(root.results) ? root.results : root;
    const questions = isRecord(results.questions) ? results.questions : {};
    const q = questions[questionId];
    if (!isRecord(q)) return [];
    return Array.isArray(q.rows) ? q.rows : [];
}

function asIdentity(row: unknown): IdentityRow | null {
    if (!isRecord(row)) return null;
    const department_id = String(row.department_id ?? "").trim();
    const revision_id = String(row.revision_id ?? "").trim();
    if (!department_id || !revision_id) return null;
    return {
        department_id,
        revision_id,
        revision_number: Number(row.revision_number ?? 0),
        payload_checksum: String(row.payload_checksum ?? ""),
        payload_length: Number(row.payload_length ?? -1),
        chunk_total: Number(row.chunk_total ?? -1),
    };
}

function asChunk(row: unknown): CensusChunk | null {
    if (!isRecord(row)) return null;
    const department_id = String(row.department_id ?? "").trim();
    const revision_id = String(row.revision_id ?? "").trim();
    const i = Number(row.i);
    const text = row.text;
    if (!department_id || !revision_id || !Number.isInteger(i) || typeof text !== "string") return null;
    return { department_id, revision_id, i, text };
}

export function reassembleCensusPayload(censusJson: unknown): ReassemblyResult {
    const revisions: ReassembledRevision[] = [];
    const failures: ReassemblyFailure[] = [];

    const identities = questionRows(censusJson, "revision_identity")
        .map(asIdentity)
        .filter((r): r is IdentityRow => r != null);
    if (!identities.length) {
        return { revisions, failures: [{ department_id: null, reason: "census returned no revision_identity row" }] };
    }

    const chunks = questionRows(censusJson, "payload_chunk")
        .map(asChunk)
        .filter((c): c is CensusChunk => c != null);

    for (const identity of identities) {
        const fail = (reason: string) => failures.push({ department_id: identity.department_id, reason });

        if (!Number.isInteger(identity.chunk_total) || identity.chunk_total < 1) {
            fail(`chunk_total is ${identity.chunk_total}, which cannot describe a payload`);
            continue;
        }
        if (!Number.isInteger(identity.payload_length) || identity.payload_length < 1) {
            fail(`payload_length is ${identity.payload_length}, which cannot describe a payload`);
            continue;
        }

        const mine = chunks.filter(
            (c) => c.department_id === identity.department_id && c.revision_id === identity.revision_id,
        );

        // EVERY index exactly once. Reported as sets, because "12 of 13" does not tell you which.
        const byIndex = new Map<number, CensusChunk>();
        const duplicates: number[] = [];
        for (const chunk of mine) {
            if (byIndex.has(chunk.i)) duplicates.push(chunk.i);
            else byIndex.set(chunk.i, chunk);
        }
        if (duplicates.length) {
            fail(`chunk indexes returned more than once: ${[...new Set(duplicates)].sort((a, b) => a - b).join(", ")}`);
            continue;
        }
        const missing: number[] = [];
        for (let i = 1; i <= identity.chunk_total; i += 1) if (!byIndex.has(i)) missing.push(i);
        if (missing.length) {
            fail(`missing chunk indexes ${missing.join(", ")} of ${identity.chunk_total}`);
            continue;
        }
        const unexpected = [...byIndex.keys()].filter((i) => i < 1 || i > identity.chunk_total);
        if (unexpected.length) {
            // An index outside the declared range means the query and this reader disagree about
            // the base, and the payload would be silently short by one chunk at one end.
            fail(`chunk indexes outside 1..${identity.chunk_total}: ${unexpected.sort((a, b) => a - b).join(", ")}`);
            continue;
        }

        let text = "";
        for (let i = 1; i <= identity.chunk_total; i += 1) text += byIndex.get(i)!.text;

        if (text.length !== identity.payload_length) {
            fail(
                `reassembled ${text.length} characters but the database declared ${identity.payload_length}`,
            );
            continue;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            fail(`reassembled payload is not valid JSON: ${(error as Error).message}`);
            continue;
        }
        if (!isRecord(parsed)) {
            fail("reassembled payload is not a JSON object");
            continue;
        }

        revisions.push({
            department_id: identity.department_id,
            revision_id: identity.revision_id,
            revision_number: identity.revision_number,
            payload_checksum: identity.payload_checksum,
            payload_length: identity.payload_length,
            chunk_total: identity.chunk_total,
            payload: parsed,
        });
    }

    return { revisions, failures };
}
