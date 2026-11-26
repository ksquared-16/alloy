/**
 * RL-12 — ASSIGNMENT IS AN OPERATION PATTERN, NOT AN AUTHORITY.
 *
 * The Director ruling this enforces: several products contain an action called "assign", and that
 * shared verb does not make them one power. There is no `assignments.manage`, no
 * `assignments.write`, no platform-wide assignment capability of any name. Authority belongs to the
 * product whose business truth changes — and this file exists to keep it that way, because a
 * generic key is the kind of thing that looks like tidying up.
 *
 * The census that produced this list searched by BUSINESS EFFECT rather than by the word: the whole
 * schema carries exactly five assignee-bearing columns, and they belong to four different products.
 * `financial_responsibility_allocations.assigned_amount_cents` is deliberately NOT among them — who
 * owes what is Financials business truth, not operator assignment, and reading the word "assigned"
 * as assignment is the mistake this file is shaped to prevent.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(WEB, rel));

/**
 * EVERY ASSIGNMENT MUTATION IN THE PRODUCT, and who owns it.
 *
 * `capability` means the handler must name that key. `blocked` means no truthful owner exists yet
 * and the reason is recorded rather than papered over with a plausible-looking capability — the
 * doctrine being that a role-title site is preferable to a falsely delegated capability while the
 * model is unresolved.
 */
type Entry =
    | { family: string; route: string; method: string; capability: string; helper: RegExp }
    | { family: string; route: string; method: string; blocked: string };

const ASSIGNMENTS: Entry[] = [
    /* ── COMMUNICATIONS — conversation assignment ─────────────────────────────
     * Its own key because assignment GRANTS SCOPE: `claim` assigns a thread to the actor, and an
     * assigned thread bypasses site scope in `decideCommunicationsSendScope`. Folded into
     * `communications.send`, every site-restricted sender could claim any conversation in the
     * organization and answer it. */
    {
        family: "COMMUNICATIONS",
        route: "app/api/admin/communications/conversations/[id]/assign/route.ts",
        method: "POST",
        capability: "communications.assign",
        helper: /requireCommunicationsAuthority\(COMMUNICATIONS_ASSIGN\)/,
    },

    /* ── JOBS — vendor assignment, at job grain and at occurrence grain ───────
     * Not split, and not from symmetry: `jobs/[id]` PATCH already carries `assigned_vendor_id` in
     * its ALLOWED_KEYS, so `ops.jobs.write` ALREADY permits the same effect. A separate key would
     * withhold nothing from anyone. The schedule-side routes take the same owner because the
     * consequence is identical — who performs the work — and because `scheduling.write` owns WHEN:
     * its PATCH allows start_at, end_at, timezone, status, status_key and metadata, and cannot set
     * a vendor at all, so routing these through it would widen Scheduling into vendor selection. */
    {
        family: "JOBS",
        route: "app/api/admin/jobs/[id]/assign-vendor/route.ts",
        method: "POST",
        capability: "ops.jobs.write",
        helper: /requireSchedulingJobsCapability\(ctx, OPS_JOBS_WRITE\)/,
    },
    {
        family: "JOBS",
        route: "app/api/admin/jobs/[id]/apply-vendor-to-upcoming/route.ts",
        method: "POST",
        capability: "ops.jobs.write",
        helper: /requireSchedulingJobsCapability\(ctx, OPS_JOBS_WRITE\)/,
    },
    {
        family: "JOBS",
        route: "app/api/admin/schedules/[id]/assign/route.ts",
        method: "POST",
        capability: "ops.jobs.write",
        helper: /requireSchedulingJobsCapability\(ctx, OPS_JOBS_WRITE\)/,
    },
    {
        family: "JOBS",
        route: "app/api/admin/schedules/[id]/assignment/route.ts",
        method: "PATCH",
        capability: "ops.jobs.write",
        helper: /requireSchedulingJobsCapability\(ctx, OPS_JOBS_WRITE\)/,
    },

    /* ── WORK — operational task assignment ───────────────────────────────────
     * There is no Work capability vocabulary. None. The catalog has no `work.*` key of any kind, so
     * every candidate owner here would be invented rather than reused, and inventing one decides the
     * Work authority model as a side effect of an assignment slice — the exact move the Director
     * ruling forbids. */
    {
        family: "WORK",
        route: "app/api/admin/operational-tasks/route.ts",
        method: "POST",
        blocked: "WORK_AUTHORITY_MODEL_DEBT — the capability catalog contains no work.* key, so assigning an operational task has no truthful owner to reuse and any new one would settle the Work authority model here.",
    },
    {
        family: "WORK",
        route: "app/api/admin/operational-tasks/[id]/route.ts",
        method: "PATCH",
        blocked: "WORK_AUTHORITY_MODEL_DEBT — same surface, same absent vocabulary; this is the handler that moves assigned_to_user_id.",
    },

    /* ── CRM — opportunity owner ──────────────────────────────────────────────
     * `opportunities.assigned_to` moves inside the general opportunity PATCH, not through an assign
     * route. Declaring that handler is a CRM decision about the whole record, not an assignment
     * decision, and the CRM authority model is unresolved. */
    {
        family: "CRM",
        route: "app/api/admin/opportunities/[id]/route.ts",
        method: "PATCH",
        blocked: "BLOCKED_BY_CRM_MODEL — assigned_to is one field of a general CRM record PATCH; its owner is the unresolved CRM/People authority model, not an assignment capability.",
    },

    /* ── ENROLLMENT OPERATIONAL — child placement and schedule pattern ────────
     * Neither of these assigns a PERSON to WORK. `child_placements` puts a child in a room or
     * program, effective-dated; `schedule_assignments` binds a schedule pattern to an enrollment
     * agreement. Both are enrollment truth, and `enrollment.*` holds only pricing.override and
     * requirement_exception.manage — no placement vocabulary exists. */
    {
        family: "ENROLLMENT_OPERATIONAL",
        route: "app/api/admin/child-placements/route.ts",
        method: "POST",
        blocked: "ENROLLMENT_PLACEMENT_AUTHORITY_DEBT — placing a child in a room or program is enrollment truth and the enrollment catalog has no placement key.",
    },
    {
        family: "ENROLLMENT_OPERATIONAL",
        route: "app/api/admin/schedule-assignments/route.ts",
        method: "POST",
        blocked: "ENROLLMENT_PLACEMENT_AUTHORITY_DEBT — binds a schedule PATTERN to an enrollment agreement. Despite the name this is not staff scheduling and scheduling.write does not own it.",
    },
];

/** Blocked entries may only shrink. Asserted exactly, so adding one is a deliberate edit here. */
const ALLOWED_BLOCKED = 5;

/**
 * NO GENERIC ASSIGNMENT CAPABILITY, IN ANY SPELLING.
 *
 * The ruling is not "we happen not to have one yet" — it is that the same verb across products does
 * not imply the same authority. A future slice that adds one has to delete this list first, which is
 * a conversation rather than a commit.
 */
const FORBIDDEN_GENERIC = [
    "assignments.manage",
    "assignments.write",
    "assignments.assign",
    "assignment.manage",
    "assignment.write",
    "assign.manage",
];

describe("RL-12 — assignment authority belongs to the product, never to the verb", () => {
    it("finds the surface it claims to check", () => {
        // Non-vacuity: a registry whose routes have all been renamed proves nothing while passing.
        expect(ASSIGNMENTS.length).toBeGreaterThanOrEqual(10);
        for (const e of ASSIGNMENTS) {
            expect(exists(e.route), `${e.route} is registered but does not exist`).toBe(true);
        }
        expect(new Set(ASSIGNMENTS.map((e) => e.family)).size).toBeGreaterThanOrEqual(4);
    });

    it("gates every implemented assignment mutation on its product's own capability", () => {
        const ungated: string[] = [];
        for (const e of ASSIGNMENTS) {
            if (!("capability" in e)) continue;
            const src = read(e.route);
            if (!e.helper.test(src)) ungated.push(`${e.route} ${e.method} -> expected ${e.capability}`);
        }
        expect(ungated).toEqual([]);
    });

    it("leaves no implemented assignment mutation on portal admission alone", () => {
        /*
         * ORG_CONTEXT_ONLY must be zero for every family this slice implemented. `requireAdminOrOps`
         * reads as a role check and resolves portal admission; that is what every one of these
         * handlers used to call.
         */
        const stragglers: string[] = [];
        for (const e of ASSIGNMENTS) {
            if (!("capability" in e)) continue;
            const src = read(e.route);
            if (/await requireAdminOrOps\(\)/.test(src)) stragglers.push(e.route);
            if (/const ctx = await requireAdminOrgContextLight\(\)/.test(src) && !e.helper.test(src)) {
                stragglers.push(`${e.route} (org-context-only)`);
            }
        }
        expect(stragglers).toEqual([]);
    });

    it("never invents a platform-wide assignment capability", () => {
        const tree: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(path.join(WEB, dir), { withFileTypes: true })) {
                const rel = path.join(dir, entry.name);
                if (entry.isDirectory()) { walk(rel); continue; }
                if (/\.(ts|tsx)$/.test(entry.name)) tree.push(rel);
            }
        };
        walk("app/api");
        walk("lib");
        const migrations = path.resolve(WEB, "..", "supabase", "migrations");
        const sqlFiles = fs.readdirSync(migrations).filter((f) => f.endsWith(".sql"));

        for (const key of FORBIDDEN_GENERIC) {
            for (const rel of tree) {
                expect(read(rel).includes(`"${key}"`), `${rel} names the generic assignment key "${key}"`).toBe(false);
            }
            for (const f of sqlFiles) {
                const sql = fs.readFileSync(path.join(migrations, f), "utf8");
                expect(sql.includes(`'${key}'`), `${f} seeds the generic assignment key '${key}'`).toBe(false);
            }
        }
    });

    it("keeps the blocked list shrink-only, each with a durable reason", () => {
        const blocked = ASSIGNMENTS.filter((e) => "blocked" in e) as Extract<Entry, { blocked: string }>[];
        expect(blocked.length, "lower this deliberately; never raise it").toBe(ALLOWED_BLOCKED);
        for (const e of blocked) {
            // A label is not a reason. Each must name the model that owns the decision.
            expect(e.blocked.length).toBeGreaterThan(60);
            expect(e.blocked).toMatch(/DEBT|BLOCKED_BY/);
        }
    });

    it("does not read financial responsibility as operator assignment", () => {
        /*
         * `financial_responsibility_allocations.assigned_amount_cents` is the one column that would
         * be swept up by a census searching for the word. Who owes what is Financials business truth
         * with its own promoted key (`fin.responsibility`); calling it assignment would move money
         * authority into an operations capability.
         */
        expect(ASSIGNMENTS.some((e) => /financial/i.test(e.route))).toBe(false);

        /*
         * And the traffic does not flow the other way either: no Financials handler may be gated on
         * an assignment capability. (The first draft of this assertion checked that the migration
         * never mentions `fin.responsibility` — which it does, in the ops-withheld list every
         * seed redefinition must reproduce. That assertion tested the wrong file for the right
         * idea.)
         */
        const walk = (dir: string, out: string[] = []): string[] => {
            for (const entry of fs.readdirSync(path.join(WEB, dir), { withFileTypes: true })) {
                const rel = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(rel, out);
                else if (entry.name === "route.ts") out.push(rel);
            }
            return out;
        };
        const financials = walk("app/api/admin/financials");
        expect(financials.length, "non-vacuity: the Financials surface must have been walked").toBeGreaterThan(5);
        for (const rel of financials) {
            expect(read(rel), `${rel} is gated on an assignment capability`).not.toMatch(
                /COMMUNICATIONS_ASSIGN|communications\.assign/
            );
        }
    });

    it("keeps conversation assignment out of the send capability", () => {
        /*
         * The load-bearing separation. If this regressed, `claim` plus `assigned_to_actor` would let
         * any site-restricted sender help themselves to any conversation in the organization.
         */
        const src = read("app/api/admin/communications/conversations/[id]/assign/route.ts");
        expect(src).toMatch(/COMMUNICATIONS_ASSIGN/);
        expect(src).not.toMatch(/requireCommunicationsAuthority\(COMMUNICATIONS_SEND\)/);

        const scope = read("lib/communications/communicationsSendScope.ts");
        expect(scope, "assignment must still be unable to confer send").toMatch(/if \(!input\.hasCommunicationsSend\)/);
        expect(scope).toMatch(/assigned_to_actor/);
    });

    it("does not engage the W-18 delegation ceiling for operational assignment", () => {
        /*
         * Mandatory distinction. Assignment here changes no principal's capability set — the scope
         * decision refuses `no_send_permission` before it ever looks at assignment — so the Access
         * delegation ceiling is not involved. Invoking it merely because the word "assignment"
         * appears would make an operational route refuse on an Access rule.
         */
        for (const e of ASSIGNMENTS) {
            if (!("capability" in e)) continue;
            const src = read(e.route);
            expect(src, `${e.route} must not invoke the Access assignment ceiling`).not.toMatch(
                /assert_assignment_delegation_ceiling|effective_capability_keys/
            );
        }
    });
});
