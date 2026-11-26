/**
 * Optional stub overlay on a deterministic Operational Summary.
 *
 * This is the only AI-policy-coupled part of the former
 * `lib/ai/buildOperationalSummary.ts`: it is gated by `ai_policy` and the stub
 * env flag. The deterministic builder and the queue preview moved to
 * `lib/operationalSummary/buildOperationalSummary.ts`.
 */

import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import type {
    OperationalSummaryGenerationMode,
    OperationalSummarySourceKind,
    OperationalSummaryV1,
} from "@/lib/operationalSummary/operationalSummaryContracts";
import { isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import { clip, compactBullets, MAX_BULLET, MAX_BULLETS } from "@/lib/operationalSummary/buildOperationalSummary";
import { redactObjectForAi } from "@/lib/privacy/redactObject";

/**
 * Optional stub overlay: synthetic bullet + redaction metadata on template text only (no record bodies).
 * Gated by {@link isAiEnrichmentStubEnvEnabled} and org policy (`operational_summary` feature, stub provider).
 */
export function applyStubOperationalSummaryOverlay(
    base: OperationalSummaryV1,
    policy: ResolvedAiOrgPolicyV1,
): OperationalSummaryV1 {
    if (!isAiEnrichmentStubEnvEnabled()) return base;
    if (!policy.enabled || policy.provider !== "stub") return base;
    if (!policy.allowed_features.includes("operational_summary")) return base;

    const template = {
        stub_line:
            "Stub overlay: narrative tone polish is reserved for a future approved model — resolver output stays authoritative.",
    };
    const { redacted, steps } = redactObjectForAi(template, { pii_mode: policy.pii_mode });
    const stubBullet = clip(String(redacted.stub_line ?? template.stub_line), MAX_BULLET);
    const kinds = [...new Set(steps.map((s) => s.kind))];
    const roomForStub = Math.max(0, MAX_BULLETS - 1);
    const trimmedBase = base.bullets.slice(0, roomForStub);
    const nextBullets = compactBullets([...trimmedBase, stubBullet]);

    return {
        ...base,
        bullets: nextBullets,
        generation_mode: "deterministic_plus_stub_overlay" satisfies OperationalSummaryGenerationMode,
        source: {
            ...base.source,
            kind: "deterministic_aggregate_stub_overlay" satisfies OperationalSummarySourceKind,
        },
        redaction: { steps_total: steps.length, kinds },
    };
}
