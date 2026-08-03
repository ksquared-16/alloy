import { describe, expect, it } from "vitest";
import {
    SHARE_EMBED_PATH_META_KEY,
    linkScopeLocationId,
    matchesDistributionScope,
    planDistributionLink,
    plaintextTokenFromEmbedPath,
    readShareEmbedPath,
} from "@/lib/admin/forms/distributionLinkReuse";
import type { FormPublicLinkSafeRow } from "@/lib/admin/forms/formsAdminDb";

const LOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function link(over: Partial<FormPublicLinkSafeRow> & { id: string }): FormPublicLinkSafeRow {
    return {
        form_definition_id: "form-1",
        pinned_form_definition_version_id: null,
        is_active: true,
        expires_at: null,
        allowed_embed_origins: null,
        metadata: { form_context_mode: "processing_intake" },
        token_prefix: "tok",
        rate_limit_profile: null,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: null,
        last_used_at: null,
        ...over,
    };
}

describe("distributionLinkReuse — metadata helpers", () => {
    it("reads and round-trips the persisted share path + token", () => {
        const path = "/forms/embed/abc-DEF_123";
        expect(readShareEmbedPath({ [SHARE_EMBED_PATH_META_KEY]: path })).toBe(path);
        expect(plaintextTokenFromEmbedPath(path)).toBe("abc-DEF_123");
    });

    it("ignores non-embed / missing paths", () => {
        expect(readShareEmbedPath({ [SHARE_EMBED_PATH_META_KEY]: "/nope" })).toBeNull();
        expect(readShareEmbedPath({})).toBeNull();
        expect(readShareEmbedPath(null)).toBeNull();
    });

    it("matches org-wide vs location scope", () => {
        expect(linkScopeLocationId({ default_location_id: LOC_A })).toBe(LOC_A);
        expect(matchesDistributionScope({ default_location_id: LOC_A }, LOC_A)).toBe(true);
        expect(matchesDistributionScope({ default_location_id: LOC_A }, LOC_B)).toBe(false);
        expect(matchesDistributionScope({}, null)).toBe(true);
        expect(matchesDistributionScope({ default_location_id: LOC_A }, null)).toBe(false);
    });
});

describe("planDistributionLink — idempotent create / dedup / regenerate", () => {
    it("reuses the newest retrievable link and deactivates duplicates in scope", () => {
        const links = [
            link({ id: "old", created_at: "2026-05-01T00:00:00.000Z", metadata: { form_context_mode: "processing_intake", [SHARE_EMBED_PATH_META_KEY]: "/forms/embed/old" } }),
            link({ id: "new", created_at: "2026-05-02T00:00:00.000Z", metadata: { form_context_mode: "processing_intake", [SHARE_EMBED_PATH_META_KEY]: "/forms/embed/new" } }),
            link({ id: "dupe", created_at: "2026-05-03T00:00:00.000Z", metadata: { form_context_mode: "processing_intake" } }),
        ];
        const plan = planDistributionLink({ links, locationId: null, regenerate: false });
        expect(plan.reuse?.id).toBe("new");
        expect(plan.mintNew).toBe(false);
        expect(plan.deactivateIds.sort()).toEqual(["dupe", "old"]);
    });

    it("deactivates legacy (non-retrievable) links and mints fresh", () => {
        const links = [
            link({ id: "legacy-1", metadata: { form_context_mode: "processing_intake" } }),
            link({ id: "legacy-2", metadata: { form_context_mode: "processing_intake" } }),
        ];
        const plan = planDistributionLink({ links, locationId: null, regenerate: false });
        expect(plan.reuse).toBeNull();
        expect(plan.mintNew).toBe(true);
        expect(plan.deactivateIds.sort()).toEqual(["legacy-1", "legacy-2"]);
    });

    it("regenerate always deactivates in-scope links and mints fresh", () => {
        const links = [
            link({ id: "keep-me", metadata: { form_context_mode: "processing_intake", [SHARE_EMBED_PATH_META_KEY]: "/forms/embed/keep" } }),
        ];
        const plan = planDistributionLink({ links, locationId: null, regenerate: true });
        expect(plan.reuse).toBeNull();
        expect(plan.mintNew).toBe(true);
        expect(plan.deactivateIds).toEqual(["keep-me"]);
    });

    it("scopes by location — a link for LOC_A is untouched when creating LOC_B", () => {
        const links = [
            link({ id: "a", metadata: { form_context_mode: "processing_intake", default_location_id: LOC_A, [SHARE_EMBED_PATH_META_KEY]: "/forms/embed/a" } }),
        ];
        const plan = planDistributionLink({ links, locationId: LOC_B, regenerate: false });
        expect(plan.reuse).toBeNull();
        expect(plan.mintNew).toBe(true);
        expect(plan.deactivateIds).toEqual([]);
    });

    it("ignores inactive and non-processing links", () => {
        const links = [
            link({ id: "inactive", is_active: false, metadata: { form_context_mode: "processing_intake", [SHARE_EMBED_PATH_META_KEY]: "/forms/embed/x" } }),
            link({ id: "not-processing", metadata: { form_context_mode: "existing_record", [SHARE_EMBED_PATH_META_KEY]: "/forms/embed/y" } }),
        ];
        const plan = planDistributionLink({ links, locationId: null, regenerate: false });
        expect(plan.reuse).toBeNull();
        expect(plan.mintNew).toBe(true);
        expect(plan.deactivateIds).toEqual([]);
    });
});
