/**
 * Final checkpoint §2 — workflow SMS against the REAL certification database (`alloy-cert`).
 *
 * The legacy free-text actions (`create_message` / `send_message` with channel sms) are refused at the workflow
 * step and write nothing that could reach Twilio; a workflow's legitimate text goes through the canonical
 * `send_communication_template` path, which resolves a Person, carries a category and passes eligibility —
 * queued for an eligible person, blocked for an opted-out one, and never able to send marketing.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { executeWorkflowRun } from "@/lib/workflowRun";
import { canonicalSend } from "@/lib/communications/send/canonicalSend";
import { persistCommunicationPreference } from "@/lib/communications/v2/persistCommunicationPreference";
import { LEGACY_WORKFLOW_SMS_REFUSED } from "@/lib/workflows/actions/legacyWorkflowSms";
import { AUTOMATION_PURPOSE } from "@/lib/workflows/actions/executeSendCommunicationTemplateWorkflowAction";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}
const env = certEnv();
const describeLive = env ? describe : describe.skip;
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001"; // Northwind, the synthetic cert tenant
const RUN = `wfsms-${Date.now().toString(36)}`;
const SMS_TEMPLATE_KEY = `zz_${RUN}:sms`;

type Json = Record<string, unknown>;

describeLive("workflow SMS governance — live certification database", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null) as unknown as SupabaseClient;
    const ok = async <T,>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> => {
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data;
    };
    const workflowIds: string[] = [];
    const personIds: string[] = [];
    const opportunityIds: string[] = [];

    async function family(n: string): Promise<{ personId: string; opportunityId: string; phone: string }> {
        const phone = `+1555${String(Date.now()).slice(-7)}`;
        const person = (await ok(db.from("persons").insert({ org_id: ORG, first_name: "Zz", last_name: `${RUN}-${n}`, email: `qa+${RUN}-${n}@example.invalid`, phone }).select("id").single())) as { id: string };
        const opp = (await ok(db.from("opportunities").insert({ org_id: ORG, name: `ZZ ${RUN} ${n}`, primary_person_id: person.id, status_key: "open", stage_key: "lead" }).select("id").single())) as { id: string };
        personIds.push(person.id);
        opportunityIds.push(opp.id);
        return { personId: person.id, opportunityId: opp.id, phone };
    }
    async function workflow(actions: Array<{ action_type: string; payload: Json }>): Promise<string> {
        const wf = (await ok(db.from("workflows").insert({ org_id: ORG, name: `ZZ ${RUN} ${randomUUID().slice(0, 6)}`, event_type: `zz_${RUN}`, entity_type: "opportunities", enabled: true }).select("id").single())) as { id: string };
        workflowIds.push(wf.id);
        await ok(db.from("workflow_actions").insert(actions.map((a, i) => ({ workflow_id: wf.id, org_id: ORG, action_order: i + 1, action_type: a.action_type, target_entity: null, payload: a.payload }))));
        return wf.id;
    }
    async function run(workflowId: string, f: { personId: string; opportunityId: string; phone: string }) {
        await executeWorkflowRun(db, workflowId, {
            event_type: `zz_${RUN}`,
            org_id: ORG,
            lead_id: f.opportunityId,
            opportunity: { id: f.opportunityId },
            person: { id: f.personId, phone: f.phone },
            contact: { phone: f.phone },
        });
        const runs = (await ok(db.from("workflow_runs").select("id").eq("workflow_id", workflowId))) as Array<{ id: string }>;
        expect(runs).toHaveLength(1);
        const actionRuns = (await ok(db.from("workflow_action_runs").select("action_type, status, meta, outputs").eq("workflow_run_id", runs[0]!.id).order("started_at"))) as Array<{ action_type: string; status: string; meta: Json | null; outputs: Json | null }>;
        return { runId: runs[0]!.id, actionRuns };
    }

    let templateId = "";
    beforeAll(async () => {
        // A Template Library SMS that renders against a lead (no tour tokens).
        const tpl = (await ok(db.from("communication_templates").insert({ org_id: ORG, name: `ZZ ${RUN} welcome`, channel: "sms", category: "general", approval_status: "approved", status: "active", system_key: SMS_TEMPLATE_KEY }).select("id").single())) as { id: string };
        templateId = tpl.id;
        const v = (await ok(db.from("communication_template_versions").insert({ org_id: ORG, template_id: tpl.id, version: 1, version_number: 1, body: `ZZ ${RUN} Thanks for your interest — we'll be in touch.`, body_format: "text" }).select("id").single())) as { id: string };
        await ok(db.from("communication_templates").update({ current_version_id: v.id }).eq("id", tpl.id));
    });

    afterAll(async () => {
        if (!env) return;
        if (templateId) await db.from("communication_templates").update({ status: "archived" }).eq("id", templateId);
        for (const id of workflowIds) {
            await db.from("workflows").update({ enabled: false }).eq("id", id);
            await db.from("workflow_action_runs").delete().eq("workflow_id", id);
            await db.from("workflow_runs").delete().eq("workflow_id", id);
            await db.from("workflow_actions").delete().eq("workflow_id", id);
            await db.from("workflows").delete().eq("id", id);
        }
    });

    it("legacy create_message / send_message SMS are refused at the step and write nothing that could be sent", async () => {
        const f = await family("legacy");
        const wf = await workflow([
            { action_type: "create_message", payload: { channel: "sms", to_value: "{{person.phone}}", body: `ZZ ${RUN} legacy create` } },
            { action_type: "send_message", payload: { channel: "sms", template: `ZZ ${RUN} legacy send`, recipients: [{ source: "payload", path: "contact.phone" }] } },
            { action_type: "log", payload: { message: `ZZ ${RUN} the rest of the workflow still runs` } },
        ]);
        const { runId, actionRuns } = await run(wf, f);
        const byType = Object.fromEntries(actionRuns.map((a) => [a.action_type, a]));
        for (const t of ["create_message", "send_message"]) {
            expect(byType[t]).toMatchObject({ status: "skipped" });
            expect(String(byType[t]!.meta?.reason)).toBe(LEGACY_WORKFLOW_SMS_REFUSED);
        }
        expect(byType.log!.status).toBe("completed");
        expect((await ok(db.from("messages").select("id").eq("workflow_run_id", runId))) as Json[]).toEqual([]);
        expect((await ok(db.from("communication_messages").select("id").eq("workflow_run_id", runId))) as Json[]).toEqual([]);
    });

    it("a workflow's text through send_communication_template: a resolved Person, a category, eligibility — queued", async () => {
        const f = await family("canonical");
        const wf = await workflow([{ action_type: "send_communication_template", payload: { system_key: SMS_TEMPLATE_KEY, channel: "sms" } }]);
        const { actionRuns } = await run(wf, f);
        expect(actionRuns[0]).toMatchObject({ action_type: "send_communication_template", status: "completed" });
        const id = String(actionRuns[0]!.outputs?.communication_message_id ?? "");
        const row = (await ok(db.from("communication_messages").select("status, category, audience, purpose, to_address, eligibility_snapshot").eq("id", id).single())) as Json;
        expect(row).toMatchObject({ status: "queued", category: "operational", audience: "external", purpose: AUTOMATION_PURPOSE, to_address: f.phone });
        expect(row.eligibility_snapshot).toBeTruthy();
    });

    it("the same send to a person who opted out of routine texts is blocked, and nothing deliverable exists", async () => {
        const f = await family("optedout");
        const p = await persistCommunicationPreference(db, { orgId: ORG, personId: f.personId, category: "sms_operational", fromState: null, toState: "opted_out", source: "sms_keyword", method: "STOP" });
        expect(p.ok).toBe(true);
        const wf = await workflow([{ action_type: "send_communication_template", payload: { system_key: SMS_TEMPLATE_KEY, channel: "sms" } }]);
        const { actionRuns } = await run(wf, f);
        expect(actionRuns[0]).toMatchObject({ status: "skipped" });
        expect(String(actionRuns[0]!.meta?.reason)).toMatch(/^send_blocked:eligibility_blocked:OPTED_OUT/);
        const rows = (await ok(db.from("communication_messages").select("status, error").eq("org_id", ORG).eq("to_address", f.phone))) as Array<{ status: string; error: string | null }>;
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows.every((r) => r.status === "blocked" && r.error === "policy:OPTED_OUT")).toBe(true);
    });

    it("an automation cannot send marketing: missing consent is never supplied by a category choice", async () => {
        const f = await family("marketing");
        const send = await canonicalSend({
            supabase: db,
            orgId: ORG,
            authorizingUserId: null,
            sourceCapability: "workflows.automation",
            recipient: { kind: "person", personId: f.personId },
            audience: "external",
            category: "marketing",
            purpose: AUTOMATION_PURPOSE,
            channel: "sms",
            primaryEntityType: "persons",
            primaryEntityId: f.personId,
            bodyRaw: `ZZ ${RUN} marketing`,
            userAuthored: false,
            idempotencyKey: `zz:${RUN}:marketing`,
        });
        // Refused before eligibility is even consulted: the automation purpose admits only operational /
        // transactional, so no workflow can reach a marketing send by choosing the category.
        expect(send.outcome).toBe("invalid");
        expect(`${send.reason} ${send.message}`).toMatch(/categor/i);
        expect((await ok(db.from("communication_messages").select("status").eq("org_id", ORG).eq("to_address", f.phone).neq("status", "blocked"))) as Json[]).toEqual([]);
    });
});
