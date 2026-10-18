/**
 * FAMILY B — A NEWER ANSWER TO THE SAME QUESTION REPLACES THE OLDER ONE.
 *
 * A controlling question had an old answer in the form's draft; the parent answered it again,
 * differently, in the conversation. The conversation kept the new answer in the session, the draft
 * kept the old one, and review / the document / a reload / submission all read the draft.
 *
 * Regression fixture: the PUBLISHED Admissions schema (read-only; nothing here mutates it).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateFormSchema } from "@/lib/forms/schema";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { changedSessionValues, writeSettledAnswersIntoDrafts } from "@/lib/enrollment/participantRuntime/settledAnswersIntoDrafts";

const RAW = JSON.parse(readFileSync(resolve(__dirname, "../forms/__fixtures_admissions_v12_published.json"), "utf8"));
const SCHEMA = validateFormSchema(RAW);
const CUSTODY_Q = "untitled_yes_no_2"; // required, unbound, controls the custody explanation
const CUSTODY_DETAIL = "untitled_long_text_2";
const pinned = { requirement_id: "r", form_definition_id: "form-adm", form_definition_version_id: "ver-adm", session_item_id: "item-adm", schema: SCHEMA };
const needs = (sharedValues: Record<string, unknown>) =>
    projectEnrollmentInformationNeeds({ forms: [pinned], subjectId: "ava", sharedValues, confirmations: {}, canonicalValues: {} });
const needFor = (list: ReturnType<typeof needs>, fieldId: string) => list.find((n) => n.occurrences.some((o) => o.form_field_id === fieldId));

describe("the condition reads the same answer the conversation wrote", () => {
    const key = needFor(needs({}), CUSTODY_Q)!.identity.session_value_key!;

    it("the controlling question has a session key", () => {
        expect(key).toBeTruthy();
    });

    it("Yes in the conversation shows the follow-up; a newer No hides it again", () => {
        expect(needFor(needs({ [key]: true }), CUSTODY_DETAIL)).toBeTruthy();
        expect(needFor(needs({ [key]: false }), CUSTODY_DETAIL)).toBeUndefined();
    });
});

describe("what a write changed", () => {
    it("only added or replaced answers — never the ones left alone, never a removal", () => {
        expect(changedSessionValues({ a: true, b: "x", c: 1 }, { a: false, b: "x", d: "new" })).toEqual({ a: false, d: "new" });
        expect(changedSessionValues({ a: ["x"] }, { a: ["x"] })).toEqual({});
    });
});

type Row = Record<string, unknown>;
function db(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let patch: Row | null = null;
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                update: (p: Row) => { patch = p; return api; },
                then: (res: (v: unknown) => void) => {
                    const hit = rows();
                    if (patch) for (const r of hit) Object.assign(r, patch);
                    res({ data: hit, error: null });
                },
            };
            return api;
        },
    } as never;
}

describe("a newer conversation answer is written into the open drafts that ask the same question", () => {
    const sessionKey = needFor(needs({}), CUSTODY_Q)!.identity.session_value_key!;
    const tables = () => ({
        form_packet_session_items: [
            { org_id: "org", packet_session_id: "s1", form_submission_id: "draft-1" },
            { org_id: "org", packet_session_id: "s1", form_submission_id: "done-1" },
            { org_id: "org", packet_session_id: "s2", form_submission_id: "other-session" },
        ],
        form_submissions: [
            { id: "draft-1", org_id: "org", status: "draft", form_definition_id: "form-adm", form_definition_version_id: "ver-adm",
              payload: { values: { [CUSTODY_Q]: true, [CUSTODY_DETAIL]: "Weekends with dad", untitled_yes_no_8: true }, groups: {} } },
            { id: "done-1", org_id: "org", status: "submitted", form_definition_id: "form-adm", form_definition_version_id: "ver-adm",
              payload: { values: { [CUSTODY_Q]: true } } },
            { id: "other-session", org_id: "org", status: "draft", form_definition_id: "form-adm", form_definition_version_id: "ver-adm",
              payload: { values: { [CUSTODY_Q]: true } } },
        ] as Row[],
        form_definition_versions: [{ id: "ver-adm", org_id: "org", schema_json: RAW }],
    });

    it("replaces the old answer in this session's draft only — unrelated answers, submitted forms and other sessions untouched", async () => {
        const t = tables();
        const updates = await writeSettledAnswersIntoDrafts(db(t), { orgId: "org", sessionId: "s1", changed: { [sessionKey]: false } });
        expect(updates).toEqual({ "draft-1": { [CUSTODY_Q]: false } });
        const byId = (id: string) => (t.form_submissions.find((s) => s.id === id)!.payload as { values: Row }).values;
        expect(byId("draft-1")).toEqual({ [CUSTODY_Q]: false, [CUSTODY_DETAIL]: "Weekends with dad", untitled_yes_no_8: true });
        expect(byId("done-1")).toEqual({ [CUSTODY_Q]: true });
        expect(byId("other-session")).toEqual({ [CUSTODY_Q]: true });
        // The groups and everything else in the payload survive.
        expect((t.form_submissions[0]!.payload as Row).groups).toEqual({});
    });

    it("the same answer again moves nothing", async () => {
        const t = tables();
        expect(await writeSettledAnswersIntoDrafts(db(t), { orgId: "org", sessionId: "s1", changed: { [sessionKey]: true } })).toEqual({});
    });

    it("an answer for another form's question fills nothing here", async () => {
        const t = tables();
        const otherFormKey = sessionKey.replace("form-adm", "form-other");
        expect(otherFormKey).not.toBe(sessionKey);
        expect(await writeSettledAnswersIntoDrafts(db(t), { orgId: "org", sessionId: "s1", changed: { [otherFormKey]: false } })).toEqual({});
    });
});
