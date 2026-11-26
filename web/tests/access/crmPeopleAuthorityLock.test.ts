/**
 * RL-13 — THE FAMILY RECORD HAS AN OWNER, AND IT IS A CAPABILITY.
 *
 * `crm.customers.read` and `crm.customers.write` have been catalogued since the permission grid and
 * granted to `admin` and `ops` in every organization. `crm.customers.write` was enforced by NOTHING —
 * not one source file named it — while the surface it describes was decided by three things that are
 * not capabilities: `requireAdminOrOps()` (portal admission wearing a role's name), `ctx.role !==
 * "admin"` (a title recorded in no grant table), and on four contact mutations, nothing at all.
 *
 * That is the third time this programme has found the same shape — `fin.read`, `communications.read`,
 * now these — so the lock is the point rather than the conversion. A migration runs once; the tree
 * keeps growing.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");

/** The bounded surface: the records that describe a family and the people in it. */
const ROOTS = [
    "app/api/admin/persons",
    "app/api/admin/contacts",
    "app/api/admin/customers",
    "app/api/admin/customer-members",
    "app/api/admin/customer-member-contacts",
    "app/api/admin/person-child-relationships",
];

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

/**
 * The one handler on this surface that neither CRM helper gates, and why that is correct.
 *
 * A person's profile photo is documents-backed: it reads the `documents` table and object storage.
 * Its GET is declared `documents.read` and goes through `assertDocumentAccess`; its mutations take
 * `documents.write`. Folding them into a CRM key because they hang off a person would say that
 * whoever may edit a household may also write documents, which is a different power.
 */
const DOCUMENT_OWNED: Record<string, readonly string[]> = {
    "app/api/admin/persons/[id]/profile-photo/route.ts": ["GET", "POST", "DELETE"],
};

/** Asserted exactly. The exception list may shrink; it may not grow without a deliberate edit. */
const ALLOWED_DOCUMENT_OWNED = 3;

/** A floor, so a classifier that stops matching fails instead of passing silently. */
const MINIMUM_HANDLERS = 25;

type Handler = { file: string; method: string; body: string };

function routeFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        const abs = path.join(WEB, dir);
        if (!fs.existsSync(abs)) return;
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
            const rel = path.join(dir, e.name);
            if (e.isDirectory()) walk(rel);
            else if (e.name === "route.ts") out.push(rel);
        }
    };
    for (const r of ROOTS) walk(r);
    return out.sort();
}

function handlers(): Handler[] {
    const found: Handler[] = [];
    for (const file of routeFiles()) {
        const src = read(file);
        const marks: { at: number; method: string }[] = [];
        const re = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) marks.push({ at: m.index, method: m[1] });
        for (let i = 0; i < marks.length; i += 1) {
            const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
            found.push({ file, method: marks[i].method, body: src.slice(marks[i].at, end) });
        }
    }
    return found;
}

const crmCapability = (body: string): string | null =>
    /requireCrmPeopleCapability\(ctx,\s*CRM_CUSTOMERS_READ\)/.test(body) ? "crm.customers.read"
    : /requireCrmPeopleCapability\(ctx,\s*CRM_CUSTOMERS_WRITE\)/.test(body) ? "crm.customers.write"
    : null;

const documentOwned = (h: Handler) => (DOCUMENT_OWNED[h.file] ?? []).includes(h.method);

describe("RL-13 — the CRM/People record surface names its authority", () => {
    const all = handlers();

    it("finds the surface it claims to be checking", () => {
        expect(routeFiles().length).toBeGreaterThan(10);
        expect(all.length).toBeGreaterThanOrEqual(MINIMUM_HANDLERS);
        expect(METHODS.some((m) => all.some((h) => h.method === m))).toBe(true);
    });

    it("gates every handler on a capability", () => {
        const ungated = all
            .filter((h) => !documentOwned(h))
            .filter((h) => crmCapability(h.body) === null)
            .map((h) => `${h.file} ${h.method}`);
        expect(ungated, "each must name a CRM capability, or be a declared document-owned handler").toEqual([]);
    });

    it("keeps reading and writing separate", () => {
        /*
         * The catalog has always said these are two keys, and the product has a real reader: the
         * Forms CRM entity search needs `crm.customers.read` and must not thereby be able to edit the
         * household it searches. A GET that demanded write would make the read grant unusable; a
         * mutation that accepted read would make the write grant meaningless.
         */
        for (const h of all) {
            if (documentOwned(h)) continue;
            const cap = crmCapability(h.body);
            if (h.method === "GET") expect(cap, `${h.file} GET`).toBe("crm.customers.read");
            else expect(cap, `${h.file} ${h.method}`).toBe("crm.customers.write");
        }
    });

    it("admits no role title as authority on this surface", () => {
        /*
         * Nine `ctx.role !== "admin"` gates lived here. They contradicted the organization's own
         * package: `ops` holds `crm.customers.write`, `ops.customers.write` AND `ops.contacts.write`
         * in every organization, so the title was denying a role the grants had already admitted.
         */
        const offenders: string[] = [];
        for (const file of routeFiles()) {
            for (const [i, line] of read(file).split("\n").entries()) {
                if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
                if (/ctx\.role\s*[!=]==\s*"(admin|ops)"/.test(line)) offenders.push(`${file}:${i + 1}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("leaves no handler on portal admission alone", () => {
        const stragglers = routeFiles().filter((f) => /await requireAdminOrOps\(\)/.test(read(f)));
        expect(stragglers).toEqual([]);
    });

    it("keeps the document-owned exception shrink-only, and true", () => {
        const declared = Object.values(DOCUMENT_OWNED).reduce((n, ms) => n + ms.length, 0);
        expect(declared, "lower this deliberately; never raise it").toBe(ALLOWED_DOCUMENT_OWNED);
        for (const [file, methods] of Object.entries(DOCUMENT_OWNED)) {
            const src = read(file);
            expect(src, `${file} claims to be document-owned but names no document authority`)
                .toMatch(/assertDocumentAccess|requireDocumentWrite|DOCUMENT_READ_PERMISSION/);
            for (const m of methods) {
                const h = all.find((x) => x.file === file && x.method === m);
                expect(h, `${file} ${m} is exempted but does not exist`).toBeTruthy();
                expect(crmCapability(h!.body), `${file} ${m} must not also take a CRM key`).toBe(null);
            }
        }
    });

    it("activates the keys rather than leaving them catalogued and inert", () => {
        /*
         * The defect this closed, stated as a property. `fin.read` and `communications.read` were each
         * found in exactly this state — offered in the role editor, granted to everyone who needed
         * them, and consulted by nothing — so an organization could withhold the capability and change
         * nothing about what the role could do.
         */
        const sites = (key: string) =>
            routeFiles().filter((f) => read(f).includes(key === "crm.customers.read" ? "CRM_CUSTOMERS_READ" : "CRM_CUSTOMERS_WRITE")).length;
        expect(sites("crm.customers.read"), "crm.customers.read gates nothing — a dormant key").toBeGreaterThan(0);
        expect(sites("crm.customers.write"), "crm.customers.write gates nothing — a dormant key").toBeGreaterThan(0);

        const helper = read("lib/access/crmPeopleAuthority.ts");
        expect(helper).toMatch(/"crm\.customers\.read"/);
        expect(helper).toMatch(/"crm\.customers\.write"/);
        // The refusal must name the key, so a denial is debuggable rather than merely forbidden.
        expect(helper).toMatch(/required_permission/);
    });

    it("does not let the relationship VOCABULARY ride on record authority", () => {
        /*
         * `customer-person-role-types` and `person-relationship-type-settings` configure what a
         * relationship may BE, for the whole organization. That is a different power from changing one
         * family's record, so they are deliberately outside this surface and keep their own gates
         * until Configuration authority claims them. Pulling them in here would say that whoever may
         * edit a family may also redefine what families are.
         */
        for (const f of ["app/api/admin/customer-person-role-types/route.ts",
                         "app/api/admin/person-relationship-type-settings/route.ts"]) {
            expect(fs.existsSync(path.join(WEB, f)), `${f} missing`).toBe(true);
            expect(read(f), `${f} must not take a CRM record capability`).not.toMatch(/CRM_CUSTOMERS_/);
        }
    });
});
