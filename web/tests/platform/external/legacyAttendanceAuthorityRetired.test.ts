/**
 * G-14 criteria 6 and 7, as a lock rather than a one-time grep.
 *
 * A production census of `alloy_deployed_primary` returned zero legacy
 * Attendance integration producers, zero producer sites, zero mappings and zero
 * producer-attributed events. The compatibility path was therefore authority
 * nobody held, and it was removed rather than deprecated — a dormant credential
 * path is still a credential path.
 *
 * The three tables remain as historical storage, because
 * `attendance_integration_events.producer_id` still references the producer
 * table for events authored before the retirement.
 *
 * ── WHAT THIS LOCK ACTUALLY PROTECTS ──
 *
 * Retired means no production code resolves AUTHORITY from these tables and no
 * ingestion path reads them. It does not mean the rows became invisible.
 *
 * Attendance Thread 8 shipped an operator surface over the same tables while
 * this slice was retiring the authority — the two landed in parallel and met
 * here. Deleting that surface to make this lock pass would destroy a shipped
 * Attendance feature to satisfy a Developer Platform invariant, and reading it
 * as a violation would be wrong anyway: listing the rows an operator must
 * convert is the opposite of authorizing a write with them.
 *
 * So the surface is allowlisted BY PATH below, narrowly, with its own reason.
 * Everything else — and in particular anything on the ingestion or authority
 * path — still fails this test.
 *
 * The allowlist is temporary by construction. It disappears with the tables in
 * the producer→installation conversion slice, which must retire this surface
 * and `attendance_integration_events.producer_id` in the same change.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The operator-facing administration of the legacy rows, which is not authority.
 * `producerAdministration.ts` is read-only; the two site routes write, and may,
 * because a site cannot be attached to a producer that does not exist — and the
 * deployed primary holds zero producers. The surface can display and drain the
 * legacy model; it cannot repopulate it.
 *
 * Exact paths, never a prefix: a directory rule would silently absorb a future
 * file that does resolve authority.
 */
const ADMINISTRATION_ALLOWLIST = new Set([
    "lib/childcareOperational/attendance/integration/producerAdministration.ts",
    "app/api/admin/attendance/producers/route.ts",
    "app/api/admin/attendance/producers/[producerId]/route.ts",
    "app/api/admin/attendance/producers/[producerId]/sites/route.ts",
]);

const LEGACY_TABLES = [
    "attendance_integration_producers",
    "attendance_integration_producer_sites",
    "attendance_integration_mappings",
];

/** Production source only. Tests may still name the tables to prove they are inert. */
function productionFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
            if (entry === "node_modules" || entry === ".next") continue;
            const full = path.join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
        }
    };
    for (const root of ["lib", "app"]) walk(path.join(webRoot, root));
    return out;
}

describe("the legacy Attendance integration authority is retired", () => {
    it("no production module reads or writes the legacy tables", () => {
        /*
         * ACCESS, not mention. Several modules still NAME these tables in the
         * comment explaining why they no longer read them, and that explanation is
         * the most useful thing in the file — a lock that forbids saying the name
         * would delete the reason.
         */
        const offenders: string[] = [];
        for (const file of productionFiles()) {
            const rel = path.relative(webRoot, file).split(path.sep).join("/");
            if (ADMINISTRATION_ALLOWLIST.has(rel)) continue;
            const src = readFileSync(file, "utf8");
            for (const table of LEGACY_TABLES) {
                const access = new RegExp(String.raw`(?:\.from|\.rpc)\(\s*["'\`]${table}["'\`]|INSERT\s+INTO\s+\w*\.?${table}|UPDATE\s+\w*\.?${table}|FROM\s+\w*\.?${table}\b`, "i");
                if (access.test(src)) offenders.push(`${path.relative(webRoot, file)} → ${table}`);
            }
        }
        expect(offenders, `legacy table access returned to production code:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("every administration exception names a file that still exists", () => {
        /*
         * A dead entry is worse than no entry: it looks like a considered
         * exception while protecting nothing, and it would silently absorb a
         * future file that happened to take the same path.
         */
        const present = new Set(
            productionFiles().map((f) => path.relative(webRoot, f).split(path.sep).join("/")),
        );
        const stale = [...ADMINISTRATION_ALLOWLIST].filter((rel) => !present.has(rel));
        expect(stale, `allowlisted files no longer exist:\n${stale.join("\n")}`).toEqual([]);
    });

    it("the ingestion and authority path is never allowlisted", () => {
        // The exception exists for operator administration. If it ever covers
        // the seam itself, the lock has been turned off rather than narrowed.
        const protectedPaths = [
            "lib/childcareOperational/attendance/integration/ingestExternalAttendance.ts",
            "lib/childcareOperational/attendance/integration/attendanceIngestAuthor.ts",
            "lib/platform/principal/attendanceAuthorityAdapter.ts",
        ];
        for (const p of protectedPaths) {
            expect(ADMINISTRATION_ALLOWLIST.has(p), `${p} must never be allowlisted`).toBe(false);
        }
    });

    it("the legacy credential resolver and mapping resolver are gone", () => {
        const names = ["resolveIntegrationProducer", "resolveExternalMapping", "hashProducerCredential"];
        const offenders: string[] = [];
        for (const file of productionFiles()) {
            const src = readFileSync(file, "utf8");
            // The kiosk has its own device credential and is a different capability;
            // it is not the integration producer path this retires.
            if (file.includes(path.join("attendance", "kiosk"))) continue;
            for (const name of names) {
                // A call or an import, not the name appearing in prose.
                if (new RegExp(String.raw`${name}\s*\(|from\s+["'\`][^"'\`]*${name}`).test(src)) {
                    offenders.push(`${path.relative(webRoot, file)} → ${name}`);
                }
            }
        }
        expect(offenders, `a retired resolver returned:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("external attendance ingestion accepts no credential, only a resolved author", () => {
        const src = readFileSync(
            path.join(webRoot, "lib/childcareOperational/attendance/integration/ingestExternalAttendance.ts"),
            "utf8",
        );
        // Named in the file's own explanation of why it is gone; never as a parameter.
        expect(src).not.toMatch(/presentedCredential\s*[?:]/);
        expect(src).toMatch(/author:\s*AttendanceIngestAuthor/);
    });

    it("there is exactly one kind of ingestion author", () => {
        const src = readFileSync(
            path.join(webRoot, "lib/childcareOperational/attendance/integration/attendanceIngestAuthor.ts"),
            "utf8",
        );
        expect(src).not.toMatch(/kind:\s*"producer"/);
        expect(src).toMatch(/kind:\s*"installation"/);
    });
});
