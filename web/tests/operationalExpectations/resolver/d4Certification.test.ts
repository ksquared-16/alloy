/**
 * P1 · Wave D · D4 — Determinism and certification.
 *
 * Consolidated evidence that the Effective Expectation Resolver is a pure,
 * deterministic, append-only-safe primitive: no writer / RPC / system-clock
 * dependency (static source scan), row-shape alignment with the shipped
 * `operational_expectations` table, idempotent repeat evaluation, and set-level
 * isolation of an unsupported-transition failure.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    resolveEffectiveExpectation,
    resolveEffectiveExpectations,
} from "@/lib/operationalExpectations/resolver/resolveEffectiveExpectation";
import { columnInCreateBlock, readMigrationsOrderedTouching } from "../../operationalLedger/ledgerSchemaScan";
import { row } from "./fixtures";

const RESOLVER_DIR = join(__dirname, "../../../lib/operationalExpectations/resolver");

function stripTsComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function resolverSource(): string {
    return stripTsComments(
        readFileSync(join(RESOLVER_DIR, "resolveEffectiveExpectation.ts"), "utf8") +
            "\n" +
            readFileSync(join(RESOLVER_DIR, "effectiveExpectationTypes.ts"), "utf8"),
    );
}

describe("D4 · no writer, RPC mutation, or system-clock dependency (static proof)", () => {
    const src = resolverSource();
    const forbidden: Array<[string, RegExp]> = [
        ["supabase client", /createAdminClient|createClient|supabaseAdmin|@supabase/],
        ["RPC call", /\.rpc\(/],
        ["table read/write", /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/],
        ["system clock", /Date\.now|new Date\(|Math\.random|performance\.now/],
        ["env / process", /process\.env|process\.hrtime/],
    ];
    for (const [label, re] of forbidden) {
        it(`resolver source contains no ${label}`, () => {
            expect(re.test(src)).toBe(false);
        });
    }
    it("reads time only via Date.parse of injected timestamps", () => {
        expect(/Date\.parse\(/.test(src)).toBe(true);
    });
});

describe("D4 · row-shape aligns with the shipped operational_expectations table", () => {
    const { concatenated } = readMigrationsOrderedTouching("operational_expectations");
    const columns = [
        "org_id",
        "lineage_root_id",
        "supersedes_expectation_id",
        "verb",
        "transition_type",
        "modality",
        "author_class",
        "authority_key",
        "standing",
        "subject_kind",
        "valid_from",
        "valid_to",
        "authored_at",
    ];
    for (const col of columns) {
        it(`the resolver's injected column \`${col}\` exists on the ledger`, () => {
            expect(columnInCreateBlock(concatenated, "operational_expectations", col)).toBe(true);
        });
    }
});

describe("D4 · idempotent repeat evaluation", () => {
    const rows = [
        row({ id: "p", valid_from: "2026-01-01T00:00:00Z", valid_to: null, authored_at: "2026-01-01T00:00:00Z" }),
        row({ id: "r", verb: "revise", transition_type: "revision", supersedes_expectation_id: "p", lineage_root_id: "p", valid_from: "2026-02-01T00:00:00Z", authored_at: "2026-01-20T00:00:00Z" }),
        row({ id: "c", verb: "correct", transition_type: "correction", supersedes_expectation_id: "r", lineage_root_id: "p", valid_from: "2026-02-01T00:00:00Z", authored_at: "2026-02-10T00:00:00Z" }),
    ];
    it("repeated evaluation of the same inputs is deeply identical", () => {
        const q = { orgId: "org-1", lineageRootId: "p", asOf: { validTime: "2026-03-01T00:00:00Z" } };
        const first = resolveEffectiveExpectation(rows, q);
        const second = resolveEffectiveExpectation(rows, q);
        expect(second).toEqual(first);
    });
});

describe("D4 · set-level isolation of an unsupported-transition failure", () => {
    it("a supported lineage resolves while a cancelled lineage in the same input fails closed", () => {
        const rows = [
            row({ id: "a" }),
            row({ id: "b" }),
            row({ id: "b2", verb: "cancel", transition_type: "cancellation", supersedes_expectation_id: "b", lineage_root_id: "b", authored_at: "2026-01-05T00:00:00Z" }),
        ];
        const map = resolveEffectiveExpectations(rows, { orgId: "org-1", asOf: { validTime: "2026-01-15T00:00:00Z" } });
        expect(map.get("a")?.kind).toBe("resolved");
        const b = map.get("b");
        expect(b?.kind).toBe("unsupported_transition");
        expect(b?.kind === "unsupported_transition" && b.transitionType).toBe("cancellation");
    });
});
