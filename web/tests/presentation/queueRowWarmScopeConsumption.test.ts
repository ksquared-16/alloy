import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const RECORD_WORK = read("lib/presentation/runtime/useRecordWorkRuntime.ts");
const WU_RUNTIME = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
const CACHE_SCOPE = read("lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope.ts");
const FETCH_CLIENT = read("lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient.ts");

/**
 * OX SLICE 2 — THE ROW WARM MUST KEY ON THE SCOPE THE CONSUMER ASKS FOR.
 *
 * Measured on deployed 447abd94: hover fetched
 *   /api/admin/view-models/drawer/opportunity/<id>
 * and the click fetched
 *   /api/admin/view-models/drawer/opportunity/<id>?attention_subject_id=<id>
 * Same endpoint, same record, ~2.8s paid twice, because the warm asserted a different scope than
 * the settled transport. These pin the alignment so the warm cannot drift back out of reach.
 */
describe("queue row warm scope consumption", () => {
    it("the prewarm accepts the attention subject the settled transport will assert", () => {
        expect(RECORD_WORK).toMatch(/export async function prewarmRecordWork\(\s*subjectId: string,/);
        expect(RECORD_WORK).toContain("attentionSubjectId: string | null = null");
    });

    it("the prewarm builds the SAME context shape the settled transport builds", () => {
        // Consumer shape, which must not drift from the warm shape.
        expect(RECORD_WORK).toContain(
            '{ work_unit_id: "", department_id: "", attention_subject_id: attentionSubjectId }',
        );
        expect(RECORD_WORK).toContain(
            '{ work_unit_id: "", department_id: "", attention_subject_id: attention }',
        );
        expect(RECORD_WORK).toContain("loadOpportunityDrawerViaViewModel(id, warmContext)");
        // The unreachable bare-scope warm must not come back.
        expect(RECORD_WORK).not.toContain("loadOpportunityDrawerViaViewModel(id, null)");
    });

    it("the attention subject is NOT defaulted from the opportunity id", () => {
        // Warming under a scope the consumer will not ask for is what produced the unreachable
        // entry; a silent default would reintroduce it while looking correct.
        expect(RECORD_WORK).toContain("attentionSubjectId?.trim() || null");
        expect(RECORD_WORK).not.toMatch(/attentionSubjectId\s*\?\?\s*subjectId/);
        expect(RECORD_WORK).not.toMatch(/attentionSubjectId\s*\|\|\s*id\b/);
    });

    it("a missing attention subject keeps the previous bare-scope behaviour, not a fabricated one", () => {
        expect(RECORD_WORK).toMatch(/const warmContext = attention\s*\?/);
        expect(RECORD_WORK).toContain(": null;");
    });

    it("the call site passes the SUBJECT as the attention subject, not the opportunity", () => {
        expect(WU_RUNTIME).toContain("if (opportunity) void prewarmRecordWork(opportunity, id)");
        expect(WU_RUNTIME).not.toContain("prewarmRecordWork(opportunity, opportunity)");
    });

    it("the cache scope still keys on the attention subject — the key is the wrong-record guard", () => {
        // A warm for subject A can never be consumed for subject B because the scope key differs.
        // If this dimension were dropped, cross-subject consumption would become possible.
        expect(CACHE_SCOPE).toContain("attention_subject_id");
        expect(CACHE_SCOPE).toMatch(/attentionSubjectId/);
    });

    it("the URL carries the attention subject only when one is stated", () => {
        expect(FETCH_CLIENT).toContain('qs.set("attention_subject_id", attention)');
        expect(FETCH_CLIENT).toMatch(/if \(attention\)/);
    });

    it("latest-click-wins is still guarded by the fetch generation, not by the warm", () => {
        // The repair must not become the thing that orders responses.
        expect(RECORD_WORK).toContain("fetchGenRef");
        expect(RECORD_WORK).toContain("if (gen !== fetchGenRef.current) return;");
    });
});
