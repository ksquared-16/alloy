/**
 * READINESS IS REACHABLE, AND IT OWNS NOTHING.
 *
 * The reachability chain is already protected generically by
 * `staffAvailabilityContext.test.ts`, which walks every placed person card and
 * fails naming any the contextual host cannot reach — it caught this card
 * automatically before the branch existed. What is asserted HERE is what is
 * specific to readiness: that it is offered like its siblings, that it derives no
 * verdict in the context layer, and that nothing about it is stored.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSubjectReadinessContext } from "@/lib/context/buildSubjectContexts";
import { durableRecordContextOptions } from "@/lib/context/durableRecordContextOptions";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";

const code = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");

/**
 * Comments describe intent; only statements change behaviour.
 *
 * These files explain at length what they deliberately do NOT do — "no is_ready",
 * "not action_execute" — and a naive source scan matches that prose and fails on
 * the very sentence promising the opposite. Strip the commentary and assert the code.
 */
function statements(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//"))
        .join("\n");
}

const STAFF: PersonEmploymentComposition = {
    is_staff: true,
    current: {
        id: "emp-1", status: "active", state_label: "Active", is_open: true,
        position_label: "Lead Teacher", employment_type: "full_time", employment_type_label: "Full time",
        primary_location_id: "loc-1", primary_location_label: "North Campus",
        external_employee_id: null, badge_number: null,
        start_date: "2026-01-05", end_date: null, end_reason_key: null,
    },
    periods: [], configured_facts: [], never_employed: false,
};

describe("the Readiness context", () => {
    it("is offered to staff, and derives no verdict of its own", () => {
        const ctx = buildSubjectReadinessContext(STAFF, "p-1");
        expect(ctx).not.toBeNull();
        expect(ctx!.kind).toBe("readiness");
        expect(ctx!.label).toBe("Readiness");
        // A summary here would be a SECOND readiness answer beside the engine's, and
        // stale the morning a credential lapsed.
        expect(ctx!.detail).toBeNull();
        expect(ctx!.state).toBeNull();
        // A verdict about a record is not a queue position.
        expect(ctx!.destination_work_unit_key).toBeNull();
    });

    it("is not offered to someone who never worked here", () => {
        expect(buildSubjectReadinessContext(null, "p-1")).toBeNull();
        expect(buildSubjectReadinessContext(
            { ...STAFF, is_staff: false, current: null, never_employed: true }, "p-1")).toBeNull();
    });

    it("resolves as a canonical card about the record", () => {
        const [option] = durableRecordContextOptions([buildSubjectReadinessContext(STAFF, "p-1")!]);
        expect(option!.surface).toBe("canonical_record");
    });
});

describe("no readiness storage exists anywhere in the slice", () => {
    it("no migration creates a readiness table", () => {
        // The strongest form of "it is a projection": there is nothing to store it in.
        const model = code("lib/staffReadiness/staffReadinessModel.ts");
        const service = code("lib/staffReadiness/staffReadinessService.ts");
        const route = code("app/api/admin/staff-readiness/route.ts");
        for (const [name, raw] of [["model", model], ["service", service], ["route", route]] as const) {
            const src = statements(raw);
            expect(src, `${name} must not write`).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
            expect(src, `${name} must not invent a readiness flag`).not.toMatch(/is_ready|readiness_status/);
            expect(src, `${name} must not read a readiness table`).not.toMatch(/from\(["'][a-z_]*readiness/);
        }
    });

    it("the route evaluates with record_view, so viewing never blocks", () => {
        const route = statements(code("app/api/admin/staff-readiness/route.ts"));
        expect(route).toContain('"record_view"');
        // Slice 6 arrives by changing the TRIGGER at a seam. If this route ever used
        // a blocking trigger, viewing a record would start enforcing.
        expect(route).not.toMatch(/action_execute|status_transition|form_submit/);
    });

    it("the service checks org ownership before it evaluates anything", () => {
        const service = statements(code("lib/staffReadiness/staffReadinessService.ts"));
        // A foreign employment must be not_found, never an evaluation that quietly
        // returns "ready" about a record the caller cannot see.
        expect(service).toMatch(/\.eq\("org_id", orgId\)/);
        expect(service).toContain("does not belong to this organization");
    });

    it("readiness consumes the qualification answer rather than re-deriving it", () => {
        const service = statements(code("lib/staffReadiness/staffReadinessService.ts"));
        expect(service).toContain("resolveQualificationStateForWorkContext");
        // Re-implementing satisfaction here would be a second qualification engine.
        expect(service).not.toMatch(/expires_on|qualificationStanding|verification_state/);
    });

    it("availability is not consulted", () => {
        const service = statements(code("lib/staffReadiness/staffReadinessService.ts"));
        const model = statements(code("lib/staffReadiness/staffReadinessModel.ts"));
        // "Not available Tuesday at 2pm" is not "not ready as staff".
        expect(service).not.toMatch(/staff_availability|availabilityService/i);
        expect(model).not.toMatch(/staff_availability|availabilityService/i);
    });
});

/**
 * TWO CANONICAL FACTS THE SERVICE MUST NOT RESTATE.
 *
 * Both defects these lock were the same mistake wearing different clothes: the
 * service held a private copy of something another module owns, and the copy was
 * wrong. Mounted QA on 2026-09-21 found each one on the deployed build.
 */
describe("readiness reads canonical facts rather than restating them", () => {
    const SERVICE = "lib/staffReadiness/staffReadinessService.ts";

    it("defers to lib/employment for which statuses are open, and keeps no set of its own", () => {
        // The hand-written set was `["active", "ending"]` — it omitted `pending_start`,
        // which `EMPLOYMENT_OPEN_STATUSES` includes. The roster and the Employment card
        // called the employment open; readiness called it "not started yet", and that
        // enforced gap short-circuited every qualification requirement behind it.
        const src = statements(code(SERVICE));
        expect(src).toMatch(/isOpenEmploymentStatus\(/);
        expect(src, "readiness must not keep its own list of open employment statuses")
            .not.toMatch(/new Set\(\s*\[[^\]]*["']active["'][^\]]*\]\s*\)/);
    });

    it("asks the locations table for a column it actually has", () => {
        // `locations` stores the display name in `label`. Selecting `name` is not a
        // type error and does not throw: PostgREST fails, the destructured `data` is
        // null, and the site simply loses its name — "Required this site" instead of
        // "Required at North Campus". Scanned repo-wide, because the column is the
        // same column everywhere.
        // Two callers outside Staff already had this bug when the lock was written.
        // They are named rather than excused: the lock's job is to stop NEW ones, and
        // repairing comms and tours is not Slice 5's to do. See REMAINING DEBT.
        const PRE_EXISTING = [
            "lib/communications/inboxThreadsService.ts",
            "lib/platform/commands/runtime/adapters/cancelTourAdapter.ts",
        ];
        const offenders: string[] = [];
        const roots = ["lib", "app", "components"];
        const walk = (dir: string): string[] => {
            const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
            const out: string[] = [];
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) out.push(...walk(full));
                else if (/\.tsx?$/.test(entry)) out.push(full);
            }
            return out;
        };
        for (const root of roots) {
            for (const file of walk(join(__dirname, "../../", root))) {
                const src = statements(readFileSync(file, "utf8"));
                const re = /from\(\s*["']locations["']\s*\)\s*\.\s*select\(\s*["']([^"']*)["']/g;
                let m: RegExpExecArray | null;
                while ((m = re.exec(src)) !== null) {
                    const cols = m[1]!.split(",").map((c) => c.trim());
                    const rel = file.split("/web/")[1]!;
                    if (cols.includes("name") && !PRE_EXISTING.includes(rel)) {
                        offenders.push(`${rel}: select("${m[1]}")`);
                    }
                }
            }
        }
        expect(offenders, "locations has `label`, not `name`").toEqual([]);
    });
});
