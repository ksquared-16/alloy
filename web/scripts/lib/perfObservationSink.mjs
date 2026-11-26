/**
 * DURABLE PER-OBSERVATION COLLECTION for the performance harnesses.
 *
 * A timing run is a sequence of independent observations, and the expensive part is the RUN, not
 * any one sample. The existing harnesses build an array and serialise it once at the end
 * (`pe3ColdLoadHarness` writes its JSON on the last line), so a harness interrupted at sample 58 of
 * 62 — a timeout, a killed process, an operator Ctrl-C — reports nothing at all and the whole
 * admitted window has to be paid for again.
 *
 * This sink appends ONE LINE PER OBSERVATION, flushed as it is produced. An interrupted run leaves
 * every observation it actually completed, and a later pass reads them back.
 *
 * ── WHAT MAY BE WRITTEN ──
 *
 * Timing facts only. The harness rule these scripts inherit is absolute and was written after an
 * earlier revision persisted 93 operator email addresses, a phone number and 18 raw subject ids:
 * nothing identifying reaches the disk. `assertObservationIsAnonymous` enforces that here rather
 * than trusting each call site — it rejects a record carrying a UUID, an email, or a long free-text
 * string anywhere in its values, so a future caller that adds `subjectLabel` to an observation
 * fails loudly instead of quietly writing a family's name into /tmp.
 *
 * Admission is recorded PER OBSERVATION, not once per run. Host load moves during a run, so a
 * single pre-run reading cannot say whether sample 40 was admitted; carrying the load with each
 * sample lets a contaminated observation be EXCLUDED at analysis time instead of discarding the run.
 */
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { loadavg } from "node:os";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Free text long enough to be a name, a label, or an address rather than a key or an enum. */
const MAX_STRING = 64;

/**
 * Throw unless every value in `record` is a timing fact.
 *
 * Deliberately a WHITELIST of shapes rather than a blacklist of field names: the defect this
 * prevents is a caller adding a field nobody thought to ban.
 */
export function assertObservationIsAnonymous(record, path = "observation") {
    if (record === null || typeof record === "number" || typeof record === "boolean") return;
    if (typeof record === "string") {
        if (UUID.test(record)) throw new Error(`${path}: refusing to persist a UUID`);
        if (EMAIL.test(record)) throw new Error(`${path}: refusing to persist an email address`);
        if (record.length > MAX_STRING) {
            throw new Error(`${path}: refusing to persist free text (${record.length} chars)`);
        }
        return;
    }
    if (Array.isArray(record)) {
        record.forEach((v, i) => assertObservationIsAnonymous(v, `${path}[${i}]`));
        return;
    }
    if (typeof record === "object") {
        for (const [k, v] of Object.entries(record)) {
            if (UUID.test(k)) throw new Error(`${path}: refusing to persist a UUID as a key`);
            assertObservationIsAnonymous(v, `${path}.${k}`);
        }
        return;
    }
    throw new Error(`${path}: unsupported value type ${typeof record}`);
}

/** The host's 1m/5m load, the two figures the admission gate is stated in. */
export function hostLoad() {
    const [one, five] = loadavg();
    return { load_1m: Number(one.toFixed(2)), load_5m: Number(five.toFixed(2)) };
}

/**
 * Does this load satisfy the certification gate? Recorded per observation so analysis can exclude
 * rather than discard. The thresholds are the protocol's and are not configurable here on purpose.
 */
export function isAdmitted({ load_1m, load_5m }) {
    return load_1m < 6.0 && load_5m < 8.0;
}

/**
 * Open a durable sink at `path`. Each `append` writes one flushed JSON line.
 *
 * `meta` is written once as a header record so a file can never be read without the code identity
 * it was produced against — pooling observations across builds is the error the protocol most wants
 * to prevent, and a file that cannot state its SHA invites exactly that.
 */
export function openObservationSink(path, meta = {}) {
    mkdirSync(dirname(path), { recursive: true });
    let count = 0;
    const write = (record) => {
        assertObservationIsAnonymous(record);
        appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
    };
    write({ kind: "run_meta", at: new Date().toISOString(), ...meta, ...hostLoad() });
    return {
        path,
        /** Persist one observation immediately, stamped with the load it was taken under. */
        append(observation) {
            const load = hostLoad();
            write({ kind: "observation", seq: count++, ...observation, ...load, admitted: isAdmitted(load) });
            return count;
        },
        /** Close the file with the post-run load, so the gate can be checked at both ends. */
        close(summary = {}) {
            const load = hostLoad();
            write({ kind: "run_end", at: new Date().toISOString(), observations: count, ...summary, ...load, admitted: isAdmitted(load) });
            return count;
        },
    };
}

/** Read back every observation a (possibly interrupted) run persisted. */
export function readObservations(path) {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
}
