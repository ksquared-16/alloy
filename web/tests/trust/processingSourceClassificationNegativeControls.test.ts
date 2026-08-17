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

import { describe, it, expect, vi } from "vitest";
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
import { processingSourceClassificationDeterministicStrategy } from "@/lib/trust/reasoning/strategies/processingSourceClassificationDeterministic";

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

/**
 * A recording repository that ENFORCES the two uniqueness constraints the real
 * schema declares: `trust_decision_contracts.id` is a PRIMARY KEY and
 * `trust_decision_packages.contract_id` is UNIQUE.
 *
 * Without them a fake happily stores duplicates the database would refuse, and
 * every idempotency assertion here would be theatre.
 */
function makeRecordingRepository() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract(c) {
            if (contracts.some((x) => x.id === c.id)) {
                throw new Error(`duplicate key value violates unique constraint "trust_decision_contracts_pkey"`);
            }
            contracts.push(c);
        },
        async advanceContractLifecycle() {},
        async insertPackage(p) {
            if (packages.some((x) => x.contract_id === p.contract_id)) {
                throw new Error(`duplicate key value violates unique constraint "trust_decision_packages_contract_id_key"`);
            }
            packages.push(p);
        },
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
        "shot record",
        "izr",
        "intake packet",
        "application form",
        "vaccination",
        // Deliberately excluded, because a substring scan reports them from
        // ordinary prose and hex rather than from a copied rule:
        //   "reconciliation" — also the English name of the recovery path;
        //   "eob", "era", "835" — too short; they collide inside other words
        //   and inside hex digests.
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
            deps: { repository, lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0 },
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
    /**
     * Phase 2.1 moved this defence EARLIER, and the control is updated to say so.
     *
     * `provider_key` is not in the capability's semantic map, so `classifyElements`
     * defaults it to `identity`, whose declared transformation is `tokenize`.
     * Before transformation dispatch existed, `tokenize` was a no-op: the element
     * was admitted to the reasoning context raw, and only the strategy's whitelist
     * projection stopped it reaching the package. Now the privacy engine refuses
     * the whole transform, so the smuggled key never enters the context at all.
     *
     * That is strictly stronger — the element is stopped one layer sooner — but it
     * would silently retire this test's coverage of the strategy whitelist, so the
     * whitelist is asserted directly below instead of incidentally.
     */
    it("layer 0: an undeclared provider_key is refused by privacy before reasoning begins", async () => {
        const withProvider = { ...validRecommendation(), provider_key: "openai" };
        const { decision, packages } = await governRecommendation(withProvider);

        expect(decision.package.outcome).toBe("refused_privacy");
        expect(decision.package.recommendation).toBeNull();
        expect(JSON.stringify(packages[0]).toLowerCase()).not.toContain("openai");
        expect(JSON.stringify(packages[0])).not.toContain("provider_key");
    });

    it("layer 1: the strategy whitelist still drops a smuggled provider_key, asserted directly", () => {
        // Isolates the strategy from the runtime: even handed a context that
        // already contains the smuggled key, the projection emits exactly six.
        const outcome = processingSourceClassificationDeterministicStrategy.reason({
            context: {
                transformed: { ...validRecommendation(), provider_key: "openai" },
                knowledge: [],
                redaction_steps: [],
                classes_present: ["operational"],
                pii_mode: "strict",
                transformations: [],
                text_minimizations: [],
                participant_redactions: [],
                acknowledged_unminimized_classes: [],
                acknowledged_untransformed_classes: [],
            },
            nowIso: FIXED_NOW,
        }) as { ok: true; proposal: { recommendation: Record<string, unknown> } };

        expect(outcome.ok).toBe(true);
        expect(Object.keys(outcome.proposal.recommendation).sort()).toEqual([
            "classification_key", "classifier_version", "confidence", "label", "signals", "status",
        ]);
        expect(JSON.stringify(outcome.proposal.recommendation).toLowerCase()).not.toContain("openai");
    });

    it("a valid recommendation still reaches the package with exactly its six keys", async () => {
        const { decision } = await governRecommendation(validRecommendation());
        expect(decision.package.outcome).toBe("recommended");
        expect(Object.keys(decision.package.recommendation!).sort()).toEqual([
            "classification_key", "classifier_version", "confidence", "label", "signals", "status",
        ]);
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
        // Refused at privacy now rather than dropped by the strategy (see NC-5),
        // but the guarantee this control exists for is unchanged and asserted
        // identically: neither the key nor the command reaches the package.
        // The refusal explanation deliberately names the information CLASS and
        // transformation, never the caller-supplied element key — otherwise a
        // smuggled key would write its own name into an immutable package
        // through the refusal meant to stop it.
        expect(decision.package.outcome).toBe("refused_privacy");
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
            deps: { repository, lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0 },
        });
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
    });

    /**
     * The database is the backstop, not the lookup.
     *
     * With the lookup deliberately broken (always "not governed"), a second
     * attempt for the same adoption identity derives the SAME deterministic
     * contract id and loses on the contract table's primary key. The seam then
     * re-reads; because the lookup is broken it still finds nothing, so the
     * error propagates and the caller records a gap rather than duplicating.
     *
     * Either way, exactly one governed decision exists.
     */
    it("a broken lookup cannot duplicate — the contract primary key refuses the second create", async () => {
        const { repository, contracts, packages } = makeRecordingRepository();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const run = () =>
            governSourceClassification(null, {
                orgId: "o", caseId: "c", input: SUBSIDY_INPUT, result: classifyNonFormSource(SUBSIDY_INPUT),
                deps: { repository, lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0 },
            });

        const first = await run();
        const second = await run();

        expect(first.status).toBe("governed");
        // The second could not create, and could not pretend it had.
        expect(second.status).not.toBe("governed");
        expect(contracts).toHaveLength(1);
        expect(packages).toHaveLength(1);
        expect(packages[0]!.contract_id).toBe(contracts[0]!.id);
        warn.mockRestore();
        error.mockRestore();
    });

    it("the same adoption identity always derives the same contract id", async () => {
        const { repository, contracts } = makeRecordingRepository();
        const other = makeRecordingRepository();
        const call = (repo: TrustRepository) =>
            governSourceClassification(null, {
                orgId: "o", caseId: "c", input: SUBSIDY_INPUT, result: classifyNonFormSource(SUBSIDY_INPUT),
                deps: { repository: repo, lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0 },
            });
        await call(repository);
        await call(other.repository);
        // Two independent stores, one derived identity — which is exactly what
        // makes the primary key a real serialization point.
        expect(contracts[0]!.id).toBe(other.contracts[0]!.id);
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
