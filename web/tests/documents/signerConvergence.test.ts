/**
 * Phase 0 closeout — signer convergence.
 *
 * The Phase 0 claim is "no seven-day signer remains, and no URL is minted before
 * authorization." Those were being asserted by inventory grep during review,
 * which is exactly the kind of claim that silently rots. This pins them.
 *
 * Found by the closeout inventory: the profile-photo route authorized correctly
 * but called a helper that had ALREADY signed a seven-day URL, so an authorized
 * caller received a credential outliving its authorization by a week.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { signedUrlExpirySeconds } from "@/lib/documents/assertDocumentAccess";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Strip comments before scanning for banned expiry literals.
 *
 * Several of these files deliberately QUOTE the old seven-day value in a comment
 * explaining what was removed and why. That documentation is worth keeping, so
 * the scan must look at code only.
 */
const code = (p: string) =>
    read(p)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

/** Every module that calls createSignedUrl, per the closeout inventory. */
const SIGNERS = [
    "app/api/admin/documents/[id]/signed-url/route.ts",
    "app/api/admin/persons/[id]/profile-photo/route.ts",
    "app/api/admin/vendors/[id]/documents/signed-url/route.ts",
    "lib/documents/profilePhotoPresentation.ts",
];

describe("no signer outlives its authorization", () => {
    it("caps every operation at 15 minutes", () => {
        for (const op of ["preview", "download", "attachment"] as const) {
            expect(signedUrlExpirySeconds(op)).toBeLessThanOrEqual(60 * 15);
        }
    });

    it("has no seven-day expiry literal left in any signer", () => {
        for (const path of SIGNERS) {
            const src = code(path);
            expect(src, path).not.toMatch(/60\s*\*\s*60\s*\*\s*24\s*\*\s*7/);
            expect(src, path).not.toMatch(/\b604800\b/);
        }
    });

    it("routes every signer's expiry through signedUrlExpirySeconds", () => {
        for (const path of SIGNERS) {
            expect(read(path), path).toMatch(/signedUrlExpirySeconds/);
        }
    });
});

describe("authorization precedes minting, not just disclosure", () => {
    // NOTE ON STRENGTH: this compares FIRST occurrences, so it catches the
    // regression that actually happened (a route whose signing preceded its
    // guard) but does not by itself prove every later signing site is gated.
    // The mutating handlers are covered separately below.
    it("authorizes before the first createSignedUrl in every signing route", () => {
        for (const path of SIGNERS) {
            const src = code(path);
            const guard = src.indexOf("assertDocumentAccess(");
            const sign = src.indexOf(".createSignedUrl(");
            if (sign < 0) continue;
            expect(guard, `${path}: no guard`).toBeGreaterThanOrEqual(0);
            expect(guard, `${path}: signs before authorizing`).toBeLessThan(sign);
        }
    });

    it("gates the mutating profile-photo handlers on documents.write", () => {
        /*
         * THIS ASSERTED `ctx.role !== "admin"`, AND ITS OWN COMMENT GAVE THE REASON: the handlers
         * were "role-gated rather than document-gated, which is the stricter of the two". That was
         * true, and it was true because `documents.write` was DORMANT — catalogued, granted to admin
         * and ops in every organization, and named by no source file at all. A title really is
         * stricter than a key nothing consults.
         *
         * The CRM/People slice gave the key its first enforcement sites, so the comparison inverts:
         * the capability is now the real gate and the title is the weaker claim — it cannot be
         * granted, cannot be withheld, and denied `ops` a document write its package already
         * carried. Same route, same strictness intent, honest instrument.
         */
        const src = code("app/api/admin/persons/[id]/profile-photo/route.ts");
        const posts = src.split(/export async function (?:POST|DELETE)\b/).slice(1);
        expect(posts).toHaveLength(2);
        for (const handler of posts) {
            expect(handler).toMatch(/requireDocumentWrite\(ctx\)/);
            expect(handler, "a role title must not be the authority here").not.toMatch(/ctx\.role !== "admin"/);
        }
    });

    it("keeps the person photo lookup a query, with no signing of its own", () => {
        const helper = read("lib/admin/person/resolvePersonProfilePhotoDocument.ts");
        expect(helper).not.toMatch(/createSignedUrl/);
    });

    it("leaves no caller of the removed sign-then-authorize helper", () => {
        for (const path of SIGNERS) {
            expect(read(path), path).not.toMatch(/resolveLatestProfilePhotoDocumentForPerson/);
        }
    });
});
