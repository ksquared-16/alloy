/**
 * THE MINIMAL QA SETUP CONTRACT — its vectors are the platform's acceptance test. Every `accept` record judges ok,
 * every `refuse` record refuses with exactly its named code, and every refusal the judge can return is exercised by
 * at least one vector (a code no vector reaches is a guard nobody has seen fire).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { judgeQaSetupRecord, QA_SETUP_REFUSALS, QA_WORKFLOW_SETUP_SCHEMA, QA_WORKFLOW_SETUPS } from "../../scripts/qa/qaWorkflowSetupContract.mjs";

type Vector = { name: string; record: Record<string, unknown>; code?: string };
const V = JSON.parse(readFileSync(join(process.cwd(), "tests/qa/fixtures/qa-workflow-setup.vectors.json"), "utf8")) as { schema: string; contract: string; judge: string; accept: Vector[]; refuse: Vector[] };

describe("qa-workflow-setup vectors", () => {
    it("name this contract and this judge", () => {
        expect(V.schema).toBe("alloy.qa_workflow_setup.vectors.v1");
        expect(V.contract).toBe(QA_WORKFLOW_SETUP_SCHEMA);
        expect(V.judge).toBe("web/scripts/qa/qaWorkflowSetupContract.mjs judgeQaSetupRecord");
        expect(V.accept.length).toBeGreaterThan(0);
        expect(V.refuse.length).toBeGreaterThan(0);
    });

    it.each(V.accept.map((v) => [v.name, v] as const))("accept: %s", (_n, v) => {
        expect(judgeQaSetupRecord(v.record)).toEqual({ ok: true });
    });

    it.each(V.refuse.map((v) => [v.name, v] as const))("refuse: %s", (_n, v) => {
        expect(Object.values(QA_SETUP_REFUSALS)).toContain(v.code);
        expect(judgeQaSetupRecord(v.record)).toMatchObject({ ok: false, code: v.code });
    });

    it("every refusal code is reached by at least one vector", () => {
        expect(new Set(V.refuse.map((v) => v.code))).toEqual(new Set(Object.values(QA_SETUP_REFUSALS)));
    });

    it("every declared workflow has an accepting vector, and that vector is exactly its declaration", () => {
        for (const [key, d] of Object.entries(QA_WORKFLOW_SETUPS)) {
            const acc = V.accept.find((v) => v.record.workflow === key);
            expect(acc, key).toBeTruthy();
            const r = acc!.record as { personas: Array<{ key: string; roles: string[]; session: boolean }>; preview: boolean; session_verification: { kind: string } };
            expect(r.personas.map((p) => [p.key, [...p.roles].sort(), p.session])).toEqual(d.personas.map((p) => [p.key, [...p.roles].sort(), p.session]));
            expect([r.preview, r.session_verification.kind]).toEqual([d.preview, d.session_verification]);
        }
    });

    it("a setup that sends, renders a page, or adds an identity is refused before anything else is judged", () => {
        const ok = structuredClone(V.accept.find((v) => v.record.workflow === "financials_historical_draft")!.record) as Record<string, unknown> & { identities_created: string[] };
        expect(judgeQaSetupRecord({ ...ok, sends: 1, personas: [] })).toMatchObject({ code: QA_SETUP_REFUSALS.SEND });
        expect(judgeQaSetupRecord({ ...ok, session_verification: { kind: "auth_user_probe", page_renders: ["/workspace"] }, personas: [] })).toMatchObject({ code: QA_SETUP_REFUSALS.PAGE_RENDER });
        expect(judgeQaSetupRecord({ ...ok, identities_created: [...ok.identities_created, "qa_pool_09"] })).toMatchObject({ code: QA_SETUP_REFUSALS.IDENTITY });
    });
});
