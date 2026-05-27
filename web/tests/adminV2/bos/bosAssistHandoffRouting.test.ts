import { describe, expect, it } from "vitest";

import {
    buildBosAssistHandoffPackage,
    buildBosAssistHandoffSeedCommand,
    buildOverviewDataForBosHandoff,
    resolveBosAssistHandoffMode,
} from "@/lib/adminV2/bos/bosAssistHandoffRouting";
import {
    queueBosHandoffPreviewFromOperationalRead,
    BOS_ASSIST_CTA_DRAWER,
} from "@/lib/adminV2/bos/bosDrawerAssistHandoff";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";
import { parseTaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import { formatOrchestratorHandoffSeedFromCopy } from "@/lib/adminV2/bos/operationalRecommendationHandoff";
import { getRecommendationHandoff } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { reminderClarificationKind } from "@/lib/agent/taskAssist/taskAssistClarification";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("resolveBosAssistHandoffMode", () => {
    it("routes stale new inquiry to message draft assist", () => {
        const rec = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({
                catalog_key: "stale_new_inquiry",
            })
        );
        expect(
            resolveBosAssistHandoffMode({
                overviewData: { _operational_recommendation: rec },
            })
        ).toBe("draft_message");
    });

    it("routes follow-up overdue to message draft, not reminder-only", () => {
        const rec = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({
                catalog_key: "follow_up_date_passed",
                primary_label: "Follow-up commitment is overdue",
                template_values: {
                    primary_label: "Follow-up commitment is overdue",
                    timing_phrase: "Follow-up date was May 1",
                    sla_tier: "breached",
                },
                raw_signals: [
                    {
                        code: "primary_attention_reason",
                        label: "Follow-up commitment is overdue",
                        source_type: "attention_resolver",
                        provenance: "opportunity_attention_resolver.v2",
                        sla_tier: "breached",
                        priority: 0,
                    },
                    {
                        code: "sla_breached",
                        label: "SLA breached",
                        source_type: "attention_resolver",
                        provenance: "attention_sla",
                        sla_tier: "breached",
                        priority: 1,
                    },
                ],
                stale_inputs: {
                    status_key: "contacted",
                    primary_reason_code: "follow_up_date_passed",
                    reason_codes_sorted: ["follow_up_date_passed"],
                    waiting_bucket: "none",
                    waiting_since_iso: null,
                    resolver_version: 2,
                    attention_computed_at_iso: "2026-05-20T12:00:00.000Z",
                    activity_signal_key: null,
                },
            })
        );
        expect(
            resolveBosAssistHandoffMode({
                overviewData: { _operational_recommendation: rec },
            })
        ).toBe("draft_message");
    });

    it("routes reminder-only catalog actions to create_reminder", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        rec.available_actions = [
            { key: "set_reminder", label: "Set reminder", kind: "task_assist_intent", intent: "create_reminder" },
        ];
        rec.recommended_action = {
            key: "set_reminder",
            label: "Set a reminder to follow up",
            action_family: "follow_up",
        };
        expect(
            resolveBosAssistHandoffMode({
                overviewData: { _operational_recommendation: rec },
            })
        ).toBe("create_reminder");
    });
});

describe("buildBosAssistHandoffPackage", () => {
    it("stale new inquiry seed avoids reminder clarification on submit", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const pkg = buildBosAssistHandoffPackage({
            entityLabel: "Sarah Chen",
            overviewData: { _operational_recommendation: rec },
        });
        expect(pkg.assistMode).toBe("draft_message");
        expect(pkg.seedCommand.toLowerCase()).toMatch(/^draft a message/);
        expect(pkg.taskAssistIntent?.intent_type).toBe("draft_message");
        expect(pkg.taskAssistIntent?.message_goal_text).toBe("Initial outreach");
        expect(pkg.taskAssistBootstrap?.synthesized_draft?.body).toBeTruthy();
        expect(pkg.taskAssistBootstrap?.synthesized_draft?.body).not.toContain("warm first response");
        expect(reminderClarificationKind(pkg.taskAssistIntent)).toBeNull();

        const legacyHandoff = getRecommendationHandoff({ _operational_recommendation: rec });
        const legacySeed = formatOrchestratorHandoffSeedFromCopy("Sarah Chen", legacyHandoff!);
        const legacyParsed = parseTaskAssistCommandIntent(legacySeed);
        expect(legacyParsed.intent_type).toBe("create_reminder");
    });

    it("reminder assist mode surfaces reminder-when clarification only for reminders", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        rec.available_actions = [
            { key: "set_reminder", label: "Set reminder", kind: "task_assist_intent", intent: "create_reminder" },
        ];
        rec.recommended_action = {
            key: "set_reminder",
            label: "Set a reminder to check back",
            action_family: "follow_up",
        };
        const pkg = buildBosAssistHandoffPackage({
            entityLabel: "Patel household",
            overviewData: { _operational_recommendation: rec },
        });
        expect(pkg.assistMode).toBe("create_reminder");
        expect(reminderClarificationKind(pkg.taskAssistIntent)).toBe("reminder_when");
    });

    it("includes preferred next action from recommendation", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const pkg = buildBosAssistHandoffPackage({
            entityLabel: "Chen household",
            overviewData: { _operational_recommendation: rec },
        });
        expect(pkg.preferredNextAction).toContain("warm first response");
        expect(pkg.copy.whyNow.length).toBeGreaterThan(0);
    });
});

describe("queue BOS handoff preview", () => {
    it("builds draft assist from queue operational read without full recommendation", () => {
        const pkg = buildBosAssistHandoffPackage({
            entityLabel: "Chen household",
            overviewData: buildOverviewDataForBosHandoff({
                entityId: "opp-1",
                entityLabel: "Chen household",
                queuePreview: {
                    doNext: "Send a warm first response and confirm next step",
                    whyNow: "24 days since the inquiry was created",
                },
            }),
        });
        expect(pkg.assistMode).toBe("draft_message");
        expect(pkg.seedCommand).toMatch(/^Draft a message/);
        expect(pkg.seedCommand).toContain("24 days");
        expect(pkg.taskAssistIntent?.intent_type).toBe("draft_message");
    });

    it("queue preview helper maps operational read slot", () => {
        const preview = queueBosHandoffPreviewFromOperationalRead({
            operationalRead: "Complete the overdue follow-up",
            whyNow: "Commitment date passed",
            urgencyChipLabel: "Today",
            urgencyBand: "p1_today",
            typeCue: null,
            staleCue: null,
            previewBoundary: "Preview",
            source: "canonical_queue_preview",
            priorityExplanation: null,
        });
        expect(preview?.doNext).toContain("overdue follow-up");
    });
});

describe("BOS assist CTA placement", () => {
    it("uses Work with BOS label and compact button inside Review Assist", () => {
        expect(BOS_ASSIST_CTA_DRAWER).toBe("Work with BOS");
        const cta = readFileSync(join(webRoot, "components/admin/drawer/BosDrawerAssistCta.tsx"), "utf8");
        expect(cta).toContain("OpportunityDrawerHeaderActionButton");
        expect(cta).not.toContain("OPPORTUNITY_DRAWER_SECTION_SECONDARY_BUTTON_CLASS");
        expect(cta).toContain('data-bos-assist-button="true"');
        const strip = readFileSync(
            join(webRoot, "components/admin/drawer/OperationalAttentionHeaderStrip.tsx"),
            "utf8"
        );
        expect(strip).toContain("BosDrawerAssistCta");
    });

    it("handoff passes taskAssistHandoffIntent through focus detail", () => {
        const handoff = readFileSync(join(webRoot, "lib/adminV2/bos/bosDrawerAssistHandoff.ts"), "utf8");
        expect(handoff).toContain("taskAssistHandoffIntent");
        expect(handoff).toContain("buildBosAssistHandoffPackage");
        const shell = readFileSync(
            join(webRoot, "app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"),
            "utf8"
        );
        expect(shell).toContain("runBosAssistHandoffRef");
        expect(shell).toContain("detail.taskAssistHandoffIntent");
    });
});

describe("buildBosAssistHandoffSeedCommand", () => {
    it("draft seed starts with Draft a message for NL fallback safety", () => {
        const seed = buildBosAssistHandoffSeedCommand({
            mode: "draft_message",
            entityLabel: "Lee family",
            copy: {
                eyebrow: "Review assist",
                operationalRead: "New inquiry needs response",
                whyNow: "24 days since inquiry",
                doNext: "Send a warm first response",
                contextLine: "Active record",
                ctaLabel: "Continue",
            },
        });
        expect(seed).toMatch(/^Draft a message to Lee family/);
        expect(parseTaskAssistCommandIntent(seed).intent_type).toBe("draft_message");
    });
});
