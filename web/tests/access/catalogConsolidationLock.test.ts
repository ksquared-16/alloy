/**
 * W-9 / RL-7 (tier A) — one catalog, one FK, and the API validates against the
 * table the FK names.
 *
 * The subject is the migration tree and the product tree, by DISCOVERY. That is
 * deliberate and it is the third lesson this workstream has learned the hard way:
 * RL-1 was defeated twice by a pinned subject (three hand-listed directories, then
 * a module's own deprecated alias) and RL-4 once (a hard-coded list of the three
 * files W-5 had already fixed). A lock that enumerates cannot discover. So nothing
 * below is checked against a list of known-good names.
 *
 * What makes this lock necessary is that W-9's exit criterion was met by a
 * migration from ANOTHER track — 20260729120000_access_v2_phase0_catalog_and_role_
 * definition_integrity.sql — which no Access & Identity V2 workstream owns. An
 * invariant nobody's workstream owns is an invariant that reopens silently.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(__dirname, "..", "..");
const migrationsDir = join(webRoot, "..", "supabase", "migrations");

/** The canonical catalog table, and the two names Phase 0 demoted to views. */
const CANONICAL = "permission_definitions";
const DEPRECATED = ["permissions", "permission_keys"] as const;

/** The migration that consolidated the catalog. Ordering is by filename, as Supabase applies them. */
const CONSOLIDATION = "20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql";
/** The migration that revokes anon's public-schema access (platform issue #318 Part A). */
const ANON_REVOCATION = "20260804180000_platform_anon_privilege_revocation.sql";

/**
 * Strip SQL comments before matching. RL-6 learned this one: the W-8 comment block
 * deliberately names the symbols it deleted, so a lock that reads comments fails on
 * prose. Phase 0's header names all three catalog tables in exactly that way.
 */
function executableSql(raw: string): string {
    return raw
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--[^\n]*/g, " ")
        .replace(/\s+/g, " ");
}

type Migration = { name: string; sql: string };

function migrations(): Migration[] {
    return readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((name) => ({ name, sql: executableSql(readFileSync(join(migrationsDir, name), "utf8")) }));
}

/** A table-or-view reference, quoted or not, optionally schema-qualified. */
const OBJ = String.raw`"?public"?\s*\.\s*"?(\w+)"?`;

// ---------------------------------------------------------------------------
// Foreign keys on role_permission_grants.permission_key, replayed in order.
// ---------------------------------------------------------------------------

type Fk = { name: string; references: string; onDelete: string; from: string };

function replayPermissionKeyFks(): { live: Fk[]; addsSeen: number; dropsSeen: number } {
    const add = new RegExp(
        String.raw`ALTER\s+TABLE\s+(?:ONLY\s+)?${OBJ}\s+ADD\s+CONSTRAINT\s+"?(\w+)"?\s+FOREIGN\s+KEY\s*\(\s*"?permission_key"?\s*\)\s*REFERENCES\s+${OBJ}\s*\(\s*"?key"?\s*\)([^;]*)`,
        "gi",
    );
    const drop = new RegExp(
        String.raw`ALTER\s+TABLE\s+(?:ONLY\s+)?${OBJ}\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?`,
        "gi",
    );

    const live = new Map<string, Fk>();
    let addsSeen = 0;
    let dropsSeen = 0;

    for (const m of migrations()) {
        for (const hit of m.sql.matchAll(add)) {
            const [, table, name, references, tail] = hit;
            if (table !== "role_permission_grants") continue;
            addsSeen += 1;
            const onDelete = /ON\s+DELETE\s+(CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/i.exec(tail ?? "");
            live.set(name, {
                name,
                references,
                onDelete: (onDelete?.[1] ?? "NO ACTION").toUpperCase().replace(/\s+/g, " "),
                from: m.name,
            });
        }
        for (const hit of m.sql.matchAll(drop)) {
            const [, table, name] = hit;
            if (table !== "role_permission_grants") continue;
            dropsSeen += 1;
            live.delete(name);
        }
    }

    return { live: [...live.values()], addsSeen, dropsSeen };
}

// ---------------------------------------------------------------------------
// What kind of object each catalog name is at the end of the tree.
// ---------------------------------------------------------------------------

function replayCatalogObjectKinds(): Map<string, "table" | "view" | "absent"> {
    const createTable = new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${OBJ}`, "gi");
    const dropTable = new RegExp(String.raw`DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?${OBJ}`, "gi");
    const createView = new RegExp(
        String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+${OBJ}`,
        "gi",
    );
    const dropView = new RegExp(String.raw`DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?${OBJ}`, "gi");

    const kinds = new Map<string, "table" | "view" | "absent">();
    const watched = new Set<string>([CANONICAL, ...DEPRECATED]);

    for (const m of migrations()) {
        for (const [, name] of m.sql.matchAll(createTable)) if (watched.has(name)) kinds.set(name, "table");
        for (const [, name] of m.sql.matchAll(dropTable)) if (watched.has(name)) kinds.set(name, "absent");
        for (const [, name] of m.sql.matchAll(createView)) if (watched.has(name)) kinds.set(name, "view");
        for (const [, name] of m.sql.matchAll(dropView)) if (watched.has(name)) kinds.set(name, "absent");
    }
    return kinds;
}

// ---------------------------------------------------------------------------
// The product tree.
// ---------------------------------------------------------------------------

const PRODUCT_TREES = ["app", "lib"];

function sourceFilesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const child = join(abs, entry.name);
            if (entry.isDirectory()) walk(child);
            else if (/\.tsx?$/.test(entry.name)) out.push(child);
        }
    };
    walk(join(webRoot, dir));
    return out;
}

function productSources(): { path: string; text: string }[] {
    return PRODUCT_TREES.flatMap(sourceFilesUnder).map((abs) => ({
        path: relative(webRoot, abs),
        text: readFileSync(abs, "utf8"),
    }));
}

/** `.from("permissions")` / `.from("permission_keys")` — a catalog access through a demoted name. */
const DEPRECATED_ACCESS = new RegExp(
    String.raw`\.\s*from\(\s*["'\`](${DEPRECATED.join("|")})["'\`]\s*\)`,
);

/** Any write to the grants table — the thing whose payload the FK constrains. */
const GRANTS_WRITE =
    /from\(\s*["'`]role_permission_grants["'`]\s*\)\s*(?:\.\s*\w+\([^)]*\)\s*)*?\.\s*(insert|upsert|update)\b/;

// ---------------------------------------------------------------------------

describe("RL-7 — one catalog, one FK (W-9, tier A)", () => {
    it("the migration tree is actually being read (non-vacuity)", () => {
        const all = migrations();
        expect(all.length).toBeGreaterThan(300);
        expect(all.some((m) => m.name === CONSOLIDATION)).toBe(true);
        expect(all.some((m) => m.name === ANON_REVOCATION)).toBe(true);
    });

    it("exactly one FK survives on role_permission_grants.permission_key", () => {
        const { live, addsSeen, dropsSeen } = replayPermissionKeyFks();

        // Non-vacuity: the replay must have seen the history, not an empty scan.
        expect(addsSeen).toBeGreaterThanOrEqual(3);
        expect(dropsSeen).toBeGreaterThanOrEqual(2);

        expect(live.map((f) => f.name).sort()).toEqual(["role_permission_grants_permission_definitions_fkey"]);
    });

    it("the surviving FK names the canonical table and keeps RESTRICT", () => {
        const { live } = replayPermissionKeyFks();
        const [fk] = live;

        expect(fk.references).toBe(CANONICAL);
        // The legacy pair disagreed — one RESTRICT, one CASCADE — so deleting a
        // catalog key could silently delete grants. RESTRICT is the survivor.
        expect(fk.onDelete).toBe("RESTRICT");
    });

    it("exactly one catalog TABLE exists; the deprecated names are views", () => {
        const kinds = replayCatalogObjectKinds();

        expect(kinds.get(CANONICAL)).toBe("table");
        for (const name of DEPRECATED) {
            expect(kinds.get(name), `${name} must not be a table`).toBe("view");
        }
    });

    it("no migration writes the catalog through a deprecated name after consolidation", () => {
        const write = new RegExp(
            String.raw`(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+${OBJ}`,
            "gi",
        );
        const offenders: string[] = [];

        for (const m of migrations()) {
            if (m.name <= CONSOLIDATION) continue;
            for (const [, name] of m.sql.matchAll(write)) {
                if ((DEPRECATED as readonly string[]).includes(name)) offenders.push(`${m.name} → ${name}`);
            }
        }

        expect(offenders).toEqual([]);
    });

    it("no migration re-grants a catalog privilege to anon after the revocation", () => {
        // The catalog-scoped instance of W-60's S-13. W-60 owns the general form
        // ("no migration grants any privilege on an access-control object to anon");
        // this is only the three catalog objects, which are W-9's subject.
        const grant = new RegExp(String.raw`GRANT\s+[\w\s,]+?\s+ON\s+(?:TABLE\s+)?${OBJ}\s+TO\s+([^;]*)`, "gi");
        const watched = new Set<string>([CANONICAL, ...DEPRECATED]);
        const offenders: string[] = [];

        for (const m of migrations()) {
            if (m.name <= ANON_REVOCATION) continue;
            for (const hit of m.sql.matchAll(grant)) {
                const [, name, grantees] = hit;
                if (watched.has(name) && /\banon\b/i.test(grantees ?? "")) {
                    offenders.push(`${m.name} → ${name}`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });

    it("no product code reaches the catalog through a deprecated name", () => {
        const sources = productSources();

        // Non-vacuity: the walk must have visited the real product tree.
        expect(sources.length).toBeGreaterThan(500);

        const offenders = sources.filter((s) => DEPRECATED_ACCESS.test(s.text)).map((s) => s.path);
        expect(offenders).toEqual([]);
    });

    it("every writer of role_permission_grants validates against the table the FK names", () => {
        // The subject spans BOTH trees now. W-28 moved the grant replacement out of the route and
        // into `replace_role_permission_grants`, so scanning product sources alone would find zero
        // writers and the non-vacuity guard below would be the only thing that noticed. A writer
        // that moves to SQL has not stopped being a writer.
        const productWriters = productSources().filter((s) => GRANTS_WRITE.test(s.text));
        const sqlWriters = migrations()
            .filter((m) => /INSERT\s+INTO\s+(?:public\.)?role_permission_grants\b/i.test(m.sql))
            .map((m) => ({ path: m.name, text: m.sql }));
        const writers = [...productWriters, ...sqlWriters];

        // Non-vacuity: if this finds nothing, the regex has drifted, not the code.
        expect(writers.length).toBeGreaterThanOrEqual(1);

        for (const w of writers) {
            expect(w.text, `${w.path} writes grants without validating against ${CANONICAL}`).toContain(
                CANONICAL,
            );
        }
    });
});
