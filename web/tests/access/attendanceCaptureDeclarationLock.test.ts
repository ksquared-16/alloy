/**
 * RL-29 — ATTENDANCE CAPTURE WAS NEVER UNOWNED; THE TABLE JUST COULD NOT SEE IT.
 *
 * `childcare-attendance` POST sat in the burndown as `pending` while it was already the strictest
 * mutation on the surface. It calls `assertAttendanceCaptureAllowed` unconditionally, and that
 * helper's FIRST step requires `attendance.record` — a key catalogued and activated by
 * `20260909230000`. Its sibling GET has been declared `attendance.read` since Attendance
 * Productization V1 Thread 8; this is the same recovery, on the write half.
 *
 * ── WHAT THIS LOCK IS FOR ──
 *
 * A declaration cleanup is the one kind of convergence that changes no behaviour, which is exactly
 * why it can rot: someone later moves the gate, adds a third entry type that returns before it, or
 * "simplifies" the helper into something that no longer demands the key the table now advertises.
 * Any of those would leave the inventory claiming an enforcement the route had stopped performing —
 * worse than the pending row it replaced, because pending is honest about not knowing.
 *
 * So this asserts the three facts the declaration rests on, and nothing else:
 *
 *   1. the gate is called in POST,
 *   2. it precedes BOTH write branches, with no write ahead of it,
 *   3. the helper it names still requires `attendance.record`.
 *
 * ── DELIBERATELY NOT COUPLED ──
 *
 * This cleanup was staged alongside a Scheduling convergence that did NOT land: `scheduling.write`
 * is withheld from `ops` by the default package while all three Scheduling mutations are reachable
 * by ops today, so converging them would have REVOKED reach rather than removed reach never given.
 * That is a package decision, not a slice. Attendance is independent of it and is asserted alone —
 * this file must never grow a Scheduling assertion, or a blocked slice will start failing a green
 * one. The last case below enforces that in the other direction: no foreign family's key may appear
 * in the attendance route.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const ROUTE_REL = "app/api/admin/childcare-attendance/route.ts";
const ROUTE = path.join(WEB, ROUTE_REL);
const HELPER = path.join(WEB, "lib", "childcareOperational", "attendance", "attendancePermissions.ts");
const MIGRATIONS = path.join(WEB, "..", "supabase", "migrations");

const read = (p: string) => fs.readFileSync(p, "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/** The POST handler body, brace-matched past its parameter list. */
function postBody(src: string): string {
    const i = src.search(/export\s+async\s+function\s+POST\b/);
    expect(i, "the POST handler must exist, or every case below measures nothing").toBeGreaterThan(-1);
    let p = src.indexOf("(", i);
    let d = 0;
    for (; p < src.length; p++) {
        if (src[p] === "(") d++;
        else if (src[p] === ")") {
            d--;
            if (d === 0) { p++; break; }
        }
    }
    const s = src.indexOf("{", p);
    d = 0;
    for (let q = s; q < src.length; q++) {
        if (src[q] === "{") d++;
        else if (src[q] === "}") {
            d--;
            if (d === 0) return src.slice(s, q + 1);
        }
    }
    throw new Error("POST body did not close");
}

const INVENTORY = JSON.parse(
    read(path.join(WEB, "scripts", "routeCapabilities.declared.json")),
) as { routes: Record<string, Record<string, { status: string; capability?: string; helper?: string }>> };

describe("RL-29 — the table says what the route does", () => {
    it("POST is declared against attendance.record, naming the helper that enforces it", () => {
        const entry = INVENTORY.routes[ROUTE_REL]?.POST;
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe("attendance.record");
        expect(entry?.helper).toBe("assertAttendanceCaptureAllowed");
    });

    it("the read half keeps its own narrower owner — capture is not read", () => {
        // If these ever collapse into one key, an organization loses the ability to let someone
        // see the register without letting them write to it.
        const entry = INVENTORY.routes[ROUTE_REL]?.GET;
        expect(entry?.capability).toBe("attendance.read");
        expect(entry?.capability).not.toBe(INVENTORY.routes[ROUTE_REL]?.POST?.capability);
    });
});

describe("RL-29 — the gate is real and it is first", () => {
    const body = codeOnly(postBody(read(ROUTE)));

    it("POST calls the capture gate", () => {
        expect(body).toMatch(/assertAttendanceCaptureAllowed\s*\(/);
    });

    it("the gate precedes BOTH write branches", () => {
        /*
         * A correction must be authorized identically to an original. If `correctAttendanceEvent`
         * ever moves ahead of the gate, "correct" becomes the way to write anything.
         */
        const gate = body.indexOf("assertAttendanceCaptureAllowed");
        const correct = body.indexOf("correctAttendanceEvent");
        const record = body.indexOf("recordAttendanceEvent");
        expect(gate).toBeGreaterThan(-1);
        expect(correct, "correction must not be reachable before the gate").toBeGreaterThan(gate);
        expect(record, "original must not be reachable before the gate").toBeGreaterThan(gate);
    });

    it("nothing persists ahead of the gate", () => {
        // The service-role client bypasses RLS, so nothing downstream re-asks. Everything before
        // the gate must be a read: route gate, body parse, provenance, service date, subject site.
        const gate = body.indexOf("assertAttendanceCaptureAllowed");
        const ahead = body.slice(0, gate);
        expect(ahead, "a write ahead of the gate is an unauthorized write").not.toMatch(
            /\.(insert|update|upsert|delete)\s*\(/,
        );
    });

    it("no role title and no bare admission substitutes for the capability", () => {
        expect(body).not.toMatch(/ctx\.role\s*!==|roleKeys\.(some|includes)|requireAdmin\s*\(/);
        expect(body, "requireAdminOrOps checks no role — it was removed for exactly that reason")
            .not.toMatch(/requireAdminOrOps\s*\(/);
    });
});

describe("RL-29 — the helper still demands the key the table advertises", () => {
    it("assertAttendanceCaptureAllowed requires attendance.record before anything else", () => {
        const src = read(HELPER);
        const i = src.search(/export\s+async\s+function\s+assertAttendanceCaptureAllowed\b/);
        expect(i).toBeGreaterThan(-1);
        const fn = codeOnly(src.slice(i, i + 4000));
        expect(fn).toMatch(/ATTENDANCE_RECORD_PERMISSION_KEY/);
        // The capability is step 1: scope and the capture-scope mode are narrowings applied AFTER
        // it, never instead of it.
        const cap = fn.indexOf("ATTENDANCE_RECORD_PERMISSION_KEY");
        const scope = fn.indexOf("assertAttendanceLocationsInScope");
        expect(scope, "scope must narrow a capability, not stand in for one").toBeGreaterThan(cap);
    });

    it("ATTENDANCE_RECORD_PERMISSION_KEY is the catalog key the declaration names", () => {
        expect(codeOnly(read(HELPER))).toMatch(
            /ATTENDANCE_RECORD_PERMISSION_KEY\s*=\s*["']attendance\.record["']/,
        );
    });

    it("attendance.record is a catalogued capability, not a string this code invented", () => {
        const minted = fs
            .readdirSync(MIGRATIONS)
            .filter((f) => f.endsWith(".sql"))
            .some((f) => read(path.join(MIGRATIONS, f)).includes("'attendance.record'"));
        expect(minted, "declaring an uncatalogued key would make the table lie in a new way").toBe(true);
    });
});

describe("RL-29 — the family stays uncoupled", () => {
    it("no neighbouring family's key appears in the attendance route", () => {
        const body = codeOnly(read(ROUTE));
        for (const foreign of [
            "scheduling.write", "SCHEDULING_WRITE",
            "ops.schedules.write", "ops.jobs.write", "OPS_JOBS_WRITE",
            "enrollment.decide", "ENROLLMENT_DECIDE",
            "business_process.configure", "work.operate", "settings.manage",
        ]) {
            expect(body, `${foreign} must not decide whether a fact may be recorded`).not.toContain(
                foreign,
            );
        }
    });
});
