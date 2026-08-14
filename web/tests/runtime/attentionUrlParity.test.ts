/**
 * TE-5 — Routing-permutation parity: `urlFromAttention` ⇄ `attentionFromUrl`.
 *
 * The URL is an external REPRESENTATION of committed focus, not intent (attention.ts §"Canonical URL
 * ⇄ Attention"). These unit tests lock two contracts the runtime depends on:
 *   1. Round-trip parity — projecting an AttentionRef to a URL and reading it back preserves the four
 *      URL-carried coordinates (target, lens, subject, aspect) across every permutation.
 *   2. Query-canonical subject (Decision D-004 / task RA-2) — a selected record is the `?subject_id`
 *      query ONLY. A legacy `/:recordId` path segment after the slug is NOT read as the subject (it is
 *      ignored, so it selects the default), and `urlFromAttention` NEVER emits a path record segment.
 *      This parity is why RA-2 retired the path form and query-ified the record-bearing hrefs.
 */
import { describe, it, expect } from "vitest";
import {
    attentionFromUrl,
    urlFromAttention,
    type AttentionRef,
} from "@/lib/runtime/kernel/attention";

const IDENT = { tenant: "org-1", principal: "user-1" };

/** Build a full AttentionRef from just the URL-carried coordinates (the rest are non-URL fillers). */
function ref(
    partial: Pick<AttentionRef, "target"> &
        Partial<Pick<AttentionRef, "lens" | "subject" | "aspect" | "cohort">>,
): AttentionRef {
    return {
        tenant: IDENT.tenant,
        principal: IDENT.principal,
        scope: 0,
        target: partial.target,
        lens: partial.lens ?? null,
        // URL-carried too (`?cohort=none`), so parity is a question about it as well.
        cohort: partial.cohort ?? null,
        subject: partial.subject ?? null,
        aspect: partial.aspect ?? null,
        destination: null,
        source: "pointer",
        version: 1,
    };
}

/** The four coordinates the URL carries (tenant/principal/scope/destination are NOT URL-projected). */
const coords = (r: {
    target: string;
    lens?: string | null;
    subject?: string | null;
    aspect?: string | null;
}) => ({
    target: r.target,
    lens: r.lens ?? null,
    subject: r.subject ?? null,
    aspect: r.aspect ?? null,
});

const PERMUTATIONS: AttentionRef[] = [
    ref({ target: "new_leads" }),
    ref({ target: "new_leads", lens: "new_leads" }),
    ref({ target: "new_leads", subject: "opp-7" }),
    ref({ target: "new_leads", lens: "new_leads", subject: "opp-7" }),
    ref({ target: "new_leads", lens: "hot", subject: "opp-7", aspect: "documents" }),
    // Encode/decode safety: a target with a space and a subject with URL-reserved chars.
    ref({ target: "enrollment pipeline", subject: "opp/with?special#chars" }),
];

describe("TE-5 — attention ⇄ URL routing parity", () => {
    it("round-trips every permutation through urlFromAttention → attentionFromUrl (4 coords preserved)", () => {
        for (const r of PERMUTATIONS) {
            const url = new URL(`http://x${urlFromAttention(r)}`);
            const back = attentionFromUrl(url, IDENT);
            expect(back, `hydration for ${url.pathname}${url.search}`).not.toBeNull();
            expect(coords(back!)).toEqual(coords(r));
        }
    });

    it("lens/subject/aspect are all query params — the full coordinate set projects to the query string", () => {
        const url = urlFromAttention(
            ref({ target: "new_leads", lens: "hot", subject: "opp-3", aspect: "activity" }),
        );
        expect(url).toBe(
            "/workspace/work-unit/new_leads?work_view_id=hot&subject_id=opp-3&aspect=activity",
        );
        const back = attentionFromUrl(new URL(`http://x${url}`), IDENT);
        expect(coords(back!)).toEqual({
            target: "new_leads",
            lens: "hot",
            subject: "opp-3",
            aspect: "activity",
        });
    });

    it("subject is the `?subject_id` query ONLY — a path `/:recordId` is ignored (D-004 / RA-2)", () => {
        const query = attentionFromUrl(
            new URL("http://x/workspace/work-unit/new-leads?subject_id=opp-1"),
            IDENT,
        );
        expect(query?.target).toBe("new-leads");
        expect(query?.subject).toBe("opp-1");

        // The retired legacy path form: the record segment after the slug is NOT the subject — the
        // regex captures only the slug, so this hydrates the default subject (null), never `opp-1`.
        const path = attentionFromUrl(
            new URL("http://x/workspace/work-unit/new-leads/opp-1"),
            IDENT,
        );
        expect(path?.target).toBe("new-leads");
        expect(path?.subject).toBeNull();
    });

    it("urlFromAttention NEVER emits a path record segment — a subject is always `?subject_id`", () => {
        const url = urlFromAttention(ref({ target: "new_leads", subject: "opp-9" }));
        expect(url).toBe("/workspace/work-unit/new_leads?subject_id=opp-9");
        // Exactly one path segment after `work-unit/` (the slug) — never `/slug/record`.
        const pathOnly = url.split("?")[0];
        expect(pathOnly.split("/work-unit/")[1]).not.toContain("/");
    });
});
