/**
 * B2 — Participant Runtime provider authorization reads the canonical AI-policy owner.
 *
 * V1.1 shipped this gate reading `metadata` off the `orgs` row. AI policy lives in
 * `org_settings.metadata.ai_policy`, and the hosted `orgs` table has no `metadata` column at all, so
 * the query errored, the fail-closed branch swallowed it, and the answer was `false` for every org
 * on every request. The provider path was unreachable no matter what an org had enabled.
 *
 * These controls exist because the defect was invisible from the outside: a gate that fails closed
 * makes "read the wrong table" and "the feature was never granted" produce byte-identical behaviour.
 * So they assert the READ as well as the answer — which table was queried, on which key — not only
 * that a denial happened.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    PARTICIPANT_CONVERSATION_AI_FEATURE,
    participantProviderReasoningPermitted,
} from "@/lib/enrollment/participantRuntime/participantProviderAuthorization";
import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import { interpretParticipantResponseViaTrust } from "@/lib/trust/consumers/participantConversationInterpretation";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

const ORG = "11111111-1111-4111-8111-111111111111";

type Query = { table: string; column: string; value: string };

/**
 * Records every read so a control can assert the OWNER, not just the outcome.
 *
 * `rows` is keyed by table. A table absent from it answers the way PostgREST answers a table that
 * has no matching row — `{ data: null, error: null }` — which is exactly the "missing org_settings
 * row" case, and is deliberately NOT the same as an error.
 */
function supabaseStub(rows: Record<string, unknown>, opts: { error?: string } = {}) {
    const queries: Query[] = [];
    const client = {
        from(table: string) {
            const q: Query = { table, column: "", value: "" };
            const builder = {
                select() {
                    return builder;
                },
                eq(column: string, value: string) {
                    q.column = column;
                    q.value = value;
                    return builder;
                },
                async maybeSingle() {
                    queries.push(q);
                    if (opts.error) return { data: null, error: { message: opts.error } };
                    return { data: (rows as Record<string, unknown>)[table] ?? null, error: null };
                },
            };
            return builder;
        },
    };
    return { client: client as never, queries };
}

function orgSettings(policy: Record<string, unknown> | null) {
    return { org_settings: { metadata: policy ? { ai_policy: policy } : {} } };
}

const PERMITTED_POLICY = {
    enabled: true,
    provider: "openai",
    pii_mode: "strict",
    logging_mode: "minimal",
    retention_mode: "none",
    allowed_features: ["draft_enrichment", PARTICIPANT_CONVERSATION_AI_FEATURE],
};

describe("B2 — participant provider authorization reads org_settings", () => {
    it("1. permits when the policy is enabled and the feature is allowed", async () => {
        const { client, queries } = supabaseStub(orgSettings(PERMITTED_POLICY));

        expect(await participantProviderReasoningPermitted(client, ORG)).toBe(true);

        // The permit is only meaningful if it came from the canonical owner. A gate that answered
        // `true` off the wrong table would be the same defect pointing the other way.
        expect(queries).toEqual([{ table: "org_settings", column: "org_id", value: ORG }]);
    });

    it("2. refuses when the feature is absent from an otherwise enabled policy", async () => {
        const { client } = supabaseStub(
            orgSettings({
                ...PERMITTED_POLICY,
                // Firefly's actual hosted policy: enabled, openai, five features, not this one.
                allowed_features: [
                    "draft_enrichment",
                    "operational_summary",
                    "reasoning_paraphrase",
                    "task_assist_draft",
                    "workflow_assist_draft",
                ],
            }),
        );

        expect(await participantProviderReasoningPermitted(client, ORG)).toBe(false);
    });

    it("3. refuses when AI is disabled, even with the feature listed", async () => {
        const { client } = supabaseStub(orgSettings({ ...PERMITTED_POLICY, enabled: false }));

        expect(await participantProviderReasoningPermitted(client, ORG)).toBe(false);
    });

    it("4. refuses a provider this runtime cannot execute through", async () => {
        for (const provider of ["stub", "anthropic", "azure_openai", "acme_reasoning", "disabled"]) {
            const { client } = supabaseStub(orgSettings({ ...PERMITTED_POLICY, provider }));
            expect(
                await participantProviderReasoningPermitted(client, ORG),
                `provider ${provider} must not permit participant reasoning`,
            ).toBe(false);
        }
    });

    it("5. fails closed when the org has no org_settings row, and when the read errors", async () => {
        const missing = supabaseStub({});
        expect(await participantProviderReasoningPermitted(missing.client, ORG)).toBe(false);
        // Still asked the right question — a false from a table that was never queried would pass
        // this assertion for the wrong reason.
        expect(missing.queries).toEqual([{ table: "org_settings", column: "org_id", value: ORG }]);

        const errored = supabaseStub(orgSettings(PERMITTED_POLICY), { error: "42703" });
        expect(await participantProviderReasoningPermitted(errored.client, ORG)).toBe(false);

        const thrower = {
            from() {
                throw new Error("connection reset");
            },
        } as never;
        expect(await participantProviderReasoningPermitted(thrower, ORG)).toBe(false);
    });

    it("6. the module reads no AI policy from `orgs`", () => {
        const path = join(
            process.cwd(),
            "lib/enrollment/participantRuntime/participantProviderAuthorization.ts",
        );
        const raw = readFileSync(path, "utf8");

        // Comments are stripped first. This module's own documentation names the defect it fixed —
        // including the wrong table — and a blunt substring scan over raw source would fail on the
        // sentence explaining why the table is wrong.
        const code = raw
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:])\/\/.*$/gm, "$1");

        expect(code).toContain('.from("org_settings")');
        expect(code).toContain('.eq("org_id"');
        expect(code).not.toContain('from("orgs")');
        expect(code).not.toContain("orgs.metadata");
        // No compatibility read either: one owner means one query on this path.
        expect(code.match(/\.from\(/g) ?? []).toHaveLength(1);
    });
});

describe("B2 — denial keeps Enrollment deterministic rather than blocking it", () => {
    const turn: ParticipantTurn = {
        kind: "confirm_known_value",
        need: {
            identity: {
                key: "child:c1:customer_member:dob",
                canonical_key: "customer_member:dob",
                shared_value_key: "customer_member:dob",
                field_key: "dob",
                entity_type: "customer_member",
                basis: "canonical",
                scope: "child",
                subject_id: "c1",
                artifact_specific: false,
            },
            occurrences: [{ label: "Date of Birth", form_field_id: "dob_1" }],
            occurrence_count: 1,
            state: "known_requires_confirmation",
            current_value: "2021-05-04",
            requires_participant_action: true,
        },
        prompt: "We have Date of Birth as 2021-05-04. Is that correct?",
        proposed_value: "2021-05-04",
        resolves_occurrences: 1,
    } as never as ParticipantTurn;

    it("7. a denied provider still lets the participant answer, and reaches no repository", async () => {
        // The deterministic interpreter is not policy-aware at all — that independence is the
        // guarantee. An unambiguous "yes" resolves whether or not a model was ever permitted.
        expect(interpretParticipantResponseDeterministically({ turn, text: "yes" })).toEqual({
            kind: "confirmed",
        });

        // And the governed consumer, told it is not permitted, returns before touching persistence.
        // The repository throws on any access, so a decision that "just did not persist" cannot pass.
        const repository = new Proxy(
            {},
            {
                get() {
                    throw new Error("repository must not be reached when reasoning is denied");
                },
            },
        ) as never;

        const outcome = await interpretParticipantResponseViaTrust({
            org_id: ORG,
            turn,
            response_text: "she was born the fourth of may twenty twenty one",
            field: null,
            correlation_id: "participant-turn:test",
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "participant",
            provider_reasoning_permitted: false,
            nowIso: "2026-08-17T00:00:00.000Z",
            repository,
        });

        expect(outcome.candidate).toBeNull();
        expect(outcome.decision_package).toBeNull();
        expect(outcome.skipped_reason).toBeTruthy();
    });
});
