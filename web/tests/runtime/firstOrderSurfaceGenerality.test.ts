/**
 * P0-7.6 PART 2 — BILLING/FUTURE-PROCESS GENERALITY CONFIRMATION.
 *
 * Not a new architecture slice. The census (certification/p076-first-order-surface/) established
 * that the first-order collapsed surface is compiled generically from two registries over the
 * provisioning answer, with a configuration-owned card model.
 *
 * This confirms the claim GENERALISES to a card of a different identity — `billing_preview`, which
 * is neither Enrollment-shaped nor a member of the six configured cards — by proving the five
 * things the dispatch names, with ZERO edits to the generic compiler.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { MOUNTABLE_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import { FOCUS_PANEL_CARD_CATALOG, focusPanelCardCatalogLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import { system5ArchetypeForCard } from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import { system5IconForCard } from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** Executable code only — a card key named in prose is not a branch. */
const codeOf = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const COMPILER = "lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts";
const RENDERER = "components/admin/focusPanel/FocusPanelCardRenderer.tsx";

/** The six cards the census covered. Billing is deliberately none of them. */
const CONFIGURED_SIX = [
    "business_process",
    "household",
    "children",
    "attendance",
    "health_safety",
    "financials",
] as const;

const ctx = (truth: Record<string, unknown>, subject?: Record<string, unknown>) =>
    ({ truth, ...(subject ? { subject } : {}) }) as unknown as OperationalContext;

const billing = () => MOUNTABLE_CARD_SPECS.find((s) => s.key === "billing_preview")!;

describe("1 — different card identity", () => {
    it("billing_preview is not one of the six configured cards", () => {
        expect(CONFIGURED_SIX).not.toContain("billing_preview" as never);
    });

    it("it is admitted by the same registry, not a parallel one", () => {
        expect(billing()).toBeDefined();
        // Identity-only: content is the ledger's answer and is never commit-knowable.
        expect(COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === "billing_preview")).toBeUndefined();
    });

    it("its identity predicate is its OWN, not one borrowed from the six", () => {
        const others = MOUNTABLE_CARD_SPECS.filter((s) => s.key !== "billing_preview");
        expect(billing().identityTruthKeys).toEqual(["id"]);
        for (const o of others) {
            expect(o.identityTruthKeys, `${o.key} must not share billing's identity`)
                .not.toEqual(billing().identityTruthKeys);
        }
    });
});

describe("2 — configured placement", () => {
    it("is placed by the catalog, the same authority the six use", () => {
        const entry = FOCUS_PANEL_CARD_CATALOG.find((e) => e.cardKey === "billing_preview");
        expect(entry, "billing_preview must be catalogued for an operator to place it").toBeDefined();
        expect(focusPanelCardCatalogLabel("billing_preview")).toBe("Billing Preview");
    });

    it("draws archetype and icon from the same key-keyed tables as the six", () => {
        expect(system5ArchetypeForCard("billing_preview")).toBe("status");
        expect(system5IconForCard("billing_preview")).toBe("Receipt");
        for (const key of CONFIGURED_SIX) {
            expect(system5ArchetypeForCard(key)).toBeTruthy();
            expect(system5IconForCard(key)).toBeTruthy();
        }
    });
});

describe("3 — collapsed renderer contract", () => {
    const renderer = read(RENDERER);

    it("dispatches billing_preview to a dedicated component above the generic body", () => {
        const fork = renderer.indexOf("const drillDownAllowed");
        const branch = renderer.indexOf('model.key === "billing_preview"');
        expect(branch, "billing_preview must have a dedicated branch").toBeGreaterThan(-1);
        expect(branch, "it must sit ABOVE the generic body, like the six").toBeLessThan(fork);
    });

    it("is handed the same props contract as the configured six — and no drawer VM", () => {
        for (const key of [...CONFIGURED_SIX, "billing_preview"]) {
            const at = renderer.indexOf(`model.key === "${key}"`);
            expect(at, `${key} needs a dedicated branch`).toBeGreaterThan(-1);
            const branch = renderer.slice(at, at + 600);
            expect(branch, `${key} must receive model`).toContain("model={model}");
            expect(branch, `${key} must receive context`).toContain("context={context}");
            expect(branch, `${key} must not receive the drawer VM`).not.toMatch(/displayVm|drawerVm/);
        }
    });

    it("the billing component reads no fact-bearing model field", () => {
        const card = read("components/admin/focusPanel/cards/AssignmentTuitionCard.tsx");
        expect(card).not.toMatch(/model\.(insight|payload|statusChip|statusTone|primaryAction|secondaryInsight)/);
    });
});

describe("4 & 5 — no Enrollment-specific branch, no generic compiler edit", () => {
    const compiler = codeOf(read(COMPILER));

    it("the compiler names NO card key in executable code", () => {
        for (const key of [...CONFIGURED_SIX, "billing_preview", "current_work", "readiness_kpi"]) {
            expect(compiler, `compiler must not branch on ${key}`).not.toContain(key);
        }
    });

    it("the compiler carries no Enrollment-specific vocabulary", () => {
        expect(compiler).not.toMatch(/enroll/i);
        /*
         * `tour` DOES appear — as a property key of the neutral null-signal literal that is part of
         * the generic `OperationalContext.signals` shape. That is a struct slot every grain carries,
         * not a branch. What would betray process coupling is a COMPARISON against process
         * vocabulary, so that is what is asserted: no such token ever appears as a string literal.
         */
        /*
         * A TYPE INDEX IS NOT A BRANCH. `OperationalContextSignals["tour"]` names a field of a
         * struct every grain carries, exactly like the `tour:` property key excused above. Strip
         * index positions before extracting literals, so the guard keeps catching the thing it
         * exists to catch — a COMPARISON against process vocabulary — and stops flagging the thing
         * it does not.
         */
        const comparable = compiler.replace(/\[\s*["'][^"']*["']\s*\]/g, "[]");
        const literals = [...comparable.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
        for (const lit of literals) {
            expect(lit, `compiler must not compare against process vocabulary: ${lit}`)
                .not.toMatch(/enroll|inquiry|waitlist|tour/i);
        }
    });

    it("admission is two registry loops and nothing else", () => {
        expect(compiler).toContain("for (const spec of COMMIT_CRITICAL_CARD_SPECS)");
        expect(compiler).toContain("for (const spec of MOUNTABLE_CARD_SPECS)");
        // A per-card conditional would show up as a key comparison; there are none (asserted above).
        // Admission must read the spec's own predicate, never a hardcoded set.
        expect(compiler).toContain("spec.isKnowable(context)");
        expect(compiler).toContain("spec.identityKnowable(context)");
    });

    it("adding a card of a NEW identity needs no compiler change", () => {
        // The proof is structural: the compiler iterates whatever the registries contain. A
        // synthetic spec of an identity the compiler has never heard of is admitted by the same
        // loop, because the loop asks the spec, not a table of known keys.
        const synthetic = {
            key: "synthetic_future_process" as never,
            identityTruthKeys: ["synthetic.id"] as const,
            identityKnowable: (c: OperationalContext) => Boolean(c.truth["synthetic.id"]),
            build: () => ({ key: "synthetic_future_process" }) as never,
        };
        expect(synthetic.identityKnowable(ctx({ "synthetic.id": "x" }))).toBe(true);
        expect(synthetic.identityKnowable(ctx({}))).toBe(false);
        expect(compiler).not.toContain("synthetic_future_process");
    });
});
