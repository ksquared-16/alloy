/**
 * RL-25 — KEEPING THE ENROLLMENT RECORD IS NOT DECIDING THE OUTCOME.
 *
 * Eighteen mutations ran an organization's enrollment with no functional authority. SIXTEEN were
 * reachable through PORTAL ADMISSION ALONE — `requireAdminOrOps()` resolves admission and no role,
 * as its own docstring records — one asked only for a session, and `lead-location` had no gate of
 * any kind. Editing a family's inquiry, moving a child up the waitlist, cancelling an enrollment
 * agreement and marking a child Enrolled were all decided by who could reach the portal.
 *
 * `enrollment.record.manage` keeps the RECORD; `enrollment.decide` changes the OUTCOME. Neither
 * implies the other, and both are seeded to admin AND ops — ops already holds the whole Inquiry
 * product in the same seed function, so operating enrollment is its day job.
 *
 * ── THE KEY THAT MUST NOT EXIST YET ──
 *
 * `enrollment.record.delete`. D1 approved it and D2 made it admin-only, but D2 also held it back to
 * Slice 2. Cataloguing a key whose enforcement lands later puts an inert row in the role editor,
 * which is the revocation theatre W-50/IA-R8 forbid. This lock fails if it appears in the catalog
 * migration, in a seed region, or as a gate — and it fails in the other direction too: the Delete
 * Lead route must still carry its ORIGINAL authority, so the exclusion cannot be achieved by
 * quietly leaving the route open.
 *
 * ── AND THE ONE THAT MUST NEVER EXIST ──
 *
 * `enrollment.configure`. Enrollment process design is `business_process.configure` / `.activate`.
 *
 * ── THE CONDITIONAL OWNER ──
 *
 * `opportunity-customer-members/[id]` PATCH holds two powers by body shape. The fork is
 * `requiredOcmPatchCapability`, and this lock asserts the fork exists, that the route calls it
 * rather than a literal, and that `outcome_status_key` is what turns the handler into a decision.
 * Flattening it onto one key is the failure this case exists to catch.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const MIGRATIONS = path.join(WEB, "..", "supabase", "migrations");
const MIGRATION = path.join(MIGRATIONS, "20260916050000_enrollment_record_authority.sql");
const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as {
    routes: Record<
        string,
        Record<string, { status: string; capability?: string; helper?: string; note?: string; reason?: string }>
    >;
    ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT?: { entries?: { route: string; method: string; also_requires?: string }[] };
};

const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

function handlerBody(src: string, method: string): string | null {
    const m = new RegExp(`export async function ${method}\\s*\\(`).exec(src);
    if (!m) return null;
    let i = m.index + m[0].length - 1;
    let depth = 0;
    for (; i < src.length; i += 1) {
        if (src[i] === "(") depth += 1;
        else if (src[i] === ")") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    const b = src.indexOf("{", i);
    depth = 0;
    for (let j = b; j < src.length; j += 1) {
        if (src[j] === "{") depth += 1;
        else if (src[j] === "}") {
            depth -= 1;
            if (depth === 0) return src.slice(b, j + 1);
        }
    }
    return src.slice(b);
}

/** Ordinary mutation of the enrollment record. */
const RECORD: [string, string][] = [
    ["opportunities/[id]/route.ts", "PATCH"],
    ["opportunities/[id]/lead-location/route.ts", "PATCH"],
    ["opportunity-customer-members/route.ts", "POST"],
    ["child-participation/route.ts", "POST"],
    ["enrollment/assignment-quote/route.ts", "POST"],
];
/** Changing the enrollment outcome: status, agreement, placement, waitlist position. */
const DECIDE: [string, string][] = [
    ["enrollment-status-transition/execute/route.ts", "POST"],
    ["child-enrollment-agreements/route.ts", "POST"],
    ["child-enrollment-agreements/[id]/cancel/route.ts", "POST"],
    ["child-enrollment-agreements/[id]/ending/route.ts", "POST"],
    ["child-enrollment-agreements/[id]/ended/route.ts", "POST"],
    ["child-placements/route.ts", "POST"],
    ["placement-candidates/[candidateId]/manual-position/route.ts", "POST"],
    ["placement-candidates/[candidateId]/overrides/route.ts", "POST"],
    ["placement-candidates/[candidateId]/overrides/[overrideId]/release/route.ts", "POST"],
];
/** One route, two owners, decided by the request body. */
const CONDITIONAL: [string, string] = ["opportunity-customer-members/[id]/route.ts", "PATCH"];
/** Read-like POSTs. Persistence decides ownership, not the HTTP verb. */
const REVIEWED_NONE: [string, string][] = [
    ["enrollment-status-transition/preflight/route.ts", "POST"],
    ["enrollment-status-transition/context/route.ts", "POST"],
];
/** Slice 2. Must keep its ORIGINAL authority and gain no capability gate here. */
const DELETE_LEAD: [string, string] = ["opportunities/[id]/delete/route.ts", "POST"];

const GATED: [string, string][] = [...RECORD, ...DECIDE, CONDITIONAL];
const ALL_EIGHTEEN: [string, string][] = [...GATED, ...REVIEWED_NONE, DELETE_LEAD];
const read = (rel: string) => fs.readFileSync(path.join(API, rel), "utf8");
const LEAD_LOCATION = "opportunities/[id]/lead-location/route.ts";

describe("RL-25 — the surface exists, so this lock cannot pass by measuring nothing", () => {
    it("finds all eighteen Enrollment-shaped handlers on disk", () => {
        expect(RECORD.length).toBe(5);
        expect(DECIDE.length).toBe(9);
        expect(REVIEWED_NONE.length).toBe(2);
        expect(ALL_EIGHTEEN.length).toBe(18);
        for (const [rel, method] of ALL_EIGHTEEN) {
            expect(fs.existsSync(path.join(API, rel)), `${rel} is missing`).toBe(true);
            expect(handlerBody(read(rel), method), `${method} ${rel} is not exported`).toBeTruthy();
        }
    });

    it("the migration this lock asserts over exists", () => {
        expect(fs.existsSync(MIGRATION)).toBe(true);
    });
});

describe("RL-25 — every record mutation requires enrollment.record.manage", () => {
    it.each(RECORD)("%s %s gates on ENROLLMENT_RECORD_MANAGE at its own call site", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(/requireEnrollmentCapability\s*\(\s*access\s*,\s*ENROLLMENT_RECORD_MANAGE\s*\)/);
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
        expect(body).not.toContain("ENROLLMENT_DECIDE");
    });
});

describe("RL-25 — every decision requires enrollment.decide", () => {
    it.each(DECIDE)("%s %s gates on ENROLLMENT_DECIDE at its own call site", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(/requireEnrollmentCapability\s*\(\s*access\s*,\s*ENROLLMENT_DECIDE\s*\)/);
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
        expect(body).not.toContain("ENROLLMENT_RECORD_MANAGE");
    });
});

describe("RL-25 — the conditional owner is not flattened onto one key", () => {
    const [rel, method] = CONDITIONAL;

    it("the OCM patch resolves its capability from the BODY, not from a literal", () => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(
            /requireEnrollmentCapability\s*\(\s*access\s*,\s*requiredOcmPatchCapability\s*\(\s*body\s*\)\s*\)/,
        );
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
        // Flattening is exactly a hard-coded key here.
        expect(body).not.toMatch(/requireEnrollmentCapability\s*\(\s*access\s*,\s*ENROLLMENT_(RECORD_MANAGE|DECIDE)\s*\)/);
    });

    it("authority is decided AFTER the body is parsed, or the fork could not see it", () => {
        const body = handlerBody(read(rel), method)!;
        const parsedAt = body.indexOf("await request.json()");
        const gatedAt = body.indexOf("requiredOcmPatchCapability");
        expect(parsedAt).toBeGreaterThan(-1);
        expect(gatedAt).toBeGreaterThan(parsedAt);
    });

    it("admission is still resolved BEFORE the body is read", () => {
        const body = handlerBody(read(rel), method)!;
        expect(body.indexOf("getAdminAccessContextCached")).toBeLessThan(body.indexOf("await request.json()"));
    });

    it("outcome_status_key is what makes the body a decision", () => {
        const src = fs.readFileSync(path.join(WEB, "lib", "access", "enrollmentAuthority.ts"), "utf8");
        const code = codeOnly(src);
        expect(code).toMatch(/OCM_DECISION_BEARING_FIELDS\s*=\s*\[\s*"outcome_status_key"\s*\]/);
        // Presence, not truthiness: clearing an outcome is still deciding one.
        expect(code).toMatch(/hasOwnProperty\.call\(\s*body\s*,\s*field\s*\)/);
        expect(code).toMatch(/return ENROLLMENT_DECIDE/);
    });

    it("the understatement in the route table is carried as an explicit debt", () => {
        const entry = INVENTORY.routes[`app/api/admin/${rel}`]?.[method];
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe("enrollment.record.manage");
        expect(entry?.note ?? "").toContain("enrollment.decide");
        const debt = INVENTORY.ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT?.entries ?? [];
        const row = debt.find((e) => e.route === `app/api/admin/${rel}` && e.method === method);
        expect(row, "the conditional owner must be recorded as debt, not quietly understated").toBeTruthy();
        expect(row?.also_requires).toBe("enrollment.decide");
    });
});

describe("RL-25 — portal admission no longer confers Enrollment mutation authority", () => {
    it.each(GATED)("%s %s has no portal fallback, role title or env flag", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).not.toMatch(/requireAdminOrOps\s*\(/);
        expect(body).not.toMatch(/requireAdmin\s*\(/);
        expect(body).not.toMatch(/ctx\.role\s*[!=]==|auth\.role\s*[!=]==|roleKeys/);
        expect(body).not.toMatch(/process\.env\.[A-Z_]+/);
    });

    it.each(GATED)("%s %s substitutes no neighbouring authority", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        for (const foreign of [
            // The four inert legacy Opportunity keys. None may become the answer.
            "crm.opportunities.read", "crm.opportunities.write",
            "ops.opportunities.read", "ops.opportunities.write",
            // Neighbours the model proved are not Enrollment.
            "crm.customers.write", "CRM_CUSTOMERS_WRITE",
            "business_process.configure", "BUSINESS_PROCESS_CONFIGURE",
            "business_process.activate", "BUSINESS_PROCESS_ACTIVATE",
            "work.operate", "WORK_OPERATE",
            "forms.author", "forms.submissions",
            "fin.read", "fin.write",
            "settings.manage",
        ]) {
            expect(body, `${method} ${rel} must not borrow ${foreign}`).not.toContain(foreign);
        }
    });

    it.each([...RECORD, ...DECIDE])("%s %s is declared with the owner it enforces", (rel, method) => {
        const entry = INVENTORY.routes[`app/api/admin/${rel}`]?.[method];
        const expected = RECORD.some(([r, m]) => r === rel && m === method)
            ? "enrollment.record.manage"
            : "enrollment.decide";
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe(expected);
        expect(entry?.helper).toBe("requireEnrollmentCapability");
    });
});

describe("RL-25 — a read-like POST is not gated for being a POST", () => {
    it.each(REVIEWED_NONE)("%s %s persists nothing and is reviewed none", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
        expect(body).not.toContain("requireEnrollmentCapability");
        const entry = INVENTORY.routes[`app/api/admin/${rel}`]?.[method];
        expect(entry?.status).toBe("none");
        expect(entry?.reason ?? "").toMatch(/read-like|no insert|persist/i);
    });
});

describe("RL-25 — Delete Lead is excluded from Slice 1, in both directions", () => {
    const [rel, method] = DELETE_LEAD;

    it("gains no Enrollment capability gate", () => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).not.toContain("requireEnrollmentCapability");
        expect(body).not.toContain("enrollment.record.delete");
    });

    it("KEEPS its original authority — the exclusion is not an opening", () => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(/requireAdminOrOps\s*\(/);
    });

    it("the delete key is catalogued nowhere yet", () => {
        const mig = fs.readFileSync(MIGRATION, "utf8");
        // Named only inside the guard that forbids it, never inserted or granted.
        expect(mig).not.toMatch(/INSERT INTO public\.permission_definitions[\s\S]{0,400}enrollment\.record\.delete/);
        expect(mig).toContain("enrollment.record.delete must not be catalogued in Slice 1");
        for (const f of fs.readdirSync(MIGRATIONS)) {
            if (!f.endsWith(".sql") || f === path.basename(MIGRATION)) continue;
            const src = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
            expect(src, `${f} must not catalog the Slice-2 delete key`).not.toContain("'enrollment.record.delete'");
        }
    });
});

describe("RL-25 — the Lead-location destination is scope-checked", () => {
    it("validates the DESTINATION against the caller's site scope, not just the org", () => {
        /*
         * The defect this closes: the route asserted the lead's CURRENT location was in scope and
         * looked the destination up by org alone, so a site-restricted operator could move a lead
         * to a site they cannot see. `location_id` is the column `assertOpportunityInAccessScope`
         * reads, so the write could rewrite the attribute every later scope decision depends on.
         */
        const body = codeOnly(handlerBody(read(LEAD_LOCATION), "PATCH")!);
        expect(body).toMatch(/locationAllowedUnderSiteScope\s*\(\s*supabase\s*,\s*ctx\.orgId\s*,\s*scopeDim\s*,\s*locationId\s*\)/);
    });

    it("refuses BEFORE the update, so a denied move leaves the lead where it was", () => {
        const body = handlerBody(read(LEAD_LOCATION), "PATCH")!;
        const check = body.indexOf("locationAllowedUnderSiteScope");
        const write = body.search(/\.update\(\{\s*location_id/);
        expect(check).toBeGreaterThan(-1);
        expect(write).toBeGreaterThan(-1);
        expect(check).toBeLessThan(write);
    });

    it("uses the existing site authority rather than inventing scope semantics", () => {
        const src = read(LEAD_LOCATION);
        expect(src).toContain('from "@/lib/admin/accessScope"');
        const body = codeOnly(handlerBody(src, "PATCH")!);
        expect(body).not.toMatch(/allowedSiteLocationIds\s*\.\s*(includes|indexOf)/);
    });
});

describe("RL-25 — the forbidden keys never appear", () => {
    it("enrollment.configure exists nowhere in source or migrations", () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs);
                else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
                    if (/["']enrollment\.configure["']/.test(codeOnly(fs.readFileSync(abs, "utf8")))) {
                        offenders.push(path.relative(WEB, abs));
                    }
                }
            }
        };
        walk(path.join(WEB, "app", "api"));
        walk(path.join(WEB, "lib"));
        expect(
            offenders,
            `enrollment process design is business_process.configure/.activate: ${offenders.join(", ")}`,
        ).toEqual([]);
    });

    it("the helper defines exactly the two approved Slice-1 keys", () => {
        const src = codeOnly(fs.readFileSync(path.join(WEB, "lib", "access", "enrollmentAuthority.ts"), "utf8"));
        const gated = [...src.matchAll(/export const (ENROLLMENT_RECORD_MANAGE|ENROLLMENT_DECIDE)\s*=\s*"([a-z_.]+)" as const/g)]
            .map((m) => m[2])
            .sort();
        expect(gated).toEqual(["enrollment.decide", "enrollment.record.manage"]);
        expect(src).not.toMatch(/ctx\.role|roleKeys|process\.env/);
    });

    it("the four inert legacy Opportunity keys stay out of the Enrollment authority path", () => {
        const src = codeOnly(fs.readFileSync(path.join(WEB, "lib", "access", "enrollmentAuthority.ts"), "utf8"));
        for (const k of [
            "crm.opportunities.read", "crm.opportunities.write",
            "ops.opportunities.read", "ops.opportunities.write",
        ]) {
            expect(src, `${k} must not become the answer`).not.toContain(k);
        }
    });
});

describe("RL-25 — the migration seeds the approved package and forbids the exclusions", () => {
    const mig = () => fs.readFileSync(MIGRATION, "utf8");

    it("catalogs both Slice-1 keys under the Enrollment group", () => {
        const m = mig();
        expect(m).toContain("'enrollment.record.manage'");
        expect(m).toContain("'enrollment.decide'");
        expect(m).toMatch(/INSERT INTO public\.permission_definitions[\s\S]*?'enrollment'/);
    });

    it("seeds BOTH keys to admin AND ops — ops operates enrollment", () => {
        const m = mig();
        expect(m).toContain("the ops seed region must name both Enrollment keys");
        expect(m).toContain("the admin seed region must name both Enrollment keys");
        expect(m).toMatch(/role_key IN \('admin', 'ops'\)/);
    });

    it("refuses to grant a role outside admin/ops, by structure not by label", () => {
        const m = mig();
        expect(m).toContain("a role outside admin/ops received an Enrollment capability");
        expect(m).toMatch(/rd\.role_key IN \('admin', 'ops'\) AND rd\.is_active/);
        // No display-name matching anywhere in the backfill.
        expect(m).not.toMatch(/role_definitions[\s\S]{0,200}\bname\s+(ILIKE|LIKE|=)/i);
    });

    it("aborts if the Slice-2 delete key or enrollment.configure appears", () => {
        const m = mig();
        expect(m).toContain("enrollment.record.delete must not be catalogued in Slice 1");
        expect(m).toContain("enrollment.configure must not exist");
    });

    it("asserts the legacy Opportunity grants are left exactly as they were", () => {
        const m = mig();
        expect(m).toContain("crm.opportunities.read");
        expect(m).toContain("ops.opportunities.write");
        expect(m).toContain("this slice must leave them exactly as they were");
    });
});

/*
 * Enrollment-shaped by ADDRESS. Every one of the eighteen lives under one of these, so a new
 * sibling route is caught the moment it is added.
 */
const ENROLLMENT_PREFIXES = [
    "opportunities/",
    "opportunity-customer-members/",
    "child-enrollment-agreements/",
    "child-placements/",
    "placement-candidates/",
    "enrollment-status-transition/",
    "enrollment/",
    "child-participation/",
];
/*
 * ...and Enrollment-shaped by EFFECT, for a writer that appears somewhere else entirely. Narrowed
 * to an actual write: `childcare-attendance` and `scheduling` both SELECT from these tables to do
 * their own jobs and are not Enrollment mutations. A reader is not an owner.
 */
const ENROLLMENT_TABLE_WRITE =
    /\.from\("(opportunities|opportunity_customer_members|child_enrollment_agreements|child_placements|placement_candidates|placement_candidate_overrides)"\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/;

function enrollmentShapedHandlers(): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) walk(abs);
            else if (e.name === "route.ts") {
                const raw = fs.readFileSync(abs, "utf8");
                const rel = path.relative(API, abs).split(path.sep).join("/");
                const byAddress = ENROLLMENT_PREFIXES.some((p) => rel.startsWith(p));
                const byEffect = ENROLLMENT_TABLE_WRITE.test(codeOnly(raw));
                if (!byAddress && !byEffect) continue;
                for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
                    if (new RegExp(`export async function ${m}\\b`).test(raw)) found.push(`${rel}|${m}`);
                }
            }
        }
    };
    walk(API);
    return found;
}

describe("RL-25 — the classification is complete", () => {
    it("the detector actually sees all eighteen, so the next case cannot pass by finding nothing", () => {
        const seen = new Set(enrollmentShapedHandlers());
        const missed = ALL_EIGHTEEN.map(([r, m]) => `${r}|${m}`).filter((k) => !seen.has(k));
        expect(missed, `the completeness detector missed: ${missed.join(", ")}`).toEqual([]);
        expect(seen.size).toBeGreaterThanOrEqual(18);
    });

    it("fails when a new Enrollment-shaped mutation appears unclassified", () => {
        const known = new Set(ALL_EIGHTEEN.map(([r, m]) => `${r}|${m}`));
        const offenders: string[] = [];
        for (const key of enrollmentShapedHandlers()) {
            if (known.has(key)) continue;
            const [rel, m] = key.split("|");
            const decl = INVENTORY.routes[`app/api/admin/${rel}`]?.[m];
            // Owned by another product, or reviewed as needing none, both count as classified.
            // Only silence is a failure.
            if (decl?.status === "declared" || decl?.status === "none") continue;
            offenders.push(`${m} ${rel}`);
        }
        expect(
            offenders,
            `these are Enrollment-shaped and unowned: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});
