/**
 * D1c-1: no file reaches storage without screening, and no quarantined file's bytes can be read back.
 *
 * Static locks over the real source tree:
 *   * every `.storage.from(…).upload(` call site in web/app and web/lib is either an ingestion path that screens with
 *     `decideIngestion`, or a declared server-generated writer (PDFs the platform renders itself). A new upload site fails
 *     here until it is classified;
 *   * every `.storage.from(…).download(` call site either goes through the access decision (which refuses `quarantined`) or
 *     checks `isDocumentUnavailable` itself.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (name === "node_modules" || name.startsWith(".")) continue;
        const st = statSync(p);
        if (st.isDirectory()) out.push(...sourceFiles(p));
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

const files = [...sourceFiles(join(WEB, "app")), ...sourceFiles(join(WEB, "lib"))].map((p) => ({
    rel: relative(WEB, p),
    src: readFileSync(p, "utf8"),
}));

/** Ingestion paths: they must screen. The vendor library stores what its route screened, so the route is checked. */
const SCREENED: Record<string, string> = {
    "app/api/admin/documents/upload/route.ts": "app/api/admin/documents/upload/route.ts",
    "app/api/public/forms/[token]/enrollment-upload/route.ts": "app/api/public/forms/[token]/enrollment-upload/route.ts",
    "app/api/public/forms/[token]/enrollment-signature-asset/route.ts": "app/api/public/forms/[token]/enrollment-signature-asset/route.ts",
    "lib/vendors/publicVendorApplication.ts": "app/api/vendor-application/route.ts",
};
/** Server-generated writers: the bytes are produced by the platform, not received. */
const GENERATED = new Set(["lib/forms/pdf/createGeneratedPdfForSubmission.ts", "lib/forms/pdf/persistSignedEnrollmentArtifact.ts"]);

describe("every storage upload is screened or platform-generated", () => {
    const uploaders = files.filter((f) => /\.storage\s*\.\s*from\([^)]*\)\s*\.\s*upload\(|\.upload\(\s*storagePath|\.upload\(\s*(insurancePath|driversPath)/.test(f.src));

    it("the set of upload call sites is exactly the classified set", () => {
        expect(uploaders.map((f) => f.rel).sort()).toEqual([...Object.keys(SCREENED), ...GENERATED].sort());
    });

    for (const [site, screener] of Object.entries(SCREENED)) {
        it(`${site} is screened (by ${screener}) before storage`, () => {
            const src = files.find((f) => f.rel === screener)?.src ?? "";
            expect(src).toContain("decideIngestion(");
            if (screener === site) {
                expect(src.indexOf("decideIngestion(")).toBeLessThan(src.indexOf(".upload("));
            }
        });
    }

    it("the vendor library stores the route's screening status, never a hard-coded one", () => {
        const src = files.find((f) => f.rel === "lib/vendors/publicVendorApplication.ts")!.src;
        expect(src).toContain("input.proof_of_insurance.status");
        expect(src).toContain("input.drivers_license.status");
    });
});

describe("no quarantined document's bytes can be read", () => {
    const downloaders = files.filter((f) => /\.storage\s*\.\s*from\([^)]*\)\s*\.\s*download\(/.test(f.src));

    it("every download call site is gated by the access decision or the availability check", () => {
        expect(downloaders.length).toBeGreaterThan(0);
        for (const f of downloaders) {
            expect(f.src.includes("assertDocumentAccess(") || f.src.includes("isDocumentUnavailable("), f.rel).toBe(true);
        }
    });

    it("the access decision refuses quarantined documents", () => {
        const src = files.find((f) => f.rel === "lib/documents/assertDocumentAccess.ts")!.src;
        expect(src).toContain("UNAVAILABLE_DOCUMENT_STATUSES");
        const avail = files.find((f) => f.rel === "lib/documents/documentAvailability.ts")!.src;
        expect(avail).toContain('"quarantined"');
    });
});
