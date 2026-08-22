/**
 * CANONICAL LOADER OWNERSHIP — a reference resource has one loader/freshness owner.
 *
 * Mounted consumers may not independently refetch the same resource. Two measured cases:
 *
 *   Operations  — the Staff and Children tabs each issued their identical URL twice. Not a production
 *                 double-fetch (StrictMode double-invokes in dev), but the loaders around them absorb
 *                 that and these did not, because they used a raw `fetch` with no dedupe or warm
 *                 owner — so any legitimate remount re-issued the slowest read on the surface.
 *   Communications — identical URLs ×3 on open and ×4 on reopen for the reference vocabularies. Those
 *                 loaders already short-circuit on a warm hit; what they could not do is survive the
 *                 race where every consumer checks warm before it lands.
 *
 * The fix in both places is the same and adds nothing: use the canonical dedupe owner the file
 * already imports, so the first caller fetches and the rest join the in-flight request.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("operations record sections load through the canonical owner", () => {
    it("the staff directory is deduped, not raw-fetched", () => {
        const src = read("components/adminV2/records/RecordsStaffSection.tsx");
        expect(src).toContain('dedupeAdminFetchWithTtl(\n                "/api/admin/staff/directory?include_ended=true"');
        expect(src).not.toMatch(/await fetch\("\/api\/admin\/staff\/directory/);
    });

    it("the children projection — the slowest read on the surface — is deduped", () => {
        const src = read("components/adminV2/records/RecordsChildrenSection.tsx");
        expect(src).toContain("dedupeAdminFetchWithTtl(buildUrl(0)");
        expect(src).not.toMatch(/await fetch\(buildUrl\(0\)/);
    });
});

describe("communications reference vocabularies have one loader owner", () => {
    const src = () => read("app/adminV2/communications/AnnouncementsWorkspace.tsx");

    it("status options, program categories and location hierarchy join one in-flight request", () => {
        const s = src();
        expect(s).toContain("dedupeAdminFetchWithTtl(PROGRAM_OPTIONS_API");
        expect(s).toContain("dedupeAdminFetchWithTtl(LOCATION_HIERARCHY_API");
        expect(s).toContain("dedupeAdminFetchWithTtl(`${STATUS_OPTIONS_API}?grain=${g}`");
        expect(s).toContain("dedupeAdminFetchWithTtl(`${TEMPLATES_API}?status=active`");
    });

    it("raw fetches of those reference URLs are gone", () => {
        const s = src();
        expect(s).not.toMatch(/\bfetch\(PROGRAM_OPTIONS_API/);
        expect(s).not.toMatch(/\bfetch\(LOCATION_HIERARCHY_API/);
        expect(s).not.toMatch(/await fetch\(`\$\{STATUS_OPTIONS_API\}/);
    });

    it("the MUTABLE lists may use dedupe ONLY because every mutation busts it first", () => {
        /*
         * This assertion is deliberately the inverse of its earlier form. The lists were left raw
         * while there was no bust seam, because a plain TTL would have shown an operator their own
         * save missing. Now the seam exists, so bounded reuse is earned rather than assumed — and the
         * guard has to check the thing that earns it, not the absence of caching.
         */
        const a = src();
        expect(a).toContain("dedupeAdminFetchWithTtl(ANNOUNCEMENTS_API");
        // Every reload that follows a mutation busts the owner first.
        const anBusts = (a.match(/bustCommunicationsAnnouncementsFetchDedupe\(\);\n\s+await loadList\(\);/g) ?? []).length;
        expect(anBusts).toBeGreaterThanOrEqual(4);

        const t = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        expect(t).toContain("dedupeAdminFetchWithTtl(");
        const tplBusts = (t.match(/bustCommunicationsTemplatesFetchDedupe\(\);\n\s+await loadList\(\);/g) ?? []).length;
        expect(tplBusts).toBeGreaterThanOrEqual(3);
    });

    it("a forced warm refresh is never served from the coalescing layer", () => {
        // A force a cache can satisfy is not a force.
        const s = read("lib/communications/v2/communicationsWorkspaceWarmCache.ts");
        expect(s).toContain("opts?.force ? 0 : WARM_COALESCE_TTL_MS");
    });

    it("the warm cache fetches through the SAME owner as its consumers", () => {
        // Two owners for one resource is what produced the residual x2.
        const s = read("lib/communications/v2/communicationsWorkspaceWarmCache.ts");
        expect(s).toContain("dedupeAdminFetchWithTtl(TEMPLATES_API");
        expect(s).toContain("dedupeAdminFetchWithTtl(ANNOUNCEMENTS_API");
        expect(s).toContain("dedupeAdminFetchWithTtl(PROGRAM_OPTIONS_API");
        expect(s).not.toMatch(/\bfetch\(TEMPLATES_API,/);
    });

    it("the warm short-circuit is preserved, not replaced by the dedupe", () => {
        // Dedupe coalesces a race; it does not become the freshness owner.
        expect(src()).toContain("getCommunicationsWarmAudienceMetadata() !== null) return");
    });
});
