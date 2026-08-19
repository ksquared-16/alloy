/**
 * Replay the historical inbound Email corpus through the real ingress gate.
 *
 * READ-ONLY against canonical data. This script loads a JSON snapshot of the corpus and
 * of the tables the eligibility loader reads, drives the REAL loader and the REAL gate
 * over an in-memory PostgREST-shaped adapter, and writes two artefacts:
 *
 *   report.json   the matrix, the per-message decisions, and the audit sample
 *   observations.sql   INSERTs tagged `evaluation_mode = 'historical_replay'`
 *
 * It never opens a database connection itself. Producing the snapshot and applying the
 * SQL are separate, reviewable steps — which is the point: a backtest that could write to
 * canonical tables is one edit away from being a reprocessor.
 *
 * The adapter matters. Re-implementing the relationship rules in SQL would have been
 * shorter and would have measured a DIFFERENT policy than the one that runs in
 * production. Everything here goes through `loadIngressIdentities`,
 * `loadSenderRelationships`, `resolveWatchedRelationshipKinds` and
 * `evaluateEmailIngressEligibility` unmodified.
 *
 * Usage:  npx tsx scripts/emailIngressBacktest.ts <snapshotDir>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { correlationCandidates } from "@/lib/communications/email/emailMessageId";
import {
    EMAIL_INGRESS_POLICY_VERSION,
    type EmailIngressPolicy,
} from "@/lib/communications/ingress/emailIngressEligibility";
import {
    loadIngressIdentities,
    loadSenderRelationships,
    resolveWatchedRelationshipKinds,
    unsupportedWatchedKinds,
    projectObservationRow,
} from "@/lib/communications/ingress/observeEmailIngressEligibility";
import {
    backtestMessage,
    selectAuditSample,
    summarizeBacktest,
    type BacktestOutcome,
    type HistoricalInboundEmail,
} from "@/lib/communications/ingress/historicalEmailIngressBacktest";

type Row = Record<string, unknown>;
type Snapshot = Record<string, Row[]>;

/** The subset of the PostgREST builder the loader actually uses. Nothing more. */
function snapshotClient(tables: Snapshot): SupabaseClient {
    return {
        from(table: string) {
            const rows = tables[table] ?? [];
            const filters: Array<(r: Row) => boolean> = [];
            const apply = () => rows.filter((r) => filters.every((f) => f(r)));
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq(col: string, val: unknown) {
                    filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
                    return builder;
                },
                in(col: string, vals: unknown[]) {
                    filters.push((r) => vals.map(String).includes(String(r[col] ?? "")));
                    return builder;
                },
                ilike(col: string, val: string) {
                    filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase());
                    return builder;
                },
                limit: () => builder,
                maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
                then: (f: (v: unknown) => unknown) => Promise.resolve({ data: apply(), error: null }).then(f),
            };
            return builder;
        },
    } as unknown as SupabaseClient;
}

async function main() {
    const dir = process.argv[2];
    if (!dir) throw new Error("usage: emailIngressBacktest.ts <snapshotDir>");
    const snapshot = JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8")) as Snapshot;
    const deps = { supabase: snapshotClient(snapshot), now: () => new Date().toISOString() };

    // Org-scoped resolution of Alloy-minted ids, mirroring `threadsForAlloyMessageIds`.
    const threadByMessageId = new Map<string, { orgId: string; threadId: string | null }>();
    for (const row of snapshot.message_index ?? []) {
        threadByMessageId.set(String(row.id), {
            orgId: String(row.org_id),
            threadId: row.thread_id ? String(row.thread_id) : null,
        });
    }
    const resolveAlloyThread = (orgId: string, inReplyTo: string | null, references: string | null) => {
        for (const candidate of correlationCandidates({ inReplyTo, references })) {
            const hit = threadByMessageId.get(candidate);
            if (hit && hit.orgId === orgId && hit.threadId) return hit.threadId;
        }
        return null;
    };

    const corpus: HistoricalInboundEmail[] = (snapshot.messages ?? []).map((m) => ({
        messageId: String(m.id),
        orgId: String(m.org_id),
        provider: String(m.provider ?? "resend"),
        providerMessageId: String(m.provider_message_id ?? ""),
        canonicalThreadId: m.thread_id ? String(m.thread_id) : null,
        fromAddress: String(m.from_address ?? ""),
        toAddress: String(m.to_address ?? ""),
        subject: m.subject ? String(m.subject) : null,
        emailMessageId: m.email_message_id ? String(m.email_message_id) : null,
        emailInReplyTo: m.email_in_reply_to ? String(m.email_in_reply_to) : null,
        emailReferences: m.email_references ? String(m.email_references) : null,
        attachmentCount: Number(m.attachment_count ?? 0),
        resolvedAlloyThreadId: resolveAlloyThread(
            String(m.org_id),
            m.email_in_reply_to ? String(m.email_in_reply_to) : null,
            m.email_references ? String(m.email_references) : null
        ),
        canonicalThreadMessageCount: Number(m.thread_message_count ?? 0),
        canonicalThreadOutboundCount: Number(m.thread_outbound_count ?? 0),
        inboundResolution: m.inbound_resolution ? String(m.inbound_resolution) : null,
        correlationMethod: m.correlation_method ? String(m.correlation_method) : null,
        receivedAt: m.created_at ? String(m.created_at) : null,
    }));

    // Per-org policy and per-sender relationships, loaded once each and reused — the
    // loader is deterministic, so caching cannot change an outcome, and 65 messages over
    // 33 senders would otherwise re-derive the same relationships repeatedly.
    const orgIds = [...new Set(corpus.map((m) => m.orgId))];
    const policyByOrg = new Map<string, EmailIngressPolicy>();
    const bindingIdByAddressByOrg = new Map<string, Map<string, string>>();
    for (const orgId of orgIds) {
        const [{ identities, bindingIdByAddress }, watchedRelationshipKinds] = await Promise.all([
            loadIngressIdentities(deps, orgId),
            resolveWatchedRelationshipKinds(deps, orgId),
        ]);
        policyByOrg.set(orgId, { orgId, identities, watchedRelationshipKinds });
        bindingIdByAddressByOrg.set(orgId, bindingIdByAddress);
    }

    const relationshipCache = new Map<string, Awaited<ReturnType<typeof loadSenderRelationships>>>();
    const relationshipsFor = async (orgId: string, sender: string) => {
        const key = `${orgId}|${sender.toLowerCase()}`;
        if (!relationshipCache.has(key)) {
            relationshipCache.set(key, await loadSenderRelationships(deps, orgId, sender));
        }
        return relationshipCache.get(key)!;
    };

    const run = async (counterfactualAuthenticated: boolean): Promise<BacktestOutcome[]> => {
        const out: BacktestOutcome[] = [];
        for (const message of corpus) {
            const policy = policyByOrg.get(message.orgId)!;
            const senderRelationships = await relationshipsFor(message.orgId, message.fromAddress);
            out.push(backtestMessage({ message, policy, senderRelationships, counterfactualAuthenticated }));
        }
        return out;
    };

    const actual = await run(false);
    const counterfactual = await run(true);

    const evaluatedAt = new Date().toISOString();
    const observations = actual
        .filter((o) => o.error === null)
        .map((o) => {
            const policy = policyByOrg.get(o.message.orgId)!;
            const bindingId = o.decision.identity
                ? (bindingIdByAddressByOrg.get(o.message.orgId)?.get(o.decision.identity.address) ?? null)
                : null;
            return projectObservationRow({
                input: {
                    orgId: o.message.orgId,
                    provider: o.message.provider,
                    providerMessageId: o.message.providerMessageId,
                    envelope: { recipients: [o.message.toAddress], sender: o.message.fromAddress },
                    resolvedAlloyThreadId: o.message.resolvedAlloyThreadId,
                },
                decision: o.decision,
                bindingId,
                unsupportedKinds: unsupportedWatchedKinds(policy.watchedRelationshipKinds),
                evaluationMode: "historical_replay",
                evaluatedAt,
            });
        });

    const lit = (v: unknown) =>
        v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
    const sql = observations
        .map(
            (r) =>
                `insert into public.communication_ingress_eligibility_observations ` +
                `(org_id, provider, channel, provider_message_id, decision, lane, reason_code, confidence_basis, ` +
                `matched_relationship_type, matched_identity_id, matched_thread_id, intake_purpose_key, ` +
                `sender_assertion, unsupported_watch_kinds, evaluation_mode, evaluated_at, policy_version) values (` +
                [
                    lit(r.org_id),
                    lit(r.provider),
                    lit(r.channel),
                    lit(r.provider_message_id),
                    lit(r.decision),
                    lit(r.lane),
                    lit(r.reason_code),
                    lit(r.confidence_basis),
                    lit(r.matched_relationship_type),
                    r.matched_identity_id ? `${lit(r.matched_identity_id)}::uuid` : "null",
                    r.matched_thread_id ? `${lit(r.matched_thread_id)}::uuid` : "null",
                    lit(r.intake_purpose_key),
                    lit(r.sender_assertion),
                    `'{${r.unsupported_watch_kinds.join(",")}}'`,
                    lit(r.evaluation_mode),
                    lit(r.evaluated_at),
                    lit(r.policy_version),
                ].join(", ") +
                `) on conflict do nothing;`
        )
        .join("\n");

    const detail = (outcomes: BacktestOutcome[]) =>
        outcomes.map((o) => ({
            messageId: o.message.messageId,
            orgId: o.message.orgId,
            providerMessageId: o.message.providerMessageId,
            disposition: o.error ? "GATE_ERROR" : o.decision.disposition,
            lane: o.error ? null : o.decision.lane,
            reasonCode: o.error ? null : o.decision.reasonCode,
            matchedThreadId: o.error ? null : o.decision.matchedThreadId,
            matchedRelationshipType:
                o.error || o.decision.senderAssertion.kind === "unknown"
                    ? null
                    : o.decision.senderAssertion.relationship.kind,
            senderAssertion: o.error ? null : o.decision.senderAssertion.kind,
            recipientIdentity: o.error ? null : (o.decision.identity?.address ?? null),
            recipientRole: o.error ? null : (o.decision.identity?.role ?? null),
            canonicalThreadId: o.message.canonicalThreadId,
            canonicalThreadMessageCount: o.message.canonicalThreadMessageCount,
            canonicalThreadOutboundCount: o.message.canonicalThreadOutboundCount,
            canonicalInboundResolution: o.message.inboundResolution,
            canonicalCorrelationMethod: o.message.correlationMethod,
            attachmentCount: o.message.attachmentCount,
            error: o.error,
            evaluationMode: "historical_replay",
            policyVersion: EMAIL_INGRESS_POLICY_VERSION,
        }));

    const report = {
        generatedAt: evaluatedAt,
        policyVersion: EMAIL_INGRESS_POLICY_VERSION,
        evaluationMode: "historical_replay",
        corpusSize: corpus.length,
        identitiesByOrg: Object.fromEntries(
            [...policyByOrg].map(([org, p]) => [
                org,
                {
                    identities: p.identities.map((i) => ({ address: i.address, role: i.role, purpose: i.intakePurposeKey ?? null })),
                    watchedRelationshipKinds: p.watchedRelationshipKinds,
                    unsupportedWatchedKinds: unsupportedWatchedKinds(p.watchedRelationshipKinds),
                },
            ])
        ),
        matrixActual: summarizeBacktest(actual),
        matrixCounterfactualAuthenticated: summarizeBacktest(counterfactual),
        auditSample: selectAuditSample(actual).map((o) => ({
            auditReason: o.auditReason,
            ...detail([o])[0]!,
        })),
        decisions: detail(actual),
    };

    writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 2));
    writeFileSync(join(dir, "observations.sql"), `${sql}\n`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ matrixActual: report.matrixActual, matrixCounterfactualAuthenticated: report.matrixCounterfactualAuthenticated, observationsWritten: observations.length }, null, 2));
}

void main();
