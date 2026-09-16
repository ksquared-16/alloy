import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    BUSINESS_PROCESS_ACTIVATE,
    BUSINESS_PROCESS_CONFIGURE,
    hasBusinessProcessCapability,
    requireBusinessProcessCapability,
} from "@/lib/access/businessProcessAuthority";

const repoRoot = join(__dirname, "..", "..", "..");
const webRoot = join(__dirname, "..", "..");
const API = join(webRoot, "app", "api", "admin");
const read = (p: string) => readFileSync(join(API, p), "utf8");

/**
 * DEPARTMENT PRODUCT RETIREMENT + BUSINESS PROCESS AUTHORITY CONVERGENCE V1.
 *
 * The convergence census proved that every lifecycle operation under `/api/admin/departments` is a
 * Business Process operation wearing a legacy namespace. These tests pin the three claims that slice
 * makes: the capability is the process family's, the retired product gains no vocabulary, and the
 * destructive route is gone rather than hidden.
 */
describe("business process authority", () => {
    it("answers from capabilities, never from a role title", () => {
        const configurer = { permissionKeys: [BUSINESS_PROCESS_CONFIGURE] };
        const activator = { permissionKeys: [BUSINESS_PROCESS_ACTIVATE] };

        expect(hasBusinessProcessCapability(configurer, BUSINESS_PROCESS_CONFIGURE)).toBe(true);
        expect(hasBusinessProcessCapability(activator, BUSINESS_PROCESS_ACTIVATE)).toBe(true);

        // Neither implies the other. A role trusted to design a process is not thereby trusted to
        // switch the tenant onto it.
        expect(hasBusinessProcessCapability(configurer, BUSINESS_PROCESS_ACTIVATE)).toBe(false);
        expect(hasBusinessProcessCapability(activator, BUSINESS_PROCESS_CONFIGURE)).toBe(false);

        // A role LABEL carries nothing. This is the whole point of the program.
        const titularAdmin = { permissionKeys: [], role: "admin" } as { permissionKeys: string[]; role: string };
        expect(hasBusinessProcessCapability(titularAdmin, BUSINESS_PROCESS_CONFIGURE)).toBe(false);
        expect(requireBusinessProcessCapability(titularAdmin, BUSINESS_PROCESS_CONFIGURE)?.status).toBe(403);
        expect(requireBusinessProcessCapability(configurer, BUSINESS_PROCESS_CONFIGURE)).toBeNull();
    });

    it("a missing or null capability list refuses rather than throwing", () => {
        expect(hasBusinessProcessCapability({}, BUSINESS_PROCESS_CONFIGURE)).toBe(false);
        expect(hasBusinessProcessCapability({ permissionKeys: null }, BUSINESS_PROCESS_ACTIVATE)).toBe(false);
    });

    it("every converged handler enforces the capability its operation belongs to", () => {
        const configure: [string, string][] = [
            ["departments/route.ts", "POST — provisioning a new process's runtime identity"],
            ["departments/[departmentId]/lifecycle-builder/route.ts", "the builder itself"],
            ["departments/[departmentId]/lifecycle-requirements/route.ts", "stage requirements"],
            ["departments/[departmentId]/lifecycle-actions-matrix/route.ts", "the actions matrix"],
            ["business-process/configuration/publish/route.ts", "publishing configuration"],
        ];
        for (const [path, why] of configure) {
            const src = read(path);
            expect(src, `${path} must ask for configure authority (${why})`).toContain("BUSINESS_PROCESS_CONFIGURE");
            expect(src, `${path} must use the shared helper`).toContain("requireBusinessProcessCapability");
        }

        const activation = read("departments/[departmentId]/lifecycle-activation/route.ts");
        expect(activation).toContain("BUSINESS_PROCESS_ACTIVATE");
        // Activation must NOT quietly accept the configure key — that would collapse the split.
        expect(activation).not.toContain("BUSINESS_PROCESS_CONFIGURE");
    });

    it("the department DELETE route is gone, not hidden behind a removed UI", () => {
        const src = read("departments/[departmentId]/route.ts");
        expect(src, "a destructive admin-only handler must not survive its retired UI").not.toMatch(
            /export\s+async\s+function\s+DELETE/,
        );
        // And nothing anywhere still calls it.
        const client = join(webRoot, "app", "legacy-admin", "system", "departments", "DepartmentsClient.tsx");
        expect(existsSync(client), "the legacy Departments client must be gone").toBe(false);
        expect(
            existsSync(join(webRoot, "app", "adminV2", "settings", "departments", "page.tsx")),
            "the Departments settings destination must be gone",
        ).toBe(false);
    });

    it("PATCH authority follows the write shape, so a process key is not a generic JSON write key", () => {
        const src = read("departments/[departmentId]/route.ts");
        // The process-owned columns take the capability...
        expect(src).toContain("PROCESS_OWNED_FIELDS");
        expect(src).toContain("BUSINESS_PROCESS_CONFIGURE");
        // ...and the attention/SLA metadata shape does NOT borrow it.
        const metadataBranch = /body\.metadata !== undefined && ctx\.role !== "admin"/;
        expect(
            src,
            "the attention/SLA metadata write keeps the authority it had; it must not be folded into a process key",
        ).toMatch(metadataBranch);
    });

    it("the retired product gains no capability vocabulary", () => {
        const migrations = join(repoRoot, "supabase", "migrations");
        for (const file of ["20260915090000_business_process_authority.sql", "20260915091000_business_process_authority_default_seed.sql"]) {
            const sql = readFileSync(join(migrations, file), "utf8");
            const declared = sql.match(/'departments\.[a-z_.]+'/g) ?? [];
            expect(declared, `${file} must not create a departments.* capability`).toEqual([]);
        }
    });

    it("no Departments destination survives in the configuration navigation", () => {
        const domains = readFileSync(join(webRoot, "lib", "adminV2", "configurationWorkspaceDomains.ts"), "utf8");
        expect(domains).not.toContain('settings("departments")');
        expect(domains).not.toMatch(/label:\s*"Departments"/);
    });
});

/**
 * LIFECYCLE BUILDER AUTHORITY CONVERGENCE V1.
 *
 * The `lifecycle-builder/*` mutations were the last Business Process surface still deciding
 * authority for itself. The census split them by what they actually mutate rather than by the
 * folder they share:
 *
 *   CONFIGURE — `process-participation` writes `participation_v1` and `process-work-views` writes
 *   `work_views_v1`, both on the department row, both mounted in Settings -> Business Process. They
 *   change what a process WOULD do. Both were gated on `ctx.role !== "admin"`.
 *
 *   NOT OURS — `complete-stage-work`, `family-close` and `participant-decisions` execute work
 *   inside a RUNNING process for one subject, mounted in My Tasks and the Focus Panel's Current
 *   Work card. `activate` means "changing which configuration is actually live"; these change what
 *   the process DID for one family, which is neither half of the split. They keep portal admission
 *   plus department scope and are recorded as WORK_AUTHORITY_MODEL_DEBT rather than given a false
 *   owner — gating an operator's own task completion on process-activation authority would be
 *   semantically wrong and would break daily operations.
 *
 * The completeness case below is the one that matters over time: a NEW mutation added to this
 * folder fails until someone classifies it.
 */
describe("lifecycle builder authority — every mutation is classified", () => {
    const BUILDER = join(API, "lifecycle-builder");
    const INVENTORY = JSON.parse(
        readFileSync(join(webRoot, "scripts", "routeCapabilities.declared.json"), "utf8"),
    ) as { routes: Record<string, Record<string, { status: string; capability?: string; note?: string }>> };

    /** Strip comments: the prohibitions are about what the code DOES, not how it explains itself. */
    const codeOnly = (src: string) =>
        src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

    /** Every lifecycle-builder handler that mutates, discovered rather than remembered. */
    const mutations = readdirSync(BUILDER, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => /export async function (POST|PATCH|PUT|DELETE)/.test(
            readFileSync(join(BUILDER, name, "route.ts"), "utf8"),
        ))
        .sort();

    const CONFIGURE_OWNED = ["process-participation", "process-work-views"];
    const WORK_DEBT = ["complete-stage-work", "family-close", "participant-decisions"];

    it("finds the bounded surface, so this lock cannot pass by measuring nothing", () => {
        expect(mutations.length).toBeGreaterThanOrEqual(5);
        expect(mutations).toEqual(expect.arrayContaining([...CONFIGURE_OWNED, ...WORK_DEBT]));
    });

    it("fails when a new mutation appears without a classification", () => {
        // The completeness property. Every mutating handler in this folder must be either
        // capability-owned or carry an explicit recorded debt — never merely unlisted.
        const unclassified = mutations.filter(
            (m) => !CONFIGURE_OWNED.includes(m) && !WORK_DEBT.includes(m),
        );
        expect(
            unclassified,
            `classify these lifecycle-builder mutations as configure, activate, or recorded debt: ${unclassified.join(", ")}`,
        ).toEqual([]);
    });

    it.each(CONFIGURE_OWNED)("%s is owned by business_process.configure at its call site", (name) => {
        const src = codeOnly(readFileSync(join(BUILDER, name, "route.ts"), "utf8"));
        // The CALL, not the import: a file that merely names the helper would satisfy a
        // `toContain` while the gate itself had been deleted.
        expect(src).toMatch(
            /requireBusinessProcessCapability\(\s*access\s*,\s*BUSINESS_PROCESS_CONFIGURE\s*\)/,
        );
        expect(src).toMatch(/if \(capDenied\) return capDenied;/);
        // Configure must not silently accept the activation key.
        expect(src).not.toContain("BUSINESS_PROCESS_ACTIVATE");
    });

    it.each(CONFIGURE_OWNED)("%s decides on the grant, never on a role title", (name) => {
        const src = codeOnly(readFileSync(join(BUILDER, name, "route.ts"), "utf8"));
        expect(src).not.toMatch(/ctx\.role\s*[!=]==\s*["'`](admin|ops)["'`]/);
        expect(src).not.toMatch(/roleKeys/);
    });

    it.each(CONFIGURE_OWNED)("%s keeps its department scope check after the capability check", (name) => {
        const src = codeOnly(readFileSync(join(BUILDER, name, "route.ts"), "utf8"));
        // Holding process authority must not widen which operational domains may be edited.
        expect(src).toContain("scopeDimensionsFromAccess");
        expect(src).toMatch(/lifecycleBuilderDepartmentScopeError|departmentIdAllowed/);
    });

    it.each(CONFIGURE_OWNED)("%s is declared in the route inventory with the same owner", (name) => {
        const entry = INVENTORY.routes[`app/api/admin/lifecycle-builder/${name}/route.ts`]?.POST;
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe("business_process.configure");
    });

    it.each(WORK_DEBT)("%s is owned by work.operate now, and still not by Business Process", (name) => {
        /*
         * THE DEBT THIS ONCE RECORDED IS RESOLVED, AND THE CLAIM IT PROTECTED IS NOT.
         *
         * Lifecycle Builder V1 left these three as WORK_AUTHORITY_MODEL_DEBT because no truthful
         * owner existed: they operate on a record inside a RUNNING process, which is neither
         * `business_process.configure` (what a process would do) nor `.activate` (which
         * configuration is live). Work Authority V1 created that owner, so the assertion moves from
         * "recorded as debt" to "owned by work.operate" — while the original claim, that Business
         * Process must never absorb them, is asserted exactly as before.
         */
        const src = codeOnly(readFileSync(join(BUILDER, name, "route.ts"), "utf8"));
        expect(src).not.toContain("BUSINESS_PROCESS_CONFIGURE");
        expect(src).not.toContain("BUSINESS_PROCESS_ACTIVATE");
        // The keys the Director ruled out by name must still not exist.
        expect(src).not.toContain("work.manage");
        expect(src).not.toContain("work.assign");

        const entry = INVENTORY.routes[`app/api/admin/lifecycle-builder/${name}/route.ts`]?.POST;
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe("work.operate");
    });

    it("keeps the two families disjoint, so a rename cannot merge them", () => {
        expect(CONFIGURE_OWNED.filter((m) => WORK_DEBT.includes(m))).toEqual([]);
    });
});
