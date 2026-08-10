/**
 * Discovery of every grant seed in the migration tree, and of what bounds the set of permission
 * keys each one writes.
 *
 * W-12 / RL-8 (`docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §7).
 *
 * **The invariant, stated precisely.** §13 names RL-8 as *"no `SELECT` over the catalog in a grant
 * seed"*. Taken literally that condemns three seeds that are not the problem — `20260505164000`
 * joins `permission_definitions` on a seventeen-key `IN` list, Phase 0's workflows backfill joins it
 * on a two-key list, and the wave-C authority seed drives its `INSERT` from a `FOR … IN VALUES`
 * loop. All three read the catalog; none of them lets the catalog decide what is granted.
 *
 * The property the exit criterion actually names — *"adding a catalog key grants nothing
 * implicitly"* — is about where the **key set** comes from:
 *
 *   > Every statement that writes `role_permission_grants` must take its permission keys from
 *   > literals in its own text (or from an enclosing loop's literal `VALUES` list), never from the
 *   > contents of a catalog relation.
 *
 * That is strictly stronger than the §13 phrasing in the direction that matters (a blanket over a
 * non-catalog relation would pass the literal reading and fails this one) and strictly weaker in
 * the direction that does not (a bounded join passes). §7's execution record carries the
 * restatement.
 *
 * **Why discovery, and not a file list.** RL-1 was defeated twice by an enumerated file list, RL-4
 * once, and RL-3 once by an enumerated *syntax*. The subject here is every region of every
 * migration that can write a grant row, found by scanning, with non-vacuity guards on the scan
 * itself.
 */

import fs from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");

/** A permission key: lowercase dotted segments. Excludes role keys (`admin`, `ops` — no dot). */
export const PERMISSION_KEY_GRAMMAR = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

const GRANT_WRITE = /INSERT\s+INTO\s+(?:public\.)?role_permission_grants\b/i;
const CATALOG_RELATION = /\b(?:FROM|JOIN)\s+(?:public\.)?(?:permission_definitions|permission_keys|permissions)\b/i;
const SQL_STRING = /'((?:[^']|'')*)'/g;
const DOLLAR_QUOTED = /(?:DO|AS)\s+(\$[a-zA-Z_]*\$)([\s\S]*?)\1/g;

export function stripSqlComments(sql: string): string {
    return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

export function migrationFiles(): string[] {
    return fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
}

export function readMigration(file: string): string {
    return fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

/** Every region of a migration that can write a grant row: a dollar-quoted body, or a bare statement. */
function grantSeedRegions(sql: string): string[] {
    const regions: string[] = [];
    for (const block of sql.matchAll(DOLLAR_QUOTED)) {
        if (GRANT_WRITE.test(block[2]!)) regions.push(block[2]!);
    }
    for (const statement of sql.replace(DOLLAR_QUOTED, " ").split(";")) {
        if (GRANT_WRITE.test(statement)) regions.push(statement);
    }
    return regions;
}

/**
 * Literals that cannot bound a key set, removed before we look for the ones that can:
 * a `NOT IN (…)` / `<> ALL (…)` exclusion names keys it is *withholding*, and a `NOT EXISTS (…)`
 * antijoin names the key it is testing for prior existence. The baseline's `ops` blanket is
 * exactly this trap — it selects the whole catalog and then names two keys it excludes, so a naive
 * "does it mention a key?" test reads a blanket as bounded.
 */
function stripNonBoundingLiterals(statement: string): string {
    let out = statement;
    out = out.replace(/\bNOT\s+EXISTS\s*\((?:[^()]|\([^()]*\))*\)/gi, " ");
    out = out.replace(/\bNOT\s+IN\s*\((?:[^()]|\([^()]*\))*\)/gi, " ");
    out = out.replace(/<>\s*ALL\s*\((?:[^()]|\([^()]*\))*\)/gi, " ");
    return out;
}

function keyLiterals(text: string): string[] {
    const keys = new Set<string>();
    for (const match of text.matchAll(SQL_STRING)) {
        const key = match[1]!.replace(/''/g, "'");
        if (PERMISSION_KEY_GRAMMAR.test(key)) keys.add(key);
    }
    return [...keys];
}

/** `FOR a, b, c IN VALUES ('k', …), … LOOP` — the wave-C seeding form. */
function loopBoundKeys(region: string): { variables: string[]; keys: string[] } {
    const variables: string[] = [];
    const keys: string[] = [];
    for (const loop of region.matchAll(/\bFOR\s+([a-z_][a-z0-9_,\s]*?)\s+IN\s+(VALUES[\s\S]*?)\s+LOOP\b/gi)) {
        variables.push(...loop[1]!.split(",").map((v) => v.trim()).filter(Boolean));
        keys.push(...keyLiterals(loop[2]!));
    }
    return { variables, keys };
}

export type GrantStatement = {
    file: string;
    /** The statement text, comments stripped. */
    text: string;
    /** Keys the statement is bounded by; empty means the key set is not literal. */
    boundingKeys: string[];
    /** True when the statement reads a catalog relation for any purpose. */
    readsCatalog: boolean;
    /** How the key set is determined. */
    binding: "literal" | "loop-values" | "blanket";
};

/**
 * Every grant-writing statement in the migration tree, classified.
 *
 * `blanket` is the failure: the statement writes grant rows whose permission keys come from
 * somewhere other than its own text, which today means the catalog's contents.
 */
export function discoverGrantStatements(): GrantStatement[] {
    const out: GrantStatement[] = [];
    for (const file of migrationFiles()) {
        const sql = stripSqlComments(readMigration(file));
        for (const region of grantSeedRegions(sql)) {
            const loop = loopBoundKeys(region);
            for (const statement of region.split(";")) {
                if (!GRANT_WRITE.test(statement)) continue;
                const bounding = stripNonBoundingLiterals(statement);
                const literals = keyLiterals(bounding);
                const readsCatalog = CATALOG_RELATION.test(bounding);

                let binding: GrantStatement["binding"];
                let boundingKeys: string[];
                if (literals.length > 0) {
                    binding = "literal";
                    boundingKeys = literals;
                } else if (loop.keys.length > 0 && loop.variables.some((v) => selectsBareVariable(statement, v))) {
                    binding = "loop-values";
                    boundingKeys = loop.keys;
                } else {
                    binding = "blanket";
                    boundingKeys = [];
                }

                out.push({ file, text: statement.trim(), boundingKeys, readsCatalog, binding });
            }
        }
    }
    return out;
}

/**
 * Does the `INSERT … SELECT` project this bare identifier as one of its columns? Guards the
 * loop-values case: a blanket that merely happens to sit in a region containing an unrelated loop
 * must not be excused by it.
 */
function selectsBareVariable(statement: string, variable: string): boolean {
    const select = statement.slice(statement.search(/\bSELECT\b/i));
    return new RegExp(`(?:,|\\bSELECT)\\s*${variable}\\s*(?:,|\\bFROM\\b)`, "i").test(select);
}

/* ------------------------------------------------------------------------ */
/* The live definition of seed_default_rbac                                  */
/* ------------------------------------------------------------------------ */

export type FunctionDefinition = { file: string; body: string };

/**
 * The definition of a function that survives a replay of the whole tree in filename order — the
 * *end state*, not whichever migration happens to be read first. RL-7 established this discipline
 * for the catalog: assert what the database ends up with, rather than reading one migration and
 * agreeing with it. Historical migrations legitimately contain superseded definitions and cannot
 * be edited, so anything else would be asserting against history.
 */
export function liveFunctionDefinition(functionName: string): FunctionDefinition | null {
    let live: FunctionDefinition | null = null;
    const signature = new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?"?${functionName}"?\\s*\\(`,
        "i"
    );
    for (const file of migrationFiles()) {
        const sql = readMigration(file);
        let cursor = 0;
        for (;;) {
            const rest = sql.slice(cursor);
            const at = rest.search(signature);
            if (at < 0) break;
            const from = cursor + at;
            const body = firstDollarQuotedBody(sql.slice(from));
            if (body !== null) live = { file, body };
            cursor = from + 1;
        }
    }
    return live;
}

function firstDollarQuotedBody(text: string): string | null {
    const open = /\$([a-zA-Z_]*)\$/.exec(text);
    if (!open) return null;
    const tag = open[0];
    const close = text.indexOf(tag, open.index + tag.length);
    if (close < 0) return null;
    return text.slice(open.index + tag.length, close);
}

/**
 * The text between two sentinel markers in a function body.
 *
 * The sentinels are themselves SQL comments — the migration guard reads them out of
 * `pg_get_functiondef`, which returns the body verbatim — so the slice must be taken on the raw
 * text and the comments stripped afterwards. Doing it the other way round loses the sentinels;
 * not doing it at all lets a single apostrophe in a comment desynchronise every string-literal
 * pairing after it, which is precisely how this instrument first read an enumeration of 57 keys
 * as an enumeration of none.
 */
export function sentinelRegion(body: string, begin: string, end: string): string | null {
    const from = body.indexOf(begin);
    const to = body.indexOf(end);
    if (from < 0 || to < 0 || to <= from) return null;
    return stripSqlComments(body.slice(from, to));
}

export { keyLiterals };
