import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
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
