/**
 * Discovery of the permission catalog and of the code that enforces it.
 *
 * W-11 (`docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §7).
 *
 * **Why this module exists.** Every static instrument this workstream has built — RL-3's totality and
 * soundness clauses, W-10's row counts, the "35 catalog keys" figure in its execution record — derived
 * the catalog with a parser pinned to one `INSERT` shape:
 *
 * ```
 * INSERT INTO public.permission_definitions (key, group_key, label, …) VALUES ('k', 'g', 'l', …)
 * ```
 *
 * Two seeding forms in the live migration tree do not have that shape, and the pinned parser did not
 * skip them loudly — it returned a smaller catalog and every assertion above it passed:
 *
 *   1. `seed_default_rbac()` as rewritten by the Phase 0 migration inserts `(key, label, group_key,
 *      description)` — **`label` and `group_key` transposed** — so no tuple matched and all 57 of its
 *      keys were invisible. That literal is the *largest* vocabulary in the tree.
 *   2. `20260722000000_…authority_model_p1_wave_c.sql` seeds through a `FOR k, lbl, dsc IN VALUES …`
 *      loop, so the `INSERT` carries **variables, not literals**, and its two keys were invisible too.
 *
 * The pinned parser found 35 keys. The catalog is 57 — the number the Phase 0 migration independently
 * measured against the shared database on 2026-07-29 and recorded in its own comment.
 *
 * This is the same lesson RL-1 (twice), RL-4 and RL-7 already paid for, in its third form: **a lock is
 * only as strong as the subject it discovers.** RL-1 and RL-4 were defeated by an enumerated *file*
 * list; this was defeated by an enumerated *syntax*. Discovery here is by region, not by tuple shape:
 * find every part of a migration that can write a catalog row, then take every key-shaped literal in
 * it. A new seed written in a fourth style is picked up without editing this file.
 */

import fs from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");

/**
 * The three names that reach the one catalog table. `permissions` and `permission_keys` are
 * `security_invoker` views over `permission_definitions` since Phase 0 — and they are *auto-updatable*
 * (W-9's execution record), so an `INSERT` through either still lands a catalog row. A discovery that
 * only looked at the canonical name would miss the wave-C seed, which writes all three.
 */
const CATALOG_WRITE =
    /INSERT\s+INTO\s+(?:public\.)?(?:permission_definitions|permission_keys|permissions)\b/i;

/** A permission key: lowercase dotted segments. Excludes labels (spaces) and bare group keys (no dot). */
export const PERMISSION_KEY_GRAMMAR = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

const SQL_STRING = /'((?:[^']|'')*)'/g;

function stripSqlComments(sql: string): string {
    return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Every region of a migration that can seed a catalog row, whatever syntax it uses:
 * a bare `INSERT` statement, a `DO $tag$ … $tag$` block containing one, or a function body
 * (`AS $$ … $$`) containing one. Dollar-quoted bodies are taken whole because the keys may live in a
 * `FOR … IN VALUES` list rather than in the `INSERT` itself.
 */
function catalogSeedRegions(sql: string): string[] {
    const regions: string[] = [];
    const dollarQuoted = /(?:DO|AS)\s+(\$[a-zA-Z_]*\$)([\s\S]*?)\1/g;
    for (const block of sql.matchAll(dollarQuoted)) {
        if (CATALOG_WRITE.test(block[2]!)) regions.push(block[2]!);
    }
    for (const statement of sql.replace(dollarQuoted, " ").split(";")) {
        if (CATALOG_WRITE.test(statement)) regions.push(statement);
    }
    return regions;
}

export type CatalogKey = {
    key: string;
    /** Migration filenames that seed this key. */
    seededBy: string[];
};

/** The permission catalog as this repository's migration tree defines it. */
export function discoverCatalog(): Map<string, CatalogKey> {
    const byKey = new Map<string, CatalogKey>();
    for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
        if (!file.endsWith(".sql")) continue;
        const sql = stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
        for (const region of catalogSeedRegions(sql)) {
            for (const literal of region.matchAll(SQL_STRING)) {
                const key = literal[1]!.replace(/''/g, "'");
                if (!PERMISSION_KEY_GRAMMAR.test(key)) continue;
                const prior = byKey.get(key);
                byKey.set(key, { key, seededBy: [...new Set([...(prior?.seededBy ?? []), file])] });
            }
        }
    }
    return byKey;
}

/**
 * Catalog entries in the shape `buildPermissionGridRows` consumes. Labels and groups come from the
 * canonical-table seeds where a literal tuple supplies them; a key seeded only through a variable or a
 * transposed tuple still appears, without a label. The grid's own fallbacks handle that — and a key
 * missing from the projection is the failure RL-3 exists to catch, so it must be present here.
 */
export function discoverCatalogEntries(): Array<{ key: string; group_key?: string; label?: string }> {
    const labels = discoverLabelledEntries();
    return [...discoverCatalog().keys()].map((key) => labels.get(key) ?? { key });
}

/** Literal `(key, group_key, label, …)` and `(key, label, group_key, …)` tuples, for presentation only. */
function discoverLabelledEntries(): Map<string, { key: string; group_key?: string; label?: string }> {
    const out = new Map<string, { key: string; group_key?: string; label?: string }>();
    const TUPLE = /\(\s*'([a-z][a-z0-9_.]*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/g;
    for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
        if (!file.endsWith(".sql")) continue;
        const sql = stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
        for (const region of catalogSeedRegions(sql)) {
            for (const tuple of region.matchAll(TUPLE)) {
                const key = tuple[1]!;
                if (!PERMISSION_KEY_GRAMMAR.test(key)) continue;
                const second = tuple[2]!.replace(/''/g, "'");
                const third = tuple[3]!.replace(/''/g, "'");
                // Column order is not fixed across the tree: the canonical seeds write
                // `(key, group_key, label)` and `seed_default_rbac` writes `(key, label, group_key)`.
                // Whichever of the two is a bare identifier is the group; the other is the label.
                // If neither is (the wave-C loop's third element is a prose description), the group is
                // left unset rather than guessed — a sentence in a group slot renders as a group label.
                const BARE = /^[a-z][a-z0-9_]*$/;
                const group_key = BARE.test(second) ? second : BARE.test(third) ? third : undefined;
                const label = BARE.test(second) ? third : second;
                out.set(key, { key, ...(group_key ? { group_key } : {}), label });
            }
        }
    }
    return out;
}

/* ------------------------------------------------------------------------ */
/* Enforcement discovery                                                     */
/* ------------------------------------------------------------------------ */

const PRODUCT_ROOTS = ["web/app", "web/lib", "web/components", "web/scripts"];

/** A key-shaped literal in TypeScript source. */
const TS_KEY_LITERAL = /["'`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g;

function stripTsComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walk(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".next") continue;
            walk(full, out);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

export function productSourceFiles(): string[] {
    return PRODUCT_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root)));
}

export type EnforcementScan = {
    /** Files scanned — the non-vacuity subject. */
    fileCount: number;
    /** Catalog key → repo-relative files naming it on an executable line. */
    sitesByKey: Map<string, string[]>;
    /** Key-shaped literals in permission-related sources that the catalog does not hold. */
    uncatalogued: Map<string, string[]>;
};

/**
 * Which catalog keys any product source names, and which key-shaped literals appear in
 * permission-related sources without a catalog row.
 *
 * **This is a proxy for enforcement, and the plan says so.** W-11's tier A check — the set difference
 * between the catalog and the keys named in *declared route capabilities* — is not expressible until
 * W-14 supplies the declared set. Naming a key in a comment-stripped source is weaker: it counts a key
 * that a helper mentions but no route reaches. It is deliberately weak in the safe direction — it
 * over-counts enforcement, so the deletion list it produces is a floor, never a ceiling.
 */
export function scanEnforcement(catalog: Iterable<string>): EnforcementScan {
    const catalogKeys = new Set(catalog);
    const sitesByKey = new Map<string, string[]>();
    const uncatalogued = new Map<string, string[]>();
    const files = productSourceFiles();

    for (const file of files) {
        const rel = path.relative(REPO_ROOT, file);
        const source = stripTsComments(fs.readFileSync(file, "utf8"));
        const permissionRelated = /permission/i.test(source);
        for (const match of source.matchAll(TS_KEY_LITERAL)) {
            const literal = match[1]!;
            if (catalogKeys.has(literal)) {
                sitesByKey.set(literal, [...new Set([...(sitesByKey.get(literal) ?? []), rel])]);
            } else if (permissionRelated) {
                uncatalogued.set(literal, [...new Set([...(uncatalogued.get(literal) ?? []), rel])]);
            }
        }
    }

    return { fileCount: files.length, sitesByKey, uncatalogued };
}
