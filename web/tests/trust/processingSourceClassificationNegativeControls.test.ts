/**
 * Phase 1.1 negative controls.
 *
 * Every assertion in the adoption suite is worth exactly as much as the proof
 * that it can fail. Each control below introduces the defect it guards against
 * and asserts the guard rejects it — structurally where the defect is a source
 * fact, behaviourally where it is a runtime fact.
 *
 * @see docs/platform/planning/trust-adoption/processing/PHASE-1-PROCESSING-ADOPTION-ASSESSMENT.md
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
    classifyNonFormSource,
    CLASSIFIER_VERSION,
} from "@/lib/pos/processingCase/classification/classifyNonFormSource";
import { governSourceClassification } from "@/lib/pos/processingCase/classification/governSourceClassification";
import { safeParseGovernedSourceClassificationV1 } from "@/lib/pos/processingCase/classification/governedClassificationSchema";
import type { ClassifyNonFormSourceInput } from "@/lib/pos/processingCase/classification/types";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { decideProcessingSourceClassification } from "@/lib/trust/consumers/processingSourceClassification";

const WEB_ROOT = join(__dirname, "..", "..");

function sourceFilesUnder(relative: string): string[] {
    const root = join(WEB_ROOT, relative);
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
        }
    };
    walk(root);
    return out;
}

function makeRecordingRepository() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract(c) { contracts.push(c); },
        async advanceContractLifecycle() {},
        async insertPackage(p) { packages.push(p); },
        async insertObservation() {},
        async insertReasoningUsage(u) { usage.push(u); },
    };
    return { repository, contracts, packages, usage };
}

const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const SUBSIDY_INPUT: ClassifyNonFormSourceInput = {
    sourceKind: "document",
    fileName: "2026_CCAP_Subsidy_Contract.pdf",
};

async function governRecommendation(recommendation: Record<string, unknown>) {
    const { repository, packages, contracts } = makeRecordingRepository();
    const decision = await decideProcessingSourceClassification({
        org_id: "o",
        processing_case_id: "c",
        source_kind: "document",
        classification: recommendation,
        material_input_fingerprint: "f",
        material_input_version: "v",
        classifier_version: CLASSIFIER_VERSION,
        initiating_actor: { actor_type: "system", actor_id: null },
        channel: "system",
        repository,
        nowIso: FIXED_NOW,
        clock: () => 0,
    });
    return { decision, packages, contracts };
}

function validRecommendation(): Record<string, unknown> {
    const r = classifyNonFormSource(SUBSIDY_INPUT);
    return {
        classification_key: r.classification_key,
        label: r.label,
        confidence: r.confidence,
        status: r.status,
        classifier_version: r.classifier_version,
        signals: r.signals,
    };
}

// ---------------------------------------------------------------------------

describe("NC-1 — classification rules copied into lib/trust would be caught", () => {
    /**
     * Tokens that exist ONLY in the classifier's rule table. Deliberately
     * excludes every value in the public output vocabulary (`remittance`,
     * `subsidy_contract`, …), which legitimately appears in type positions.
     */
    const RULE_ONLY_TOKENS = [
        "child care assistance",
        "ccap",
        "voucher",
        "payment advice",
        "reconciliation",
        "shot record",
        "izr",
        "intake packet",
        "application form",
        "vaccination",
    ];

    it("the tokens are genuinely present in the Processing classifier", () => {
        const classifier = readFileSync(
            join(WEB_ROOT, "lib/pos/processingCase/classification/classifyNonFormSource.ts"),
            "utf8",
        ).toLowerCase();
        // Proves the control is checking for something that really exists.
        for (const token of RULE_ONLY_TOKENS) expect(classifier).toContain(token);
    });

    it("lib/trust contains none of them — no rule table, no keyword, no weight", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            const src = readFileSync(file, "utf8").toLowerCase();
            for (const token of RULE_ONLY_TOKENS) {
                if (src.includes(token)) offenders.push(`${file.replace(WEB_ROOT, "")}: ${token}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe("NC-2 — Processing never reads its classification back out of Trust", () => {
    it("the classification modules query no trust_ table and import no Trust repository", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/pos/processingCase/classification")) {
            const src = readFileSync(file, "utf8");
            for (const match of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) {
                if (match[1]!.startsWith("trust_")) offenders.push(`${file.replace(WEB_ROOT, "")}: ${match[1]}`);
            }
            if (/trustDecisionRepository/.test(src) && !/import type/.test(src)) {
                offenders.push(`${file.replace(WEB_ROOT, "")}: value import of the Trust repository`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the read model parses classification from processing_cases metadata, not from a package", () => {
        const readModel = readFileSync(
            join(WEB_ROOT, "lib/pos/processingCase/classification/processingCaseClassificationDb.ts"),
            "utf8",
        );
        expect(readModel).toContain("processing_cases");
        expect(readModel).not.toContain("trust_decision_packages");
    });
});

describe("NC-3 — an unsupported source that reached Trust would be caught", () => {
    it("bypassing the projection is what it takes to create a contract — so the guard is load-bearing", async () => {
        // The real path returns `skipped_unsupported` and creates nothing.
        const { repository, contracts } = makeRecordingRepository();
        const input: ClassifyNonFormSourceInput = { sourceKind: "form_submission", fileName: "x.pdf" };
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: classifyNonFormSource(input),
            deps: { repository, nowIso: FIXED_NOW, clock: () => 0 },
        });
        expect(contracts).toHaveLength(0);

        // Forcing the unsupported status past the projection is rejected by the
        // owner's parser, so it can never become a `recommended` package either.
        const forced = { ...validRecommendation(), status: "unsupported" };
        expect(safeParseGovernedSourceClassificationV1(forced)).toBeNull();
        const { decision } = await governRecommendation(forced);
        expect(decision.package.outcome).toBe("failed_validation");
    });
});

describe("NC-4 — a rescaled confidence would be caught", () => {
    it("0.7 rescaled to 70 fails validation instead of being carried", async () => {
        const rescaled = { ...validRecommendation(), confidence: 70 };
        expect(safeParseGovernedSourceClassificationV1(rescaled)).toBeNull();
        const { decision } = await governRecommendation(rescaled);
        expect(decision.package.outcome).toBe("failed_validation");
    });

    it("a percentage-style 0..100 value fails even inside the legal band", async () => {
        const { decision } = await governRecommendation({ ...validRecommendation(), confidence: 95 });
        expect(decision.package.outcome).toBe("failed_validation");
    });

    it("the unmodified value passes, proving the control isolates the rescale", async () => {
        const { decision } = await governRecommendation(validRecommendation());
        expect(decision.package.outcome).toBe("recommended");
    });
});

/**
 * NC-5 and NC-6 document a defence-in-depth result worth stating precisely.
 *
 * Phase 0 recorded, as debt, a capability that embedded a provider label inside
 * its own recommendation jsonb — the platform could not police an opaque payload
 * it never interprets. This capability closes that hole TWICE:
 *
 *  1. the strategy is a WHITELIST projection, so a smuggled key is dropped
 *     before validation and can never reach the package at all; and
 *  2. the owner's parser is a CLOSED shape, so a recommendation constructed by
 *     any other route is refused.
 *
 * The first is why the package outcome stays `recommended` below: there is
 * nothing left to refuse by the time validation runs. Both layers are asserted,
 * because relying on either alone would be a weaker guarantee than the pair.
 */
describe("NC-5 — provider identity added to the recommendation would be caught", () => {
    it("layer 1: the strategy drops a smuggled provider_key before it reaches the package", async () => {
        const withProvider = { ...validRecommendation(), provider_key: "openai" };
        const { decision, packages } = await governRecommendation(withProvider);

        expect(decision.package.recommendation).not.toBeNull();
        expect(Object.keys(decision.package.recommendation!).sort()).toEqual([
            "classification_key", "classifier_version", "confidence", "label", "signals", "status",
        ]);
        expect(JSON.stringify(packages[0]).toLowerCase()).not.toContain("openai");
        expect(JSON.stringify(packages[0])).not.toContain("provider_key");
    });

    it("layer 2: the owner's parser refuses the same payload outright", () => {
        expect(safeParseGovernedSourceClassificationV1({ ...validRecommendation(), provider_key: "openai" })).toBeNull();
        // ...and the unmodified payload parses, isolating the control to the extra key.
        expect(safeParseGovernedSourceClassificationV1(validRecommendation())).not.toBeNull();
    });

    it("a provider label nested inside a signal is refused by the parser and dropped by the strategy", async () => {
        const nested = {
            ...validRecommendation(),
            signals: [{ source: "filename", value: "subsidy", weight: 0.6, provider_key: "openai" }],
        };
        expect(safeParseGovernedSourceClassificationV1(nested)).toBeNull();
        // The strategy passes signals through verbatim, so this one IS carried —
        // and validation is what stops it. Proves layer 2 is load-bearing.
        const { decision } = await governRecommendation(nested);
        expect(decision.package.outcome).toBe("failed_validation");
        expect(decision.package.recommendation).toBeNull();
    });
});

describe("NC-6 — a command binding added to the recommendation would be caught", () => {
    it("layer 1: a top-level proposed_command never reaches the package", async () => {
        const withCommand = {
            ...validRecommendation(),
            proposed_command: { command_key: "create_person", inputs: {} },
        };
        const { decision } = await governRecommendation(withCommand);
        expect(JSON.stringify(decision.package)).not.toContain("proposed_command");
        expect(JSON.stringify(decision.package)).not.toContain("create_person");
    });

    it("layer 2: the owner's parser refuses a recommendation carrying one", () => {
        expect(
            safeParseGovernedSourceClassificationV1({
                ...validRecommendation(),
                proposed_command: { command_key: "create_person", inputs: {} },
            }),
        ).toBeNull();
    });

    it("a command binding smuggled through a signal fails validation", async () => {
        const viaSignal = {
            ...validRecommendation(),
            signals: [{ source: "filename", value: "subsidy", weight: 0.6, command_key: "create_person" }],
        };
        const { decision } = await governRecommendation(viaSignal);
        expect(decision.package.outcome).toBe("failed_validation");
        expect(decision.package.recommendation).toBeNull();
    });
});

describe("NC-7 — duplicate package creation inflating metrics would be caught", () => {
    it("one governed call yields exactly one package and one usage record", async () => {
        const { repository, packages, usage } = makeRecordingRepository();
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input: SUBSIDY_INPUT, result: classifyNonFormSource(SUBSIDY_INPUT),
            deps: { repository, nowIso: FIXED_NOW, clock: () => 0 },
        });
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
    });

    it("two packages against one contract is detectable — contract_id is the dedupe key", async () => {
        const { repository, contracts, packages } = makeRecordingRepository();
        const run = () =>
            governSourceClassification(null, {
                orgId: "o", caseId: "c", input: SUBSIDY_INPUT, result: classifyNonFormSource(SUBSIDY_INPUT),
                deps: { repository, nowIso: FIXED_NOW, clock: () => 0 },
            });
        await run();
        await run();
        const contractIds = packages.map((p) => p.contract_id);
        // One package per contract. A duplicate would collapse this set.
        expect(new Set(contractIds).size).toBe(packages.length);
        expect(contracts).toHaveLength(packages.length);
    });

    it("a refused decision still produces exactly one package, never zero and never two", async () => {
        const { decision, packages, contracts } = await governRecommendation({
            ...validRecommendation(),
            confidence: 70,
        });
        expect(decision.package.outcome).toBe("failed_validation");
        // Refusal is a Decision Package: one contract in, one package out.
        expect(contracts).toHaveLength(1);
        expect(packages).toHaveLength(1);
    });
});

describe("NC-8 — Trust cannot gain mutation authority over Processing", () => {
    it("no lib/trust module writes to a processing_ table", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            const src = readFileSync(file, "utf8");
            for (const match of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) {
                if (match[1]!.startsWith("processing_")) offenders.push(`${file.replace(WEB_ROOT, "")}: ${match[1]}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the capability's only Processing import is the owner's validation parser", () => {
        const contribution = readFileSync(
            join(WEB_ROOT, "lib/trust/capabilities/processingSourceClassification/contribution.ts"),
            "utf8",
        );
        const posImports = [...contribution.matchAll(/from "@\/lib\/pos\/([^"]+)"/g)].map((m) => m[1]);
        expect(posImports).toEqual(["processingCase/classification/governedClassificationSchema"]);
    });

    it("the strategy imports nothing from lib/pos at all", () => {
        const strategy = readFileSync(
            join(WEB_ROOT, "lib/trust/reasoning/strategies/processingSourceClassificationDeterministic.ts"),
            "utf8",
        );
        expect(strategy).not.toContain("@/lib/pos");
    });
});
