/**
 * D2.3 — the writer/reader census of the legacy document columns, and its regression ratchet.
 *
 * After D2 the legacy parent (`documents.entity_type` / `entity_id`) is a PROJECTION of the primary owner in
 * `document_subjects`, and the legacy file columns (`bucket`, `storage_path`, `mime_type`, `byte_size`, `checksum_sha256`)
 * are a projection of the current version. The database refuses a direct change that does not go through the canonical
 * model. These locks keep the application from growing new independent authorities over them:
 *
 *   1. no application code UPDATEs a projected column on `documents`;
 *   2. no application code writes `document_versions` or `document_subjects` directly — only the governed functions do;
 *   3. the set of INSERT paths that still name a legacy parent is frozen (the database routes each into the canonical
 *      association); a new one fails here until it is reviewed;
 *   4. the set of READERS that select documents by the legacy parent is frozen; a new reader belongs on
 *      `listDocumentSubjects` / `document_subject_links`.
 *
 * Static, over the real source tree (app/ and lib/, tests excluded).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const REPO = resolve(WEB, "..");

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (name === "node_modules" || name.startsWith(".")) continue;
        if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

const files = [...sourceFiles(join(WEB, "app")), ...sourceFiles(join(WEB, "lib"))].map((p) => ({ rel: relative(WEB, p), src: readFileSync(p, "utf8") }));

/** Each `.from("<table>")` chain: its first chained method and the text up to the end of the statement. */
function chains(table: string) {
    const out: Array<{ rel: string; method: string; text: string }> = [];
    const re = new RegExp(String.raw`\.from\(\s*["'\`]${table}["'\`]\s*\)`, "g");
    for (const f of files) {
        for (const m of f.src.matchAll(re)) {
            const rest = f.src.slice(m.index! + m[0].length, m.index! + m[0].length + 1200);
            const method = /^\s*\.(\w+)\(/.exec(rest)?.[1] ?? "";
            out.push({ rel: f.rel, method, text: rest.split(/;\s*\n/)[0] });
        }
    }
    return out;
}

/** The text of the first call's argument list (paren-matched). */
function firstCallArgs(text: string): string {
    const open = text.indexOf("(");
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
        if (text[i] === "(") depth += 1;
        else if (text[i] === ")") {
            depth -= 1;
            if (depth === 0) return text.slice(open + 1, i);
        }
    }
    return text.slice(open + 1);
}

const PROJECTED = ["entity_type", "entity_id", "bucket", "storage_path", "mime_type", "byte_size", "checksum_sha256", "current_version_id"];

describe("D2.3 writer census", () => {
    it("no application code updates a projected column of documents", () => {
        const offenders = chains("documents")
            .filter((c) => c.method === "update")
            .flatMap((c) => PROJECTED.filter((k) => new RegExp(String.raw`\b${k}\s*:`).test(firstCallArgs(c.text))).map((k) => `${c.rel}:${k}`));
        expect(offenders).toEqual([]);
    });

    it("document_versions and document_subjects are written only through the governed functions", () => {
        const direct = [...chains("document_versions"), ...chains("document_subjects"), ...chains("document_subject_links")]
            .filter((c) => ["insert", "upsert", "update", "delete"].includes(c.method))
            .map((c) => `${c.rel}:${c.method}`);
        expect(direct).toEqual([]);
    });

    it("the INSERT paths that name a legacy parent are exactly the reviewed set", () => {
        const inserters = [
            ...new Set(
                chains("documents")
                    .filter((c) => c.method === "insert" || c.method === "upsert")
                    .filter((c) => /\bentity_type\b|\bentity_id\b/.test(firstCallArgs(c.text)))
                    .map((c) => c.rel),
            ),
        ].sort();
        expect(inserters).toEqual([
            "app/api/admin/documents/upload/route.ts",
            "app/api/public/forms/[token]/enrollment-signature-asset/route.ts",
            "app/api/public/forms/[token]/enrollment-upload/route.ts",
            "lib/forms/pdf/createGeneratedPdfForSubmission.ts",
            "lib/forms/pdf/persistSignedEnrollmentArtifact.ts",
            "lib/vendors/publicVendorApplication.ts",
        ]);
    });

    it("every document INSERT records the sha256 of its bytes", () => {
        const unhashed = chains("documents")
            .filter((c) => c.method === "insert")
            .filter((c) => /\bstorage_path\b/.test(firstCallArgs(c.text)) && !/\bchecksum_sha256\b/.test(firstCallArgs(c.text)))
            .map((c) => c.rel);
        expect(unhashed).toEqual([]);
    });

    it("Processing re-filing goes through the canonical association", () => {
        const ports = files.find((f) => f.rel === "lib/pos/processingIdentity/commands/ports.ts")!.src;
        const attach = ports.slice(ports.indexOf("async attachDocument("), ports.indexOf("async updateCommunicationPreferences("));
        expect(attach).toContain("setPrimaryDocumentSubject(");
        expect(attach).not.toMatch(/entity_type\s*:/);
    });
});

describe("D2.3 reader census", () => {
    it("the readers that select documents by the legacy parent are exactly the measured set", () => {
        const readers = [
            ...new Set(
                chains("documents")
                    .filter((c) => /\.(eq|in|or|neq|is)\(\s*["'`](entity_type|entity_id)["'`]|\.or\(\s*["'`]entity_type/.test(c.text))
                    .map((c) => c.rel),
            ),
        ].sort();
        // Measured 2026-10-23 at D2. Each reads the projection, which the database keeps equal to the primary owner.
        // Shrinking this list is welcome; growing it is not — a new reader uses listDocumentSubjects.
        expect(readers).toEqual([
            "app/api/admin/p076-first-order-prototype/route.ts",
            "app/api/admin/related/[entity]/[id]/route.ts",
            "app/api/vendor-application/route.ts",
            "lib/admin/person/resolvePersonProfilePhotoDocument.ts",
            "lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM.ts",
            "lib/runtime/firstOrder/readHealthFirstOrderSupplements.ts",
            "lib/vendors/publicVendorApplication.ts",
        ]);
    });
});

describe("the migration carries the guards the application relies on", () => {
    const sql = readFileSync(join(REPO, "supabase/migrations/20261208090000_documents_d2_canonical_foundation.sql"), "utf8");

    it("versions are immutable and outlive ordinary updates", () => {
        expect(sql).toContain("document_version_immutable");
        expect(sql).toContain("document_version_history_protected");
        expect(sql).toContain("CREATE CONSTRAINT TRIGGER trg_document_versions_guard_delete");
    });

    it("the file and the parent are projections; sensitivity is raise-only; subjects have one writer", () => {
        expect(sql).toContain("document_file_projection");
        expect(sql).toContain("document_subject_unresolved");
        expect(sql).toContain("document_sensitivity_lowering");
        expect(sql).toContain("document_subjects_governed");
        expect(sql).toContain("uq_document_subjects_one_primary");
    });

    it("the functions the application calls exist, and only service_role may run them", () => {
        for (const fn of ["document_add_version", "document_set_primary_subject", "document_link_subject", "document_unlink_subject", "document_set_version_review"]) {
            expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
            expect(sql).toMatch(new RegExp(String.raw`REVOKE ALL ON FUNCTION public\.${fn}\([^)]*\) FROM PUBLIC, anon, authenticated;`));
        }
        expect(sql).toContain("REVOKE ALL ON TABLE public.document_subjects FROM PUBLIC, anon, authenticated;");
        expect(sql).toContain("REVOKE ALL ON TABLE public.document_subject_links FROM PUBLIC, anon, authenticated;");
    });

    it("is statically analysable by the rollback harness: no dynamic SQL and no transaction-control words", () => {
        const body = sql.replace(/--[^\n]*/g, "");
        expect(body).not.toMatch(/\bEXECUTE\b(?!\s+FUNCTION\b)/i);
        expect(body).not.toMatch(/\b(COMMIT|ROLLBACK|SAVEPOINT)\b/i);
    });
});
