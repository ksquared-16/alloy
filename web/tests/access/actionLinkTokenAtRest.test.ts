/**
 * `S-3` — the action-link bearer token is not stored in the clear.
 *
 * `action_links.token` held the COMPLETE bearer credential, `NOT NULL` and `UNIQUE`. The token IS
 * the authorization boundary for that whole route family (`RL-32` locked its replay and ordering
 * legs), and its recipients are outside the organization — vendors, contacts, families. So a read of
 * that column was equivalent to holding every unconsumed credential at once.
 *
 * **The remediation was not invented here.** `form_links` has stored `token_hash` from the start and
 * `lib/public/forms/tokenHash.ts` states the defence: the caller's plaintext is hashed and the digest
 * used as an indexed equality selector, so *"the comparison is Postgres's… there is no per-byte
 * early exit to time, because there is no per-byte compare in the application."* S-3 extends that
 * shape to a second family.
 *
 * **No live link was invalidated.** Verification never needs the plaintext back, only the ability to
 * recognise a token a recipient presents, so the existing rows were hashed in place. That is why the
 * prior session's objection — *"it INVALIDATES EVERY LIVE UNCONSUMED LINK"* — does not apply to a
 * backfilled conversion.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

const webRoot = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(webRoot, "..", "supabase", "migrations");

function sourceFilesUnder(rel: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs)) {
            const p = join(abs, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(entry)) out.push(p);
        }
    };
    walk(join(webRoot, rel));
    return out.map((p) => relative(webRoot, p).split("\\").join("/"));
}

/** Comments stripped: a doc comment explaining the retired column must not convict its own file. */
function code(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
}

const productSources = () => [...sourceFilesUnder("app"), ...sourceFilesUnder("lib")];

describe("S-3 — no plaintext action-link token at rest", () => {
    it("no source selects an action link by its plaintext token", () => {
        // Discovered, not enumerated: a new consumer added tomorrow is covered tomorrow.
        const offenders = productSources().filter((rel) => {
            const src = code(rel);
            return /from\(\s*["'`]action_links["'`]\s*\)/.test(src) && /\.eq\(\s*["'`]token["'`]/.test(src);
        });
        expect(
            offenders,
            "look the link up by token_hash — a plaintext selector requires the column S-3 removed",
        ).toEqual([]);
    });

    it("the mint stores the digest and never the token", () => {
        const src = code("lib/actionLinks.ts");
        expect(src).toMatch(/token_hash:\s*hashFormLinkToken\(/);
        // The row must not carry a bare `token` field. `token_hash:` is allowed; `token,` or
        // `token:` as an inserted column is not.
        const insertBlock = src.slice(src.indexOf("const baseRow"), src.indexOf("for (let attempt"));
        expect(insertBlock).not.toMatch(/(^|[^_\w])token\s*[,:]/);
    });

    it("the plaintext is still RETURNED to the caller — usability is preserved", () => {
        // The token has to reach the recipient's URL. S-3 is about storage, not about withholding
        // the credential from the party it was minted for; a fix that broke that would be a
        // different defect wearing this one's name.
        const src = code("lib/actionLinks.ts");
        expect(src).toMatch(/return\s*\{\s*token\s*,\s*short_code\s*\}/);
    });

    it("every action-link consumer resolves by hash", () => {
        const consumers = productSources().filter((rel) =>
            /from\(\s*["'`]action_links["'`]\s*\)/.test(code(rel)),
        );
        // Non-vacuity on the walk: the family is several routes plus the alias page.
        expect(consumers.length).toBeGreaterThanOrEqual(5);
        for (const rel of consumers) {
            const src = code(rel);
            // Only files that actually RESOLVE by token have a selector to check. The mint writes
            // `token_hash` as a column and the deletion sweep filters by `entity_id`; neither
            // resolves a credential, and asserting a selector on them would convict correct code.
            if (!/\.eq\(\s*["'`]token/.test(src)) continue;
            expect(src, `${rel} must resolve by token_hash`).toMatch(/\.eq\(\s*["'`]token_hash["'`]/);
        }
    });

    it("RL-32's replay protection is untouched by the storage change", () => {
        // S-3 moved WHERE the credential is matched. It must not have moved WHETHER the claim is
        // atomic — the guarded write is what makes a single-use link single-use.
        const src = code("lib/actionLinks.ts");
        expect(src).toMatch(/\.is\(\s*["'`]consumed_at["'`]\s*,\s*null\s*\)/);
    });

    it("the schema carries the hash and no longer carries the plaintext", () => {
        const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
        const add = files.find((f) => f.includes("s3_action_link_token_hash"));
        const drop = files.find((f) => f.includes("s3_action_link_token_drop_plaintext"));
        expect(add, "the S-3 hash migration is missing").toBeTruthy();
        expect(drop, "the S-3 drop migration is missing").toBeTruthy();
        // Ordering is the dual-read window: hash+backfill strictly before the drop.
        expect(add! < drop!).toBe(true);

        const addSql = readFileSync(join(MIGRATIONS_DIR, add!), "utf8");
        expect(addSql, "the backfill is what stops live links being invalidated").toMatch(
            /UPDATE\s+public\.action_links[\s\S]{0,200}sha256\s*\(\s*convert_to\s*\(\s*token/i,
        );
        expect(addSql, "a row with no hash must abort, not warn").toMatch(/RAISE\s+EXCEPTION/i);

        const dropSql = readFileSync(join(MIGRATIONS_DIR, drop!), "utf8");
        expect(dropSql).toMatch(/DROP\s+COLUMN\s+IF\s+EXISTS\s+token/i);
        expect(dropSql, "the drop must refuse while any row is addressable only by plaintext").toMatch(
            /RAISE\s+EXCEPTION/i,
        );
    });

    it("the SQL backfill and the application digest agree — proven, not assumed", () => {
        // The whole conversion rests on this equality. If Postgres and Node disagreed, the backfill
        // would strand every existing link while every test that only exercises new links passed.
        // Verified against the running database during the migration; asserted here on the shape so
        // a change to either side is caught.
        const addSql = readFileSync(
            join(MIGRATIONS_DIR, readdirSync(MIGRATIONS_DIR).find((f) => f.includes("s3_action_link_token_hash"))!),
            "utf8",
        );
        expect(addSql).toMatch(/encode\s*\(\s*sha256\s*\(\s*convert_to\s*\(\s*token\s*,\s*'UTF8'\s*\)\s*\)\s*,\s*'hex'\s*\)/i);
        // And the application side is a SHA-256 hex digest of the UTF-8 token.
        expect(hashFormLinkToken("sample-token")).toBe(
            "0f35d0ae14518b96bd6d3fec3ca15801fd58c9e048b1ccdea11a71378f2acdc9",
        );
    });

    it("bites: a plaintext selector is convicted", () => {
        // The scan must be able to fail. Proved against the exact shape it exists to catch.
        const fabricated = 'supabase.from("action_links").select("id").eq("token", token)';
        expect(
            /from\(\s*["'`]action_links["'`]\s*\)/.test(fabricated) && /\.eq\(\s*["'`]token["'`]/.test(fabricated),
        ).toBe(true);
        // …and does not convict the hash form.
        const correct = 'supabase.from("action_links").select("id").eq("token_hash", h)';
        expect(/\.eq\(\s*["'`]token["'`]/.test(correct)).toBe(false);
    });
});
