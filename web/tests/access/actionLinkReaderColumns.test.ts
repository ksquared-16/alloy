/**
 * The `/a/<token>` reader must not select a column S-3 dropped.
 *
 * A promoted Tour invitation carried the correct hosted origin and still landed every recipient
 * on the marketing homepage. It was not a routing defect and not an origin defect: a live probe
 * of the hosted route returned `x-matched-path: /a/[token]` with `307 → /`, so the application
 * owned the route and was redirecting itself.
 *
 * The cause was one missed half of the S-3 plaintext-token removal. `20260818230000` dropped
 * `action_links.token`; this page moved its WHERE clause to `token_hash` but kept `token` in its
 * SELECT list. PostgREST rejects the WHOLE query when a selected column does not exist, so BOTH
 * lookups failed, `row` stayed null, and the page fell through to `redirect("/")`.
 *
 * A hosted census confirmed the schema: `action_links` has `token_hash`, `short_code`,
 * `consumed_at`, `expires_at` — and no `token`.
 *
 * These assertions are deliberately structural. The defect was invisible to every unit test
 * because it only appears when the query reaches a database whose schema has taken the drop, and
 * it is exactly the kind of thing that reappears the next time someone adds a column to the list.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(join(process.cwd(), "app/a/[token]/page.tsx"), "utf8");

/** Columns proven to exist on `public.action_links` after S-3, by hosted census. */
const COLUMNS_THAT_EXIST = ["short_code", "action_type", "entity_type", "entity_id", "consumed_at", "expires_at", "metadata"];

/** Dropped by 20260818230000_s3_action_link_token_drop_plaintext.sql. */
const DROPPED_COLUMNS = ["token"];

function selectLists(source: string): string[] {
    // Every string literal that looks like a PostgREST column list.
    return [...source.matchAll(/"([a-z_]+(?:,\s*[a-z_]+)+)"/g)].map((m) => m[1]!);
}

describe("action-link reader column safety", () => {
    it("selects no column that S-3 dropped", () => {
        const lists = selectLists(SOURCE);
        expect(lists.length).toBeGreaterThan(0);
        for (const list of lists) {
            const cols = list.split(",").map((c) => c.trim());
            for (const dropped of DROPPED_COLUMNS) {
                expect(cols, `select list "${list}" still asks for dropped column "${dropped}"`).not.toContain(dropped);
            }
        }
    });

    it("still selects everything the page actually reads", () => {
        const list = selectLists(SOURCE)[0]!;
        const cols = list.split(",").map((c) => c.trim());
        for (const needed of COLUMNS_THAT_EXIST) expect(cols).toContain(needed);
    });

    it("looks the row up by digest, never by plaintext", () => {
        expect(SOURCE).toContain('.eq("token_hash"');
        expect(SOURCE).not.toContain('.eq("token"');
    });

    it("recovers the plaintext from what the RECIPIENT presented, not from the row", () => {
        // The digest is one-way. After S-3 the only source of the plaintext is the URL itself,
        // and only when the hash matched — reading `row.token` is what this repair removes.
        expect(SOURCE).not.toMatch(/row as \{\s*token/);
        expect(SOURCE).toContain("presentedPlaintextToken");
    });

    it("resolves a Tour alias from metadata, so a short code still works without the plaintext", () => {
        // This is why Tour is fully recoverable: its destination never needed the bearer token.
        expect(SOURCE).toContain("tour_booking_redirect");
        expect(SOURCE).toContain("redirect_path");
    });

    it("does not let a failed query and an unknown link share a silent exit", () => {
        // The original bug was survivable precisely because both looked like redirect("/").
        expect(SOURCE).toContain("[action-link] lookup by token_hash failed");
        expect(SOURCE).toContain("[action-link] lookup by short_code failed");
    });
});
