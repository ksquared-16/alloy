/**
 * NO SECOND PATH TO EFFECTIVE-DATED TRUTH.
 *
 * The behavioural matrices prove the canonical path is correct. This proves it is the ONLY path — the
 * question a behavioural test structurally cannot answer, because a bypass passes every test of the
 * path it bypasses.
 *
 * Every production writer of `child_placements` and `schedule_assignments` is classified here. A new
 * writer fails this test until someone classifies it, which is the point: the last bypass
 * (`applyChildParticipationEdit`) existed for months behind a canonical service that looked correct,
 * and a public contract that claimed in-place mutation "is refused for every caller" while nothing
 * enforced it.
 *
 * CLASSES
 *   CANONICAL_TEMPORAL  supersession/cancellation inside a canonical service, or the one gateway
 *   INITIALIZATION      creates the first operational row; no prior interval to close
 *   PROPOSED_LIFECYCLE  operates on proposed/non-operational rows, outside the temporal invariant
 *   MAINTENANCE         status/date maintenance that does not redefine a fact
 *   SCRIPT              seed or verification scripts, not reachable from the application
 *   UNEXPLAINED         nothing may be here
 *
 * SQL WRITERS. A PL/pgSQL function that writes these tables is a writer too, and one a scan of
 * TypeScript `.from()` calls cannot see. `replace_secondary_schedule_assignment` (20261201090000)
 * arrived that way, beside the older `apply_participation_operational_change`. The second half of this
 * file censuses every function the migrations leave defined, classifies them in SQL_REGISTER, checks the
 * secondary replacement's mutation semantics from its own definition, and requires every TypeScript
 * caller of a SQL writer to be classified. Hermetic: it reads migrations, not a database — the live
 * suites (`tests/access/live/secondaryAssignmentReplacement.live.test.ts`) prove the behaviour.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const MIGRATIONS = resolve(WEB, "../supabase/migrations");
const ROOTS = ["lib", "app", "scripts"];
const TABLES = ["child_placements", "schedule_assignments"];

type Site = { file: string; table: string; op: string; line: number };

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
}

/** Strips comments so a table name inside prose cannot be mistaken for a writer. */
function codeOnly(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

function mutationSites(): Site[] {
    const sites: Site[] = [];
    for (const root of ROOTS) {
        const dir = join(WEB, root);
        let files: string[] = [];
        try {
            files = walk(dir);
        } catch {
            continue;
        }
        for (const file of files) {
            const code = codeOnly(readFileSync(file, "utf8"));
            for (const table of TABLES) {
                // `.from("<table>")` followed by a mutating call, allowing the chain to wrap lines.
                const re = new RegExp(
                    `from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,400}?\\.(insert|update|upsert|delete)\\s*\\(`,
                    "g",
                );
                let m: RegExpExecArray | null;
                while ((m = re.exec(code))) {
                    sites.push({
                        file: relative(WEB, file),
                        table,
                        op: m[1],
                        line: code.slice(0, m.index).split("\n").length,
                    });
                }
            }
        }
    }
    return sites;
}

/**
 * The classified register. Keyed by file, because the classification is a property of what the file is
 * for, not of an individual line — line numbers move and would make this a maintenance tax that
 * teaches nothing.
 */
const REGISTER: Record<string, { class: string; why: string }> = {
    "lib/childcareOperational/childPlacementService.ts": {
        class: "CANONICAL_TEMPORAL",
        why: "The canonical Placement service. Its remaining writes are the INITIAL placement insert and"
            + " cancellation; supersession delegates to the transactional primitive.",
    },
    "lib/childcareOperational/scheduleAssignmentService.ts": {
        class: "CANONICAL_TEMPORAL",
        why: "The canonical child Scheduling service, same shape: initial insert and cancellation only;"
            + " supersession delegates to the transactional primitive.",
    },
    "lib/operationalAssignments/operationalAssignmentService.ts": {
        class: "INITIALIZATION",
        why: "Its one insert creates a row with NO predecessor — a proposed row, or a committed child or"
            + " staff secondary's first interval. Replacing a secondary is not done here: a create with a"
            + " predecessor calls `replace_secondary_schedule_assignment` (SQL_REGISTER). Its update and"
            + " delete promote and remove PROPOSED rows, which are outside the supersession invariant.",
    },
    "lib/childcareOperational/participationOperationalChange.ts": {
        class: "CANONICAL_TEMPORAL",
        why: "The one TypeScript caller of `apply_participation_operational_change` (SQL_REGISTER); it"
            + " writes nothing itself.",
    },
    "lib/operationalAssignments/setPrimaryOperationalAssignment.ts": {
        class: "CANONICAL_TEMPORAL",
        why: "Owns the primary-assignment switch for both child and staff subjects, including the staff"
            + " overlap rules the child-only combined primitive deliberately does not serve.",
    },
    "lib/operationalAssignments/archiveOperationalAssignment.ts": {
        class: "MAINTENANCE",
        why: "Archives an assignment. It closes a row rather than redefining a fact, so it asserts no"
            + " new truth interval.",
    },
    "scripts/verifyBosCreateLeadEnrollment.ts": {
        class: "SCRIPT",
        why: "Verification script teardown. Not reachable from the application.",
    },
    "scripts/seedAssignmentPlatformQaDensity.ts": {
        class: "SCRIPT",
        why: "QA density seed. Not reachable from the application.",
    },
};

describe("temporal writer census — one path to effective-dated truth", () => {
    const sites = mutationSites();

    it("finds writers at all, so a silent parser failure cannot report a clean census", () => {
        // A census that finds nothing proves nothing. This floor is deliberately relational: the
        // canonical services must be among what it found.
        expect(sites.length).toBeGreaterThan(4);
        const files = new Set(sites.map((s) => s.file));
        expect(files).toContain("lib/childcareOperational/childPlacementService.ts");
        expect(files).toContain("lib/childcareOperational/scheduleAssignmentService.ts");
    });

    it("has ZERO unexplained in-place operational writers", () => {
        const unexplained = sites
            .filter((s) => !REGISTER[s.file])
            .map((s) => `${s.file}:${s.line} ${s.op} ${s.table}`);
        expect(
            unexplained,
            "a new writer of effective-dated operational truth appeared. Classify it in REGISTER, and if"
                + " it changes a defining fact in place, route it through the canonical service instead:"
                + " an in-place write emits no change event, and a partner that already synchronised the"
                + " row learns of the change through that event and nothing else.",
        ).toEqual([]);
    });

    it("no writer is classified UNEXPLAINED", () => {
        const bad = Object.entries(REGISTER)
            .filter(([, v]) => v.class === "UNEXPLAINED")
            .map(([k]) => k);
        expect(bad).toEqual([]);
    });

    it("applyChildParticipationEdit no longer writes operational truth directly", () => {
        const file = "lib/childcareOperational/applyChildParticipationEdit.ts";
        const own = sites.filter((s) => s.file === file);
        expect(
            own.map((s) => `${s.op}@${s.line}`),
            "this is the measured bypass. It updated child_placements and schedule_assignments in place"
                + " and emitted no change event; it must route through the canonical command instead.",
        ).toEqual([]);
    });

    it("the mounted participation surfaces never write effective-dated truth themselves", () => {
        // Source-level, and deliberately so: this is the question behaviour cannot answer. A route that
        // grew its own UPDATE would pass every behavioural test of the path it bypassed.
        const routes = [
            "app/api/admin/child-participation",
            "app/api/admin/scheduling",
            "app/api/admin/child-placements",
            "app/api/v1/placements/move",
        ];
        const offenders: string[] = [];
        for (const route of routes) {
            const dir = join(WEB, route);
            let files: string[] = [];
            try {
                files = statSync(dir).isDirectory() ? walk(dir) : [dir];
            } catch {
                continue;
            }
            for (const file of files) {
                const code = codeOnly(readFileSync(file, "utf8"));
                for (const table of TABLES) {
                    // Reads are fine and several routes legitimately need them (the scheduling route
                    // resolves a child's current program category from their placement). The invariant
                    // is about WRITES: a route must not author effective-dated truth itself.
                    const re = new RegExp(
                        `from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,400}?\\.(insert|update|upsert|delete)\\s*\\(`,
                    );
                    if (re.test(code)) {
                        offenders.push(`${relative(WEB, file)} writes ${table} directly`);
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

// ─── SQL-function writers ────────────────────────────────────────────────────────────────────────

/** SQL with `--` comments removed, so a table named in prose is not a write. */
function sqlCodeOnly(sql: string): string {
    return sql.replace(/--[^\n]*/g, "");
}

/**
 * Every public function the migrations leave DEFINED, with its LAST body: migrations apply in filename
 * order, a later CREATE OR REPLACE wins, and a DROP FUNCTION removes it.
 */
function finalFunctionBodies(): Map<string, { body: string; header: string; migration: string }> {
    const out = new Map<string, { body: string; header: string; migration: string }>();
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    for (const migration of files) {
        const sql = sqlCodeOnly(readFileSync(join(MIGRATIONS, migration), "utf8"));
        const events: Array<{ at: number; apply: () => void }> = [];
        const create = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
        let m: RegExpExecArray | null;
        while ((m = create.exec(sql))) {
            const name = m[1]!.toLowerCase();
            const rest = sql.slice(m.index);
            const as = /\bas\s+(\$[a-z_]*\$)/i.exec(rest);
            if (!as) continue;
            const tag = as[1]!;
            const start = as.index + as[0].length;
            const end = rest.indexOf(tag, start);
            if (end < 0) continue;
            const header = rest.slice(0, as.index);
            const body = rest.slice(start, end);
            events.push({ at: m.index, apply: () => out.set(name, { body, header, migration }) });
        }
        const drop = /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
        while ((m = drop.exec(sql))) {
            const name = m[1]!.toLowerCase();
            events.push({ at: m.index, apply: () => out.delete(name) });
        }
        for (const e of events.sort((a, b) => a.at - b.at)) e.apply();
    }
    return out;
}

function writesTable(body: string, table: string): Array<"insert" | "update" | "delete"> {
    const ops: Array<"insert" | "update" | "delete"> = [];
    const t = `(?:public\\.)?${table}\\b`;
    if (new RegExp(`insert\\s+into\\s+${t}`, "i").test(body)) ops.push("insert");
    if (new RegExp(`\\bupdate\\s+${t}`, "i").test(body)) ops.push("update");
    if (new RegExp(`delete\\s+from\\s+${t}`, "i").test(body)) ops.push("delete");
    return ops;
}

/** Classified SQL writers. Evidence for each is in its migration and the cited live suite. */
const SQL_REGISTER: Record<string, { class: string; why: string }> = {
    apply_participation_operational_change: {
        class: "CANONICAL_TEMPORAL",
        why: "The transactional primitive for the child PRIMARY interval and its placement: locks, closes"
            + " the prior interval and inserts the successor in one transaction (20261108120000, last"
            + " redefined 20261110120000). The canonical services delegate supersession to it.",
    },
    replace_secondary_schedule_assignment: {
        class: "CANONICAL_TEMPORAL",
        why: "The SECONDARY sibling of the primitive (20261201090000): locks the predecessor, binds it to"
            + " the subject, org and site, closes it as superseded the day before the successor starts and"
            + " inserts the successor naming it — one transaction, retry-replayed by key. Proven live by"
            + " tests/access/live/secondaryAssignmentReplacement.live.test.ts.",
    },
};

describe("temporal writer census — SQL functions are writers too", () => {
    const fns = finalFunctionBodies();
    const writers = [...fns.entries()]
        .map(([name, f]) => ({ name, ops: TABLES.flatMap((t) => writesTable(f.body, t).map((op) => `${op} ${t}`)), migration: f.migration }))
        .filter((w) => w.ops.length > 0);

    it("reads the migrations at all, and finds the known writers", () => {
        // A parser that finds nothing would report a clean census. The two known writers are the floor.
        expect(fns.size).toBeGreaterThan(50);
        const names = writers.map((w) => w.name);
        expect(names).toContain("apply_participation_operational_change");
        expect(names).toContain("replace_secondary_schedule_assignment");
    });

    it("has ZERO unclassified SQL writers, and no register entry for a function that no longer writes", () => {
        const unexplained = writers.filter((w) => !SQL_REGISTER[w.name]).map((w) => `${w.name} (${w.migration}): ${w.ops.join(", ")}`);
        expect(
            unexplained,
            "a SQL function now writes effective-dated operational truth. Classify it in SQL_REGISTER from"
                + " its definition, and if it changes a defining fact in place, route it through a canonical"
                + " primitive instead.",
        ).toEqual([]);
        const stale = Object.keys(SQL_REGISTER).filter((name) => !writers.some((w) => w.name === name));
        expect(stale, "a classified SQL writer was dropped or stopped writing; remove or re-classify it").toEqual([]);
        expect(Object.values(SQL_REGISTER).filter((v) => v.class === "UNEXPLAINED")).toEqual([]);
    });

    it("replace_secondary_schedule_assignment supersedes, it does not edit in place", () => {
        const f = fns.get("replace_secondary_schedule_assignment");
        expect(f, "the secondary replacement primitive must still be defined").toBeTruthy();
        const body = f!.body.replace(/\s+/g, " ");
        // Invoker rights: RLS and grants apply to the caller.
        expect(f!.header).toMatch(/security\s+invoker/i);
        // The predecessor is locked, and only this subject's in this org.
        expect(body).toMatch(/from public\.schedule_assignments where id = p_prior_assignment_id and org_id = p_org_id for update/i);
        // Primaries are refused; they supersede through the primary paths.
        expect(body).toMatch(/if v_prior\.is_primary then raise exception 'primary_not_supported/i);
        // A replacement stays at its site and starts after the predecessor.
        expect(body).toMatch(/raise exception 'site_mismatch/i);
        expect(body).toMatch(/raise exception 'invalid_successor_start/i);
        // The predecessor is CLOSED — superseded, ending the day before — never rewritten.
        expect(body).toMatch(/update public\.schedule_assignments set status = 'superseded', end_date = v_close/i);
        expect(body).toMatch(/v_close := v_start - interval '1 day'/i);
        const updates = body.match(/update public\.schedule_assignments set [^;]*;/gi) ?? [];
        expect(updates, "its only update is the close").toHaveLength(1);
        // The successor names its predecessor and takes the subject from it, never from the payload.
        expect(body).toMatch(/insert into public\.schedule_assignments \([^)]*supersedes_assignment_id/i);
        expect(body).toMatch(/values \( p_org_id, v_prior\.subject_type, v_prior\.enrollment_agreement_id, v_prior\.customer_member_id, v_prior\.subject_person_id/i);
        // A retry replays the successor it created (lineage + key), so it cannot chain a second one.
        expect(body).toMatch(/supersedes_assignment_id = v_prior\.id and metadata ->> 'replacement_key' = v_key/i);
        // It deletes nothing.
        expect(writesTable(f!.body, "schedule_assignments")).not.toContain("delete");
        // Only the server role may call it.
        const migration = readFileSync(join(MIGRATIONS, f!.migration), "utf8");
        for (const role of ["PUBLIC", "anon", "authenticated"]) {
            expect(migration).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.replace_secondary_schedule_assignment\\([^)]*\\) FROM ${role};`));
        }
        expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.replace_secondary_schedule_assignment\([^)]*\) TO service_role;/);
    });

    it("every TypeScript caller of a SQL writer is itself classified", () => {
        const callers: string[] = [];
        for (const root of ROOTS) {
            let files: string[] = [];
            try {
                files = walk(join(WEB, root));
            } catch {
                continue;
            }
            for (const file of files) {
                const code = codeOnly(readFileSync(file, "utf8"));
                if (!/\.rpc\s*\(/.test(code)) continue;
                for (const w of writers) {
                    if (new RegExp(`["'\`]${w.name}["'\`]`).test(code)) callers.push(relative(WEB, file));
                }
            }
        }
        expect(callers.length, "the census must find the known callers").toBeGreaterThanOrEqual(2);
        expect(callers.filter((c) => !REGISTER[c]), "an unclassified file calls a SQL writer").toEqual([]);
    });
});

