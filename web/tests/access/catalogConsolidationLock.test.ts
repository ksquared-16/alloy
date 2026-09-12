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
import {
    discoverCatalog,
    isMutationCommandKey,
    isSchemaQualifiedRelation,
    PERMISSION_KEY_GRAMMAR,
    productSourceFiles,
    REPO_ROOT,
} from "./permissionCatalogDiscovery";

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

/**
 * Spans of `IF to_regclass('public.X') IS NOT NULL THEN … END IF` for one catalog name.
 *
 * Deliberately non-greedy to the FIRST `END IF`: if a future author nests a conditional inside the
 * guard, the span ends early and any write past it is reported. The matcher fails toward strictness.
 */
function guardedSpans(sql: string, name: string): Array<[number, number]> {
    const guard = new RegExp(
        String.raw`IF\s+to_regclass\(\s*'(?:public\.)?${name}'\s*\)\s+IS\s+NOT\s+NULL\s+THEN[\s\S]*?END\s+IF`,
        "gi",
    );
    const spans: Array<[number, number]> = [];
    for (const hit of sql.matchAll(guard)) {
        if (hit.index === undefined) continue;
        spans.push([hit.index, hit.index + hit[0].length]);
    }
    return spans;
}

/** A single-quoted SQL string literal, with `''` escapes. */
const SQL_STRING = /'((?:[^']|'')*)'/g;

/** Regions of a migration that write the grants table, whatever syntax carries them. */
function grantWriteRegions(sql: string): string[] {
    const grantsInsert = /INSERT\s+INTO\s+(?:public\.)?role_permission_grants\b/i;
    const regions: string[] = [];
    const dollarQuoted = /(?:DO|AS)\s+(\$[a-zA-Z_]*\$)([\s\S]*?)\1/g;
    for (const block of sql.matchAll(dollarQuoted)) {
        if (grantsInsert.test(block[2]!)) regions.push(block[2]!);
    }
    for (const statement of sql.replace(dollarQuoted, " ").split(";")) {
        if (grantsInsert.test(statement)) regions.push(statement);
    }
    return regions;
}

/** Permission-key literals a region names, with relation names and audit commands excluded. */
function keyLiteralsIn(region: string): string[] {
    return [...region.matchAll(SQL_STRING)]
        .map((hit) => hit[1]!.replace(/''/g, "'"))
        .filter(
            (key) =>
                PERMISSION_KEY_GRAMMAR.test(key) &&
                !isSchemaQualifiedRelation(key) &&
                !isMutationCommandKey(key),
        );
}

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

/**
 * THE PRODUCT SUBJECT IS THE WHOLE PRODUCT TREE, NOT THE TWO DIRECTORIES THIS LOCK WAS BORN WITH.
 *
 * This lock originally walked `app` and `lib` only. `components` and `scripts` were outside it, so a
 * catalog read through a deprecated name in a settings component — exactly where the Access surfaces
 * live — was invisible to the assertion that exists to forbid it. That is the same defeat RL-1 took
 * twice and RL-4 once, and W-5's sixth issuance took again in its own words: *the writer set outgrew
 * the lock's subject*. It had not yet cost anything here (the widened scan finds zero offenders, so
 * this commit does not change the verdict) — which is the only moment a subject can be widened
 * cheaply.
 *
 * The four roots come from {@link productSourceFiles}, W-11's shared discovery, so RL-3, RL-7 and the
 * enforcement census now answer to ONE definition of "the product tree" and widening it again is a
 * one-line change in one file rather than a change this lock can silently miss.
 */
function productSources(): { path: string; text: string }[] {
    return productSourceFiles().map((abs) => ({
        path: relative(REPO_ROOT, abs),
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

    it("exactly one catalog object exists, and the deprecated names are gone", () => {
        // W-9 collapsed three catalog tables into one and kept the deprecated names as
        // `security_invoker` VIEWS so readers would not break. W-60/M20 retired those views once the
        // audit it opens with was done and `S-13` had locked the anon-grant pattern shut — `01…§39`
        // calls them migration residue, not a model concept.
        //
        // The assertion therefore moved from "the deprecated names are views" to "they do not
        // exist". That is a tightening, not a relaxation: a future migration recreating either name
        // as a table OR as a view now fails here, where before a view was acceptable.
        const kinds = replayCatalogObjectKinds();

        expect(kinds.get(CANONICAL)).toBe("table");
        for (const name of DEPRECATED) {
            // "absent" rather than undefined, deliberately: the replay distinguishes an object that
            // was explicitly DROPPED from one it never saw. Asserting undefined would also pass if
            // the scan stopped matching these names at all.
            expect(kinds.get(name), `${name} must not exist — W-60/M20 retired it`).toBe("absent");
        }
    });

    it("no migration writes the catalog through a deprecated name after consolidation", () => {
        // A write GUARDED by `to_regclass('public.X') IS NOT NULL` on the same name is not a second
        // catalog — it is unreachable code, and the assertion above is what keeps it unreachable: it
        // pins both deprecated names to `absent`, so the guard can never be true. The pair is as
        // strong as the flat scan was. An UNGUARDED write still fails here, and a migration that
        // brings either name back still fails there; a guarded write becomes live only by first
        // breaking an assertion this lock already makes.
        //
        // The concession is bounded to shipped history and is not a filename allowlist, which is the
        // form that has defeated this workstream's locks three times.
        // `20260909230000_attendance_capability.sql` seeds all three catalog names behind that guard
        // and shipped on 2026-09-09, three weeks AFTER `W-60`/`M20` dropped the two views, carrying a
        // comment that still states the three-table premise as current fact. It is inert, it is
        // immutable history, and it is recorded in §7's W-9 re-issuance rather than edited.
        const write = new RegExp(
            String.raw`(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+${OBJ}`,
            "gi",
        );
        const offenders: string[] = [];
        let guardedSeen = 0;

        for (const m of migrations()) {
            if (m.name <= CONSOLIDATION) continue;
            for (const hit of m.sql.matchAll(write)) {
                const name = hit[1]!;
                if (!(DEPRECATED as readonly string[]).includes(name)) continue;
                const at = hit.index ?? 0;
                if (guardedSpans(m.sql, name).some(([from, to]) => at >= from && at < to)) {
                    guardedSeen += 1;
                    continue;
                }
                offenders.push(`${m.name} → ${name}`);
            }
        }

        expect(offenders).toEqual([]);
        // Non-vacuity for the carve-out itself: if the guard matcher silently stopped matching, the
        // scan would go quiet instead of strict, and this lock would be excusing writes it never saw.
        expect(guardedSeen).toBeGreaterThanOrEqual(2);
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

    it("every product writer of role_permission_grants validates against the table the FK names", () => {
        // W-28 moved the grant replacement out of the route and into
        // `replace_role_permission_grants`, so a product writer is now the exception. When one
        // exists it writes keys from a REQUEST, which it cannot vouch for — so naming the canonical
        // table is the whole check. SQL writers are a different question, asked below.
        //
        // THIS SET IS EMPTY TODAY, AND THAT IS THE CORRECT STATE, SO THIS ASSERTION IS VACUOUS ON
        // PURPOSE — stated rather than disguised. It is a tripwire for a writer coming BACK into the
        // product tree, not a measurement. Asserting a non-zero count here would fail the tree for
        // having centralised its writes, which is the outcome W-28 was for.
        //
        // The previous single test asserted `writers.length >= 1` over product AND SQL writers
        // together, and the 27 SQL writers satisfied it on their own — so the product half had no
        // subject and the guard that was meant to notice reported healthy. Splitting the two is what
        // makes the emptiness visible.
        const writers = productSources().filter((s) => GRANTS_WRITE.test(s.text));
        for (const w of writers) {
            expect(w.text, `${w.path} writes grants without validating against ${CANONICAL}`).toContain(
                CANONICAL,
            );
        }
    });

    it("every SQL writer of role_permission_grants writes keys the catalog actually holds", () => {
        /*
         * THE OLD ASSERTION HERE WAS `migration.text.includes("permission_definitions")`, AND IT WAS
         * BOTH TOO WEAK AND TOO STRONG.
         *
         * Too weak: it read the raw file, comments included, so any migration that merely MENTIONED
         * the canonical table in prose passed while granting whatever it liked. 26 of the tree's 27
         * SQL grant writers passed it, and it was never established how many passed on a comment.
         *
         * Too strong: `20260909240000_financials_read_for_director_roles.sql` grants the literal
         * `fin.read`, which W-12 seeded into the catalog on 2026-08-07. The grant is sound and the FK
         * accepts it; the migration simply never says the canonical table's name. A lock that fails a
         * correct migration teaches the next author to add the magic word in a comment.
         *
         * What the FK actually requires is that every key written is catalog-resident, so that is
         * what is asserted — against W-11's region-based `discoverCatalog()`, which finds a seed in
         * any syntax rather than one pinned `INSERT` shape. A writer that resolves its keys by
         * SELECTing the canonical table validates dynamically and needs no literal.
         *
         * This is strictly stronger: a migration granting a key nowhere in the catalog now fails,
         * where before a comment excused it. It is what the RESTRICT survivor would refuse at apply
         * time — enforced here, in the tree, instead of on a deploy.
         */
        const catalog = discoverCatalog();
        // Non-vacuity: an under-discovering catalog would excuse every key rather than check it.
        expect(catalog.size).toBeGreaterThan(40);

        const offenders: string[] = [];
        let checked = 0;

        for (const m of migrations()) {
            for (const region of grantWriteRegions(m.sql)) {
                // Resolves its keys from the canonical table — validated by construction.
                if (new RegExp(String.raw`(?:public\.)?${CANONICAL}\b`, "i").test(region)) continue;
                for (const key of keyLiteralsIn(region)) {
                    checked += 1;
                    if (!catalog.has(key)) offenders.push(`${m.name} → ${key}`);
                }
            }
        }

        // Non-vacuity: if the region finder or the key grammar drifts, this goes quiet, not green.
        expect(checked).toBeGreaterThanOrEqual(1);
        expect(offenders).toEqual([]);
    });
});
