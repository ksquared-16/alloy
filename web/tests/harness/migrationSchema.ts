/**
 * MIGRATION SCHEMA — the public tables, their columns and their foreign keys, replayed from
 * `supabase/migrations` in filename order. Test-only: it lets an in-memory adapter answer a read
 * the way PostgREST does when a table or column does not exist (42P01 / 42703), from the same DDL
 * the certification environment is built from — not from a list kept beside the code under test.
 *
 * It understands the DDL this repository writes: CREATE TABLE (columns, inline REFERENCES, table
 * FOREIGN KEY constraints), ALTER TABLE ADD/DROP/RENAME COLUMN, ADD/DROP CONSTRAINT, RENAME TO, and
 * DROP TABLE. Comments, quoted strings and dollar-quoted bodies are removed first, so DDL inside a
 * function body is never mistaken for the schema.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ForeignKey = { name: string; table: string; columns: string[]; refTable: string; refColumns: string[]; onDelete: string };
export type MigrationSchema = {
    files: number;
    head: string;
    tables: Map<string, Set<string>>;
    foreignKeys: ForeignKey[];
};

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1");
/** `"public"."x"`, `public.x` or `x` → `x`; any other schema → null (only public is modelled). */
function tableName(raw: string): string | null {
    const parts = raw.trim().split(".").map(unquote);
    if (parts.length === 2) return parts[0] === "public" ? parts[1] : null;
    return parts.length === 1 ? parts[0] : null;
}
const identList = (s: string) => s.split(",").map(unquote).filter(Boolean);

/** Strip comments, string literals and dollar-quoted bodies; split on top-level semicolons. */
export function statements(sql: string): string[] {
    const out: string[] = [];
    let cur = "";
    let i = 0;
    while (i < sql.length) {
        const c = sql[i];
        if (c === "-" && sql[i + 1] === "-") { while (i < sql.length && sql[i] !== "\n") i++; continue; }
        if (c === "/" && sql[i + 1] === "*") { const j = sql.indexOf("*/", i + 2); i = j < 0 ? sql.length : j + 2; continue; }
        if (c === "'") { i++; while (i < sql.length) { if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; } if (sql[i] === "'") break; i++; } i++; cur += "''"; continue; }
        if (c === "$") {
            const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
            if (m) { const j = sql.indexOf(m[0], i + m[0].length); i = j < 0 ? sql.length : j + m[0].length; cur += "$$"; continue; }
        }
        if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
        cur += c;
        i++;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** Split on commas outside parentheses and double quotes. */
function topLevel(s: string): string[] {
    const parts: string[] = [];
    let depth = 0, q = false, cur = "";
    for (const c of s) {
        if (c === '"') q = !q;
        if (!q && c === "(") depth++;
        if (!q && c === ")") depth--;
        if (!q && depth === 0 && c === ",") { parts.push(cur.trim()); cur = ""; continue; }
        cur += c;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z_0-9$]*)`;
const QNAME = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;
const onDeleteOf = (s: string) => (/ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i.exec(s)?.[1] ?? "NO ACTION").toUpperCase().replace(/\s+/g, " ");
const CONSTRAINT_HEAD = /^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE|LIKE)\b/i;

export function loadMigrationSchema(dir: string): MigrationSchema {
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const tables = new Map<string, Set<string>>();
    let fks: ForeignKey[] = [];
    const addFk = (fk: ForeignKey) => { fks = fks.filter((f) => !(f.table === fk.table && f.name === fk.name)); fks.push(fk); };
    const tableFk = (table: string, name: string, body: string) => {
        const m = new RegExp(String.raw`FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+(${QNAME})\s*(?:\(([^)]*)\))?`, "i").exec(body);
        if (!m) return;
        const ref = tableName(m[2]);
        if (ref) addFk({ name, table, columns: identList(m[1]), refTable: ref, refColumns: m[3] ? identList(m[3]) : ["id"], onDelete: onDeleteOf(body) });
    };

    for (const f of files) {
        for (const st of statements(readFileSync(join(dir, f), "utf8"))) {
            let m = new RegExp(String.raw`^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QNAME})\s*\(([\s\S]*)\)[^)]*$`, "i").exec(st);
            if (m) {
                const t = tableName(m[1]);
                if (!t) continue;
                if (tables.has(t) && /IF\s+NOT\s+EXISTS/i.test(st)) continue;
                const cols = new Set<string>();
                fks = fks.filter((x) => x.table !== t);
                for (const el of topLevel(m[2])) {
                    if (CONSTRAINT_HEAD.test(el)) {
                        const named = new RegExp(String.raw`^CONSTRAINT\s+(${IDENT})\s+([\s\S]*)$`, "i").exec(el);
                        tableFk(t, named ? unquote(named[1]) : `${t}_anon_fkey_${fks.length}`, named ? named[2] : el);
                        continue;
                    }
                    const col = new RegExp(String.raw`^(${IDENT})\s`).exec(el);
                    if (!col) continue;
                    const name = unquote(col[1]);
                    cols.add(name);
                    const ref = new RegExp(String.raw`REFERENCES\s+(${QNAME})\s*(?:\(([^)]*)\))?`, "i").exec(el);
                    const rt = ref && tableName(ref[1]);
                    if (rt) addFk({ name: `${t}_${name}_fkey`, table: t, columns: [name], refTable: rt, refColumns: ref![2] ? identList(ref![2]) : ["id"], onDelete: onDeleteOf(el) });
                }
                tables.set(t, cols);
                continue;
            }
            m = new RegExp(String.raw`^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\s\S]+?)(?:\s+(?:CASCADE|RESTRICT))?$`, "i").exec(st);
            if (m) {
                for (const raw of topLevel(m[1])) {
                    const t = tableName(raw);
                    if (t) { tables.delete(t); fks = fks.filter((x) => x.table !== t); }
                }
                continue;
            }
            m = new RegExp(String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QNAME})\s+([\s\S]+)$`, "i").exec(st);
            if (!m) continue;
            const t = tableName(m[1]);
            if (!t || !tables.has(t)) continue;
            const cols = tables.get(t)!;
            const rest = m[2].trim();
            const rt = /^RENAME\s+TO\s+(\S+)$/i.exec(rest);
            if (rt) {
                const nt = unquote(rt[1]);
                tables.set(nt, cols); tables.delete(t);
                fks = fks.map((x) => ({ ...x, table: x.table === t ? nt : x.table, refTable: x.refTable === t ? nt : x.refTable }));
                continue;
            }
            const rc = new RegExp(String.raw`^RENAME\s+(?:COLUMN\s+)?(${IDENT})\s+TO\s+(${IDENT})$`, "i").exec(rest);
            if (rc && !/^RENAME\s+CONSTRAINT/i.test(rest)) {
                const from = unquote(rc[1]), to = unquote(rc[2]);
                if (cols.delete(from)) cols.add(to);
                fks = fks.map((x) => ({ ...x, columns: x.table === t ? x.columns.map((c) => (c === from ? to : c)) : x.columns,
                    refColumns: x.refTable === t ? x.refColumns.map((c) => (c === from ? to : c)) : x.refColumns }));
                continue;
            }
            for (const action of topLevel(rest)) {
                let a = new RegExp(String.raw`^ADD\s+CONSTRAINT\s+(${IDENT})\s+([\s\S]*)$`, "i").exec(action);
                if (a) { tableFk(t, unquote(a[1]), a[2]); continue; }
                a = new RegExp(String.raw`^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(${IDENT})`, "i").exec(action);
                if (a) { const n = unquote(a[1]); fks = fks.filter((x) => !(x.table === t && x.name === n)); continue; }
                a = new RegExp(String.raw`^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(${IDENT})`, "i").exec(action);
                if (a && !/^DROP\s+(CONSTRAINT|DEFAULT|NOT|IDENTITY|EXPRESSION)\b/i.test(action)) {
                    const n = unquote(a[1]);
                    cols.delete(n);
                    fks = fks.filter((x) => !(x.table === t && x.columns.includes(n)));
                    continue;
                }
                a = new RegExp(String.raw`^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT})\s([\s\S]*)$`, "i").exec(action);
                if (a && !CONSTRAINT_HEAD.test(action.replace(/^ADD\s+/i, ""))) {
                    const n = unquote(a[1]);
                    cols.add(n);
                    const ref = new RegExp(String.raw`REFERENCES\s+(${QNAME})\s*(?:\(([^)]*)\))?`, "i").exec(a[2]);
                    const r = ref && tableName(ref[1]);
                    if (r) addFk({ name: `${t}_${n}_fkey`, table: t, columns: [n], refTable: r, refColumns: ref![2] ? identList(ref![2]) : ["id"], onDelete: onDeleteOf(a[2]) });
                    continue;
                }
                a = /^ADD\s+([\s\S]*)$/i.exec(action);
                if (a && /^FOREIGN/i.test(a[1])) tableFk(t, `${t}_anon_fkey_${fks.length}`, a[1]);
            }
        }
    }
    return { files: files.length, head: files.at(-1)!.replace(/_.*$/, ""), tables, foreignKeys: fks };
}
