/**
 * NO READ OF `documents` MAY NAME A COLUMN THE TABLE DOES NOT HAVE.
 *
 * `documents` has `title` and `doc_type`. It has never had `name` or `document_type`. Three separate
 * reads named the absent ones, and PostgREST answers such a select with a 500 rather than by ignoring
 * it — so each of those reads was an operator surface that could only fail:
 *
 *   `GET /api/admin/opportunities/[id]/enrollment-packets`
 *     → 500 {"error":"column documents.name does not exist"}
 *
 * That route is how an operator sees the packets already sent to a family, which makes it part of
 * deciding whether to send another. Found by Operator Launch QA on deployed staging, against the real
 * configured Enrollment packet.
 *
 * The bug was COPIED, which is why this guard is class-wide rather than three assertions. A select
 * list is a string; the compiler cannot check it, and the next person to copy one of these reads gets
 * caught here instead of in production.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** Columns `public.documents` does not have, measured against a real database (PostgREST 42703). */
const ABSENT = ["name", "document_type"] as const;

const ROOTS = ["lib", "app", "components"].map((d) => resolve(__dirname, "..", "..", d));

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next") continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) sourceFiles(full, out);
        else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
}

/**
 * Every `.select(...)` that belongs to a `from("documents")` call.
 *
 * Matched within a bounded window after the `from`, because these reads are written as a chain and a
 * whole-file search would attribute another table's select list to `documents`.
 */
function documentSelectLists(source: string): string[] {
    const found: string[] = [];
    const re = /\.from\(\s*["']documents["']\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
        const window = source.slice(m.index, m.index + 400);
        const sel = /\.select\(\s*(["'`])([\s\S]*?)\1\s*\)/.exec(window);
        if (sel) found.push(sel[2]);
    }
    return found;
}

describe("selects against the documents table", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
        for (const file of sourceFiles(root)) {
            const source = readFileSync(file, "utf8");
            if (!source.includes('from("documents")')) continue;
            for (const list of documentSelectLists(source)) {
                const columns = list.split(",").map((c) => c.trim().split(/[\s:(]/)[0]);
                for (const absent of ABSENT) {
                    if (columns.includes(absent)) {
                        offenders.push(`${file.replace(/^.*\/web\//, "web/")} selects documents.${absent}`);
                    }
                }
            }
        }
    }

    it("never name a column the table does not have", () => {
        // PostgREST turns one of these into a 500 for the whole request — there is no partial answer,
        // so a single wrong column takes the entire operator surface down.
        expect(offenders).toEqual([]);
    });

    /*
     * The guard has to be able to FAIL, or it is decoration. This proves the matcher sees a real
     * offending shape rather than passing because it found nothing to look at.
     */
    it("would catch the shape that broke the packets route", () => {
        const planted = `
            const { data } = await supabase
                .from("documents")
                .select("id, name, original_filename, document_type, status, created_at")
                .eq("org_id", orgId);
        `;
        const lists = documentSelectLists(planted);
        expect(lists).toHaveLength(1);
        const columns = lists[0].split(",").map((c) => c.trim());
        expect(columns).toContain("name");
        expect(columns).toContain("document_type");
    });

    it("reads at least one real documents select, so the sweep is not vacuous", () => {
        let seen = 0;
        for (const root of ROOTS) {
            for (const file of sourceFiles(root)) {
                const source = readFileSync(file, "utf8");
                if (source.includes('from("documents")')) seen += documentSelectLists(source).length;
            }
        }
        expect(seen).toBeGreaterThan(5);
    });
});
