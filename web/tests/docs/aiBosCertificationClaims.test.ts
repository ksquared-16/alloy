/**
 * "AI" IN A PATH DOES NOT MEAN A MODEL RAN.
 *
 * The AI/BOS certification asserts two things a reader would otherwise get wrong, and both are the kind of
 * fact that drifts silently:
 *
 *   1. Exactly TWO of the four Trust capabilities reach a model. The other two are deterministic.
 *   2. `api/admin/ai/task-assist/propose` invokes no model at all — its own output string says
 *      "Deterministic template draft (V1) — not from a live model."
 *
 * If a third capability quietly gains a provider call, or task-assist starts inferring, the certified
 * inference contract becomes false while the prose still reads correctly. `tests/trust/trustBoundary.test.ts`
 * already guards the lib/trust purity rule; this covers only what that one does not.
 *
 * Filesystem-only so it runs in CI with no database and no provider.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const WEB = join(ROOT, "web");
const CAPS = join(WEB, "lib/trust/capabilities");
const DOC = join(ROOT, "docs/platform/trust/reasoning-runtime.md");

/** Capabilities that reach the governed provider port, i.e. can cause a model call. */
const MODEL_BACKED = ["attentionSuggestionEnrichment", "participantConversationInterpretation"];

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[] = [];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const e of entries) {
        if (e === "node_modules" || e.startsWith(".")) continue;
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(full)) out.push(full);
    }
    return out;
}

function reachesProviderPort(capabilityDir: string): boolean {
    return walk(join(CAPS, capabilityDir)).some((f) => {
        const src = readFileSync(f, "utf8");
        return /governedReasoningProviderPort|ProviderAdapterV1/.test(src);
    });
}

const doc = readFileSync(DOC, "utf8");

describe("AI/BOS certification claims are bound to the implementation", () => {
    it("is not vacuous: the capability directory and the doc section exist", () => {
        const dirs = readdirSync(CAPS).filter((d) => statSync(join(CAPS, d)).isDirectory());
        expect(dirs.length).toBeGreaterThan(2);
        expect(doc).toContain("## Certification record");
    });

    it("exactly the named Trust capabilities are model-backed — no more, no fewer", () => {
        const dirs = readdirSync(CAPS).filter((d) => statSync(join(CAPS, d)).isDirectory());
        const actual = dirs.filter(reachesProviderPort).sort();
        expect(
            actual,
            "the set of model-backed Trust capabilities changed. The certified inference contract names "
                + "which capabilities can reach a provider; a new one means AI can now reason over a domain "
                + "the contract says it does not, and a removed one means the contract overstates reach.",
        ).toEqual([...MODEL_BACKED].sort());
    });

    it("task-assist proposals invoke no model, and say so in their own output", () => {
        const builder = readFileSync(
            join(WEB, "lib/agent/taskAssist/taskAssistDeterministicProposal.ts"),
            "utf8",
        );
        expect(
            /governedReasoningProviderPort|ProviderAdapterV1|api\.openai\.com|OPENAI_API_KEY/.test(builder),
            "the task-assist proposal builder gained a model call. The certification states this surface is "
                + "deterministic despite living under the AI path; if that changed, the FORBIDDEN entry "
                + "saying an AI route does not necessarily invoke a model must change with it.",
        ).toBe(false);
        expect(builder).toMatch(/not from a live model/i);
    });

    it("the provider adapter is the only place that speaks to a provider", () => {
        // One adapter is the claim. A second provider integration would make "one provider, one wire
        // protocol" false, which is the sentence a reader relies on when asking what Alloy sends where.
        const offenders = walk(join(WEB, "lib"))
            .filter((f) => {
                const src = readFileSync(f, "utf8");
                return /api\.openai\.com/.test(src);
            })
            .map((f) => f.slice(WEB.length + 1))
            .sort();
        expect(
            offenders,
            "a new module names the provider endpoint. 'One provider, one wire protocol, reached through "
                + "one adapter' is the sentence a reader relies on when asking what Alloy sends where.",
        ).toEqual([
            "lib/ai/aiEnrichmentEnv.ts",
            "lib/ai/trust/openAiCompatibleProviderAdapter.ts",
        ]);
    });

    it("the doc does not claim provider switching or local models as current", () => {
        const section = doc.slice(doc.indexOf("## Certification record"));
        // It may DENY them — that is the point — but must not assert them as capability.
        expect(section).toMatch(/not the same as multi-provider support/i);
        expect(section).toMatch(/FORBIDDEN/);
    });
});
