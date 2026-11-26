/**
 * Law 4 completion — publication is the only sanctioned writer of the published business-process
 * projection.
 *
 * Behavioural proof runs against real Postgres (certification/bp-config-integrity/02-write-guard.sql,
 * 22/22). This file guards the contract in CI, and holds the product-code rule that the database
 * trigger cannot express: no product module may write the lifecycle projection directly.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guard = readFileSync(
    resolve(
        process.cwd(),
        "../supabase/migrations/20260730130000_business_process_projection_write_guard.sql",
    ),
    "utf8",
);

const bootstrap = readFileSync(
    resolve(process.cwd(), "lib/admin/verticalBootstrap/applyVerticalBootstrap.ts"),
    "utf8",
);

describe("lifecycle projection write guard", () => {
    it("guards only the lifecycle key, so unrelated department metadata keeps working", () => {
        expect(guard).toContain("NEW.metadata -> 'lifecycle_builder_v1'");
        expect(guard).toContain("OLD.metadata -> 'lifecycle_builder_v1'");
        // Short-circuits when the lifecycle key is unchanged — the narrowness guarantee.
        expect(guard).toContain("IF v_old IS NOT DISTINCT FROM v_new THEN");
    });

    it("permits initialization but never overwrite", () => {
        // absent -> present is allowed (a seed may create what does not exist)...
        expect(guard).toContain("IF v_old IS NULL THEN");
        // ...and INSERT is allowed, since there is nothing to overwrite.
        expect(guard).toContain("IF TG_OP = 'INSERT' THEN");
    });

    it("requires a capability token for any other change, as insufficient_privilege", () => {
        expect(guard).toContain("current_setting('alloy.lifecycle_write', true)");
        expect(guard).toContain("ERRCODE = '42501'");
        expect(guard).toContain("publication-owned");
    });

    it("releases the token immediately after the projection write", () => {
        // The GUC is transaction-local, not statement-local. Without an explicit release a
        // publish would leave a standing bypass for the rest of its transaction.
        expect(guard).toContain("CREATE OR REPLACE FUNCTION public.end_lifecycle_projection_write");
        const releases = guard.match(/PERFORM public\.end_lifecycle_projection_write\(\)/g) ?? [];
        // Once in publish, once in rollback.
        expect(releases.length).toBe(2);
    });

    it("restricts the capability token to publish and migration modes", () => {
        expect(guard).toContain("p_mode NOT IN ('publish', 'migration')");
        expect(guard).toContain("lifecycle_projection_write_mode_invalid");
    });

    it("offers a warn posture for the rollout window only", () => {
        expect(guard).toContain("alloy.lifecycle_guard");
        expect(guard).toContain("RAISE WARNING");
        // Enforcement must be the default: warn is opt-in via an explicit setting.
        expect(guard).toContain("= 'warn'");
    });

    it("attaches to departments on both insert and update", () => {
        expect(guard).toContain("BEFORE INSERT OR UPDATE ON public.departments");
    });
});

describe("applyVerticalBootstrap no longer replaces an established department", () => {
    it("never writes the blueprint's lifecycle configuration onto an existing department", () => {
        // The blueprint's lifecycle key is destructured away before the merge.
        expect(bootstrap).toContain("lifecycle_builder_v1: _publicationOwned");
    });

    it("merges rather than replacing, with existing keys winning", () => {
        expect(bootstrap).toContain("const mergedMeta = { ...blueprintMeta, ...existingMeta }");
        // The destructive full-column replace is gone from the update path.
        expect(bootstrap).not.toMatch(/\.update\(\{[\s\S]{0,400}?metadata: meta,/);
    });

    it("compares against the merged result so the skip check no longer inverts", () => {
        // The old check compared existing vs blueprint, so it skipped departments with nothing to
        // lose and always fired on departments with authored configuration.
        expect(bootstrap).toContain("JSON.stringify(existingMeta) === JSON.stringify(mergedMeta)");
    });
});
