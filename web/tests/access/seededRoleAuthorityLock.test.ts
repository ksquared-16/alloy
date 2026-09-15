/**
 * W-17 — ROLE IDENTITY IS NOT AUTHORIZATION.
 *
 * Alloy owns capabilities, scope and the resolver. The ORGANIZATION owns what its roles mean. A
 * seeded role is a bootstrap convenience — a starting package someone may reconfigure or ignore —
 * and it must never be a licence. The moment an Access-owned decision reads a role KEY to decide
 * whether something is allowed, the configurable model is over: two tenants calling a role the same
 * name would start sharing authority they never agreed to.
 *
 * ── WHY THIS IS NOT A GREP ──
 *
 * The strings themselves are legitimate almost everywhere they appear. `admin` is a real seeded key
 * in migrations, a real display label, a real fixture value, and a real compatibility OUTPUT. W-13
 * established the discipline this reuses: classify the occurrence, and convict only the one class
 * that matters — a role key consulted to ALLOW or DENY. Everything else is named and excluded on
 * purpose, so the lock can be trusted rather than silenced.
 *
 * The static half cannot prove the absence of an idea, only of a shape. So the behavioural half
 * proves the positive claim directly: identical capabilities produce identical decisions regardless
 * of which role carried them, and a seeded key with nothing granted gets nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { canManageUsersAndRoles } from "@/lib/admin/canManageUsersAndRoles";

const webRoot = join(__dirname, "..", "..");

/** The surfaces and modules Access owns. Other domains are the Role-Title Authority Cleanup debt. */
const ACCESS_OWNED = [
    join(webRoot, "app", "api", "admin", "rbac"),
    join(webRoot, "app", "api", "admin", "access"),
    join(webRoot, "app", "api", "admin", "users"),
    join(webRoot, "app", "api", "admin", "settings", "users-roles"),
    join(webRoot, "lib", "access"),
    join(webRoot, "components", "adminV2", "settings", "access"),
    /*
     * The Forms authorization surface, added when Forms migrated off role-title authority. Its 25
     * gates were the single largest concentration in the product; this is what stops them coming
     * back one route at a time.
     */
    join(webRoot, "app", "api", "admin", "forms"),
    join(webRoot, "lib", "access", "formsAuthority.ts"),
    /*
     * The POS + Processing authorization surface, added when Processing migrated off role-title
     * authority. Twelve of its thirteen gates were ordinary route checks; the thirteenth was
     * `actorAuthorized = ctx.role === "admin" || ctx.role === "ops"` inside a SHARED context that
     * governs seven identity routes at once — invisible to any scan that only reads route files,
     * which is exactly why `lib/pos/processingIdentity` is listed here by name.
     */
    join(webRoot, "app", "api", "admin", "pos"),
    join(webRoot, "app", "api", "admin", "processing"),
    join(webRoot, "lib", "pos", "processingIdentity"),
    join(webRoot, "lib", "access", "processingAuthority.ts"),
    /*
     * The Schedules + Jobs authorization surface. Fourteen gates, and the reason they are listed as
     * ONE cluster is that four of them were never scheduling or job operations at all: they post a
     * cash receipt, a vendor payout, a GL journal entry and a receivable charge. Authority there
     * follows the business consequence rather than the URL folder, so `fin.post` is enforced from
     * under `schedules/` and `jobs/` — and this lock has to cover both trees or the money four
     * could quietly regress to a role title while the other ten stayed clean.
     */
    join(webRoot, "app", "api", "admin", "schedules"),
    join(webRoot, "app", "api", "admin", "jobs"),
    join(webRoot, "lib", "access", "schedulingJobsAuthority.ts"),
    /*
     * The configuration authorization surface — option sets, entity layouts, field definitions.
     *
     * TWO ROUTES IN THESE TREES KEEP A ROLE GATE ON PURPOSE, and the lock must not be read as
     * having missed them. `entity-layouts/[id]` DELETE is a MODEL_CONTRACT_DEFECT: its own file
     * says published rows are immutable while the handler deletes them. `ensure-platform-field`
     * installs is_system rows the organization can never remove, and whether that may be delegated
     * is an unresolved product decision. Minting a capability for either would make it MORE
     * reachable — a key can be granted to a custom role, a role literal cannot — so both keep the
     * gate they already had and are recorded as debt rather than migrated. They are named in
     * KNOWN_ROLE_GATED below so this lock stays green on exactly those and nothing else.
     *
     * THE BUSINESS PROCESS TREES join this lock with the Department convergence. Every lifecycle
     * operation under `departments/` and the publish route under `business-process/` now derives
     * authority from `business_process.configure` / `.activate`, and the generic department DELETE
     * was retired outright rather than given a key. One gate survives on purpose: the PATCH shape
     * carrying `metadata` is the org-wide attention/SLA write, which has no truthful capability yet
     * and must not borrow a process key to get one. It is recorded below, and the same handler's
     * column-field branch is capability-gated, so the exception is a write shape, not a route.
     *
     * THE OPERATIONAL INTELLIGENCE TREES join with the reports.write convergence. Ten mutation
     * handlers under `organization-calculations/` and `metrics/` asked for the admin role while
     * `reports.write` sat in the catalog describing exactly those operations and enforcing nothing.
     * They derive authority from it now, and the ops default package was corrected in the same
     * slice so activating the key could not hand ops ten mutations it had never performed. No new
     * exception is recorded: the bounded area reaches zero.
     *
     * DISCOUNTS joins as the Jobs vertical's, not the childcare one's. Its three mutations asked for
     * the admin role; they ask for `ops.jobs.write` now, which is already admin-present and
     * ops-absent, so the rehome preserved the exact behaviour without a migration. The model was NOT
     * retired: the Financials program recorded `discount_programs` as a different vertical when it
     * built `financial_reduction_applications`, and Jobs/Booking remains supported. Its legacy-only
     * authoring surface is product debt, not an authority exception.
     */
    join(webRoot, "app", "api", "admin", "option-sets"),
    join(webRoot, "app", "api", "admin", "entity-layouts"),
    join(webRoot, "app", "api", "admin", "field-definitions"),
    join(webRoot, "lib", "access", "configurationAuthority.ts"),
    join(webRoot, "app", "api", "admin", "departments"),
    join(webRoot, "app", "api", "admin", "business-process"),
    join(webRoot, "lib", "access", "businessProcessAuthority.ts"),
    join(webRoot, "app", "api", "admin", "organization-calculations"),
    join(webRoot, "app", "api", "admin", "metrics"),
    join(webRoot, "lib", "admin", "canReadAnalytics.ts"),
    join(webRoot, "app", "api", "admin", "discounts"),
    /*
     * The Business Process FAMILY, added when enrollment-process and lifecycle-catalog rehomed onto
     * the keys the business-process namespace already owned. Eleven gates, and they are listed as
     * one cluster because the split inside them is the thing most at risk of quietly reverting:
     * `stage-work-unit/route.ts` holds two `business_process.configure` handlers and one
     * `business_process.activate` handler, because its DELETE takes running work offline while its
     * POST and PATCH only edit the definition. A future reader tidying that file toward "one
     * capability per route" would undo a Director decision, so the tree is locked rather than the
     * individual handlers.
     */
    join(webRoot, "app", "api", "admin", "enrollment-process"),
    join(webRoot, "app", "api", "admin", "lifecycle-catalog"),
];

/**
 * The only files in the Access-owned surface allowed to still decide from a role key, each with a
 * recorded reason and an owner. The list may only SHRINK: a new entry is a new defect, and removing
 * one means the underlying product question was answered.
 */
const KNOWN_ROLE_GATED: { suffix: string; why: string }[] = [
    {
        suffix: join("entity-layouts", "[id]", "route.ts"),
        why: "MODEL_CONTRACT_DEFECT — deletes rows the model calls immutable; see entity-layout-delete-model-contract.md",
    },
    {
        suffix: join("field-definitions", "ensure-platform-field", "route.ts"),
        why: "PLATFORM_AUTHORITY_DELEGABILITY_UNRESOLVED — installs unremovable is_system rows; see platform-field-authority-delegability.md",
    },
    {
        suffix: join("departments", "[departmentId]", "route.ts"),
        why: "ATTENTION_SLA_METADATA_AUTHORITY_DEBT — the PATCH metadata shape is the org-wide attention/SLA write, not a business process write; settings.manage would widen it to ops and business_process.configure would make a process key a generic JSON write key. The column fields ARE capability-gated in the same handler; only the metadata branch still asks the role.",
    },
];

/**
 * Named exclusions, each for a stated reason rather than to quieten the scan.
 *
 * `adminPortalRolePick` is compatibility OUTPUT: it projects a role union down to the legacy
 * `ctx.role` string for callers that predate capabilities. It decides nothing about Access, and
 * W-17 must not extend it — that is recorded as debt, not fixed here.
 */
const EXCLUDED_FILES = [/adminPortalRolePick\.ts$/, /\.test\.tsx?$/, /__fixtures__/];

function filesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        let entries: string[];
        try {
            entries = readdirSync(abs);
        } catch {
            return;
        }
        for (const name of entries) {
            const child = join(abs, name);
            if (statSync(child).isDirectory()) walk(child);
            else if (/\.tsx?$/.test(child) && !EXCLUDED_FILES.some((re) => re.test(child))) out.push(child);
        }
    };
    walk(dir);
    return out;
}

/** Comments are documentation of a decision, not the decision. */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * A role key consulted to ALLOW or DENY.
 *
 * Deliberately shaped around the CONDITION, not the string: `role === "admin"` inside an `if`, a
 * membership test over a role-key literal array, and `roleKeys.includes("…")`. A role key used to
 * LABEL, to SEED, or to project compatibility output matches none of these.
 */
const AUTHORITY_SHAPES: { name: string; re: RegExp }[] = [
    {
        /*
         * THE CALLER'S role, compared to anything.
         *
         * `ctx.role` / `auth.role` / `access.role` / `context.role` is the admitted principal's
         * compatibility projection. Any comparison against it is a decision about WHO SOMEONE IS,
         * whatever key it names — including a key that is not in the seeded vocabulary.
         *
         * Excludes the primitive type names, because `typeof body.role === "string"` is a parse of
         * untrusted input, not a decision about who someone is. Convicting it would make the lock
         * noisy in exactly the routes that do the right thing.
         */
        name: "the caller's role as a condition",
        re: /\b(?:ctx|auth|access|context)\.role\s*(?:!==?|={2,3})\s*["'](?!string["']|number["']|boolean["']|object["']|undefined["']|function["']|symbol["']|bigint["'])[a-z_]+["']/,
    },
    {
        /*
         * ANY `role` identifier compared to a SEEDED ROLE KEY.
         *
         * This is the classification half, and POS + Processing is why it exists. That tree is full
         * of lines like `s.role === "lead"`, `child.role !== "child"`, `entry.role === "parent"` —
         * fourteen of them — and not one is authorization. They describe what a SUBJECT is inside a
         * household: who the lead is, which record is the child. The word is the same and the noun
         * is not.
         *
         * A lock that convicted them would have to be switched off for the whole subtree, which is
         * how the shared `operatorRouteContext` gate stayed invisible in the first place. So the
         * discriminator is the KEY, not the identifier: `admin`, `ops`, `owner`, `school_director`
         * and `regional_lead` are the platform's seeded role vocabulary, and comparing anything to
         * one of them is a role-title decision no matter what it is called.
         */
        name: "seeded role key as a condition",
        re: /\brole\s*(?:!==?|={2,3})\s*["'](?:admin|ops|owner|school_director|regional_lead)["']/,
    },
    { name: "role-key literal array membership", re: /\[\s*["'](?:admin|ops|owner|school_director|regional_lead)["'][^\]]*\]\s*\.\s*includes\s*\(/ },
    { name: "roleKeys.includes(<key>)", re: /roleKeys\s*\.\s*(?:includes|some)\s*\(\s*["'][a-z_]+["']/ },
];

describe("W-17 — a seeded role key is not authority inside Access", () => {
    const scanned = ACCESS_OWNED.flatMap(filesUnder);

    it("actually scanned the Forms authorization surface", () => {
        // A lock that silently stopped traversing Forms would pass forever while the gates returned.
        const forms = scanned.filter((f) => f.includes(`${sep}forms${sep}`) || f.endsWith("formsAuthority.ts"));
        expect(forms.length, "the Forms authorization surface was not scanned").toBeGreaterThan(15);
    });

    it("actually scanned the Schedules + Jobs authorization surface", () => {
        // Separate non-vacuity claim: a different tree, which must not be covered by another tree
        // still being noisy. Both folders are named because the money four live under `schedules/`
        // and `jobs/` while being owned by Financials.
        const sched = scanned.filter((f) => f.includes(`${sep}schedules${sep}`));
        const jobs = scanned.filter((f) => f.includes(`${sep}jobs${sep}`));
        expect(sched.length, "the Schedules authorization surface was not scanned").toBeGreaterThan(5);
        expect(jobs.length, "the Jobs authorization surface was not scanned").toBeGreaterThan(5);
    });

    it("actually scanned the POS + Processing authorization surface", () => {
        // Same non-vacuity claim, made separately: these are different trees, and one of them going
        // quiet must not be covered by the other still being noisy.
        const routes = scanned.filter(
            (f) => f.includes(`${sep}pos${sep}`) || f.includes(`${sep}processing${sep}`),
        );
        expect(routes.length, "the POS + Processing authorization surface was not scanned").toBeGreaterThan(25);

        // And specifically the shared context, which is the one site a route-level scan cannot see.
        const shared = scanned.filter((f) => f.endsWith("operatorRouteContext.ts"));
        expect(shared.length, "operatorRouteContext was not scanned").toBe(1);
    });

    it("scans the Access-owned surface rather than nothing", () => {
        // NON-VACUITY. A lock that stopped finding files would pass forever.
        expect(scanned.length, "the Access-owned scan lost its files").toBeGreaterThan(20);
    });

    it("makes no Access-owned decision from a role key", () => {
        const offenders: string[] = [];
        for (const file of scanned) {
            const src = stripComments(readFileSync(file, "utf8"));
            for (const line of src.split("\n")) {
                for (const shape of AUTHORITY_SHAPES) {
                    if (shape.re.test(line)) {
                        offenders.push(`${file.slice(webRoot.length + 1)} :: ${shape.name} :: ${line.trim().slice(0, 90)}`);
                    }
                }
            }
        }
        /*
         * The two recorded exceptions are removed here rather than excluded from the scan, so the
         * scan still SEES them: if either file loses its role gate the entry becomes stale, and the
         * non-vacuity test below fails until someone deletes it.
         */
        const remaining = offenders.filter(
            (o) => !KNOWN_ROLE_GATED.some((k) => o.startsWith(k.suffix) || o.includes(k.suffix)),
        );
        expect(remaining, "authorization here must derive from capabilities and scope, not from a role title").toEqual([]);
    });

    it("every recorded role-gated exception is still real, and the list only shrinks", () => {
        /*
         * A named exception that has since been fixed is a lie the next reader inherits. Each entry
         * must still correspond to a file that genuinely still decides from a role key.
         */
        for (const known of KNOWN_ROLE_GATED) {
            const file = scanned.find((f) => f.endsWith(known.suffix));
            expect(file, `${known.suffix} is recorded as role-gated but is no longer scanned`).toBeTruthy();
            const src = stripComments(readFileSync(file as string, "utf8"));
            const stillGated = AUTHORITY_SHAPES.some((shape) =>
                src.split("\n").some((line) => shape.re.test(line)),
            );
            expect(
                stillGated,
                `${known.suffix} no longer decides from a role key — delete its KNOWN_ROLE_GATED entry (${known.why})`,
            ).toBe(true);
        }
        /*
         * THE CAP MOVES ONLY WITH THE SCANNED SURFACE, NEVER WITH A NEW DEFECT IN AN OLD ONE.
         *
         * It was 2 while this lock covered option-sets, entity-layouts and field-definitions. The
         * Department convergence brought two more trees under the scan — `departments/` and
         * `business-process/` — carrying nine role-title sites between them. Eight are gone: seven
         * converted to business_process.configure / .activate and the generic department DELETE was
         * retired with the route. The ninth is a WRITE SHAPE, not a route: a PATCH body carrying
         * `metadata` is the org-wide attention/SLA write, and the same handler's column-field branch
         * is capability-gated beside it.
         *
         * So 3 is the honest number for a surface that now scans two more trees than it did, and it
         * is a ceiling rather than a budget: nothing in an already-scanned tree may claim it. When
         * attention/SLA gets its own owner, this returns to 2 and does not rise again.
         */
        expect(KNOWN_ROLE_GATED.length, "the exception list may only shrink").toBeLessThanOrEqual(3);
    });

    it("actually scanned the configuration authorization surface", () => {
        const cfg = scanned.filter(
            (f) =>
                f.includes(`${sep}option-sets${sep}`) ||
                f.includes(`${sep}entity-layouts${sep}`) ||
                f.includes(`${sep}field-definitions${sep}`),
        );
        expect(cfg.length, "the configuration authorization surface was not scanned").toBeGreaterThan(8);
    });

    it("bites: the shapes it forbids are actually recognised", () => {
        // If this lock is ever loosened into uselessness, this fails first.
        const convicted = [
            'if (ctx.role === "school_director") return allow();',
            'if (!["admin", "ops"].includes(ctx.role)) return deny();',
            'if (access.roleKeys.includes("regional_lead")) return allow();',
            /*
             * The shape this lock originally MISSED. Every one of the 180 census sites was written
             * `!==`, and the first version of this regex only matched `===` — so it would have
             * passed over the entire defect it was written to catch.
             */
            'if (ctx.role !== "admin") return jsonError("Forbidden", 403);',
            'if (ctx.role !== "admin" && ctx.role !== "ops") return jsonError("Forbidden", 403);',
            /*
             * The thirteenth site, in the exact words it was written in. It lived in a shared
             * context rather than a route, governed seven identity routes from one line, and no
             * route-level scan could see it.
             */
            'const actorAuthorized = ctx.role === "admin" || ctx.role === "ops";',
            /*
             * The caller's role compared to a key OUTSIDE the seeded vocabulary. Still authority:
             * `ctx.role` is who the principal is, so inventing a new title does not make it legal.
             */
            'if (ctx.role === "processor") return allow();',
            /*
             * And a seeded key reached through some other identifier. The shape the classification
             * half exists for: the discriminator is the KEY, so renaming the variable is no escape.
             */
            'if (membership.role === "regional_lead") return allow();',
        ];
        for (const line of convicted) {
            expect(AUTHORITY_SHAPES.some((s) => s.re.test(line)), `not caught: ${line}`).toBe(true);
        }
        // And the legitimate uses are NOT convicted.
        const innocent = [
            /*
             * The POS + Processing subject vocabulary. Fourteen real lines in
             * `lib/pos/processingIdentity` look like these, and every one describes what a RECORD is
             * in a household rather than who the caller is. If the lock ever convicts them again it
             * will be switched off for that subtree, and the shared operator gate goes back to being
             * invisible — which is the failure this whole slice exists to have found.
             */
            'const lead = subjects.find((s) => s.role === "lead");',
            'if (child.role !== "child") continue;',
            'if (role === "parent" || role === "household") {',
            'const parents = subjects.filter((entry) => entry.role === "parent");',
            'const label = roleLabelFor("admin");',
            "INSERT INTO role_definitions (role_key) VALUES ('admin');",
            'expect(member.role_keys).toContain("admin");',
            'return compatibilityPortalRole(bundle.roleKeys);',
            // Parsing untrusted input is not deciding authority.
            'const role = typeof body.role === "string" ? body.role.trim() : "";',
        ];
        for (const line of innocent) {
            expect(AUTHORITY_SHAPES.some((s) => s.re.test(line)), `false positive: ${line}`).toBe(false);
        }
    });

    it("gives a custom role the SAME answer as a seeded role holding the same capability", () => {
        // The whole configurable claim, in one assertion: the decision follows the grant, and the
        // key that carried it is not consulted.
        const seeded = { roleKeys: ["admin"], permissionKeys: ["settings.users_roles"] };
        const custom = { roleKeys: ["cert_w17_whatever_they_called_it"], permissionKeys: ["settings.users_roles"] };
        expect(canManageUsersAndRoles(seeded)).toBe(true);
        expect(canManageUsersAndRoles(custom)).toBe(canManageUsersAndRoles(seeded));
    });

    it("gives a seeded role NO special treatment when it grants nothing relevant", () => {
        // `admin` with the capability stripped is just a name. If this ever returns true, a role
        // title has become a licence again.
        expect(canManageUsersAndRoles({ roleKeys: ["admin"], permissionKeys: [] })).toBe(false);
        expect(canManageUsersAndRoles({ roleKeys: ["school_director", "regional_lead"], permissionKeys: [] })).toBe(false);
    });
});
