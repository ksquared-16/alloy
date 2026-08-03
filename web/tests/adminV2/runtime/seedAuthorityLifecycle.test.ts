/**
 * SEED AUTHORITY — durable contract guards.
 *
 * THE LAW (measured, not assumed):
 *   One initial-navigation seed per navigation, plus one subject-transition warm per selected-record
 *   change.
 *
 * It is deliberately NOT "one seed per session". The queue-row click legitimately registers a second
 * entry, and certification proved it is a distinct lifecycle event with a distinct owner:
 *
 *   registration 1  producer=page(subject=<requested|null>)  key.subject=<requested|null>
 *   registration 2  producer=prefetch                        key.subject=<clicked row>
 *
 * Deterministic across three runs: the clicked row id equalled the visible subject exactly, each
 * registration was consumed exactly once, no default or stale subject was recomposed during the click,
 * and there were zero mixed-subject frames. Encoding "one seed total" would have flagged correct
 * behaviour as a defect.
 *
 * These are source/structure guards. The behavioural proof lives in the certification record
 * (docs/runtime/SUBJECT-AUTHORITY.md, DEEPLINK-COMPOSE-OWNERSHIP.md) because it needs a real browser,
 * a real database and a prod build — none of which a unit test can honestly stand in for.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const LAYOUT = "app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx";
const PAGE = "app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx";
const COMPOSER = "lib/runtime/provisioning/workUnitProvisioningAnswer.ts";
const PREFETCH = "lib/runtime/kernel/workUnitProvisioningPrefetch.ts";

describe("initial-navigation seed ownership", () => {
    it("the PAGE owns provisioning composition — it is the only boundary with searchParams", () => {
        const page = read(PAGE);
        expect(page).toContain("searchParams");
        expect(page).toContain("composeProvisioningAnswerForRoute");
        expect(page).toContain("ProvisioningAnswerSeed");
    });

    it("the page keys its seed by the REQUESTED subject, not a default", () => {
        const page = read(PAGE);
        expect(page).toMatch(/subject=\{requestedSubjectId\}/);
        expect(page).toContain("requestedSubjectId");
    });

    it("the LAYOUT no longer composes, and renders children so the page can mount", () => {
        const layout = read(LAYOUT);
        // The layout previously discarded children, which is why an earlier page-seed attempt never
        // mounted at all — the historical "lost the hydration race" conclusion was withdrawn.
        expect(layout).toMatch(/\{children\}/);
        expect(layout).not.toContain("composeProvisioningAnswerForRoute");
        // It still owns the Host and route identity.
        expect(layout).toContain("WorkUnitSlugRouteHost");
    });

    it("bare route still resolves a default subject (the fallback is narrowed, not removed)", () => {
        const composer = read(COMPOSER);
        expect(composer).toMatch(/requested\s*\?\?\s*\n?\s*resolveDefaultOperationalSubject/);
    });
});

describe("a named subject is authoritative", () => {
    it("an unavailable requested subject fails honestly instead of falling back", () => {
        const composer = read(COMPOSER);
        const selection = composer.slice(
            composer.indexOf("const requested = req.requestedSubjectId"),
            composer.indexOf("const subjectRow = page.find"),
        );
        expect(selection).toMatch(/if\s*\(\s*req\.requestedSubjectId\s*&&\s*!requested\s*\)/);
        expect(selection).toContain("subject_unavailable");
        // Order is the invariant: reaching the default fallback with a requested-but-absent id is the bug.
        expect(selection.search(/if\s*\(\s*req\.requestedSubjectId\s*&&\s*!requested\s*\)/))
            .toBeLessThan(selection.indexOf("resolveDefaultOperationalSubject"));
    });
});

describe("transition warms stay distinguishable from initial provisioning", () => {
    it("the seed key includes lens and subject, so scopes cannot collide", () => {
        const prefetch = read(PREFETCH);
        expect(prefetch).toContain('q.set("work_view_id", lens)');
        expect(prefetch).toContain('q.set("subject_id", subject)');
    });

    it("sibling work-view prewarms are lens-keyed — never counted as initial provisioning", () => {
        // Certification counts a provisioning request as a sibling prewarm iff it carries
        // `work_view_id`. That classification is only sound because the key builder puts the lens in
        // the URL, so pin it here: if the lens ever left the key, every prewarm would be miscounted as
        // an initial duplicate and the matrix would read as a regression.
        const prefetch = read(PREFETCH);
        const builder = prefetch.slice(
            prefetch.indexOf("export function provisioningAnswerUrl"),
            prefetch.indexOf("function isFresh"),
        );
        expect(builder).toContain("work_view_id");
        expect(builder).toContain("subject_id");
    });

    it("the reveal gate still defers the speculative sibling sweep", () => {
        const runtime = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
        const sweep = runtime.slice(
            runtime.indexOf("const ids = siblingViewIds.split"),
            runtime.indexOf("}, [siblingViewIds, prefetchWorkView]);"),
        );
        expect(sweep).toContain("isWorkUnitPrimaryRevealActive()");
        // The hover/focus warm is operator INTENT and must never be deferred.
        const primitive = runtime.slice(
            runtime.indexOf("const prefetchWorkView = useCallback"),
            runtime.indexOf("[kernel],"),
        );
        expect(primitive).not.toContain("isWorkUnitPrimaryRevealActive");
    });
});
