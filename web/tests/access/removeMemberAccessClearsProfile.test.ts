/**
 * Static lock: complete member-access removal must delete the access profile.
 * The migration self-test and d2 live suite prove runtime behaviour; this pins
 * the SQL contract in the repo so a regression cannot drop the DELETE quietly.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
    __dirname,
    "../../../supabase/migrations/20261205090000_remove_member_access_clears_profile.sql",
);

describe("remove_member_access_audited clears access profiles", () => {
    const sql = readFileSync(MIGRATION, "utf8");

    it("deletes user_access_profiles after roles inside the audited function", () => {
        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.remove_member_access_audited/);
        expect(sql).toMatch(/DELETE FROM public\.user_roles/);
        expect(sql).toMatch(/DELETE FROM public\.user_access_profiles/);
        // Roles first — deferred membership↔profile invariant refuses the reverse order.
        expect(sql.indexOf("DELETE FROM public.user_roles")).toBeLessThan(
            sql.indexOf("DELETE FROM public.user_access_profiles"),
        );
    });

    it("preserves prior scope ids in the removal audit event", () => {
        expect(sql).toContain("before_site_location_ids");
        expect(sql).toContain("before_department_ids");
        expect(sql).toContain("access_profile_removed");
    });

    it("includes a negative self-test that residual role-less profiles cannot survive", () => {
        expect(sql).toContain("residual role-less profile survived complete removal");
        expect(sql).toContain("ACCESS REMOVAL ABORT");
    });
});
