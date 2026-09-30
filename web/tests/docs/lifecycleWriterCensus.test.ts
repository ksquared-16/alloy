/**
 * Governed enrollment lifecycle writers are a closed, named set.
 *
 * The certification requirement is ZERO unexplained writers, and the only way to keep that true is to
 * enumerate the permitted ones and fail on anything new. Grep proximity is not enough: an earlier
 * census flagged ten files because a lifecycle-like name appeared *somewhere* in them, and nine turned
 * out never to write a governed column — one matched a `byStage.push({ stage_key })` result object, in
 * a file whose own header says it does not change status. So this inspects the WRITE PAYLOAD.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

/** Governed lifecycle fields, by the table that owns them. */
const GOVERNED: Record<string, readonly string[]> = {
    opportunities: ["stage_key", "status_key", "close_reason_key"],
    opportunity_customer_members: ["stage_key", "outcome_status_key"],
};

/**
 * Permitted writers, each with the authority class that justifies it.
 * Adding a file here is a deliberate authority decision, not a test fix.
 */
const PERMITTED: Record<string, "CANONICAL_LIFECYCLE" | "INITIALIZATION" | "MIGRATION_MAINTENANCE"> = {
    // The canonical lifecycle path and the helpers that own each field's write.
    "web/lib/lifecycle/stageOutcomeRuleTargetExecutor.ts": "CANONICAL_LIFECYCLE",
    "web/lib/opportunities/updateOpportunityStatusWithEvent.ts": "CANONICAL_LIFECYCLE",
    "web/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus.ts": "CANONICAL_LIFECYCLE",
    "web/lib/admin/actions/executeAdminAction.ts": "CANONICAL_LIFECYCLE",
    "web/lib/lifecycle/completeStageWorkWithOutcome.ts": "CANONICAL_LIFECYCLE",
    "web/lib/process/processInstances.ts": "CANONICAL_LIFECYCLE",
    // Record creation / intake establishing an initial position.
    "web/lib/lifecycle/ensureOpportunityCustomerMemberParticipation.ts": "INITIALIZATION",
    "web/lib/pos/processingIdentity/commands/ports.ts": "INITIALIZATION",
    "web/lib/admin/actions/entryLifecycleActions.ts": "INITIALIZATION",
    "web/lib/forms/intake/applyFormLeadCaptureIntake.ts": "INITIALIZATION",
    "web/lib/enrollment/participantLaunch/launchParticipantEnrollment.ts": "INITIALIZATION",
    "web/lib/pos/processingIdentity/sources/createLeadIntakeAdapter.ts": "INITIALIZATION",
    // Scripts, seeds, fixtures and repairs — not product runtime authority.
    "web/lib/admin/statusReseed/runStatusDefinitionsReseed.ts": "MIGRATION_MAINTENANCE",
    "web/lib/orchestration/placement/backfill/placementCandidateBackfill.ts": "MIGRATION_MAINTENANCE",
    "web/lib/dev/seedChildcareDemo.ts": "MIGRATION_MAINTENANCE",
    "web/lib/admin/verticalBootstrap/childcareStarterSeedV1.ts": "MIGRATION_MAINTENANCE",
    "web/lib/certification/operationalCardsCertificationFixture.ts": "MIGRATION_MAINTENANCE",
    "web/lib/lifecycle/repairLifecycleWorkspaceVisibility.ts": "MIGRATION_MAINTENANCE",
    "web/lib/enrollment/completion/requirementExceptionService.ts": "MIGRATION_MAINTENANCE",
    // QA-artifact cleanup: reachable only from scripts/, dry-run unless explicitly confirmed.
    "web/lib/forms/cleanupFormsQaArtifacts.ts": "MIGRATION_MAINTENANCE",
    "web/lib/orchestration/placement/placementCandidateLifecycleHook.ts": "CANONICAL_LIFECYCLE",
    "web/lib/forms/packets/applyEnrollmentPacketBusinessProcessIntegration.ts": "CANONICAL_LIFECYCLE",
};

function walk(rel: string, out: string[] = []): string[] {
    for (const entry of readdirSync(path.join(repoRoot, rel))) {
        const child = `${rel}/${entry}`;
        if (statSync(path.join(repoRoot, child)).isDirectory()) walk(child, out);
        else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) out.push(child);
    }
    return out;
}

/**
 * The object literal that starts at `open`, ended by brace matching.
 *
 * A fixed-width window is not good enough, and getting that wrong is instructive: a 700-character
 * window after `.update(` spilled past the payload's closing brace in
 * `attachLifecycleWorkUnitRecords.ts` and caught a later `byStage.push({ stage_key })` — a RESULT
 * object, in a file that writes only `{ work_unit_id, updated_at }` and whose header says it does not
 * change status. The payload has to end where the payload ends.
 */
function objectLiteralAt(text: string, open: number): string {
    if (text[open] !== "{") return "";
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
        if (text[i] === "{") depth += 1;
        else if (text[i] === "}") {
            depth -= 1;
            if (depth === 0) return text.slice(open, i + 1);
        }
    }
    return text.slice(open);
}

/** Files that put a governed field into a write payload aimed at the table that owns it. */
function governedLifecycleWriters(): string[] {
    const found = new Set<string>();
    for (const rel of [...walk("web/lib"), ...walk("web/app")]) {
        const text = read(rel);
        for (const [table, cols] of Object.entries(GOVERNED)) {
            const from = new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)`, "g");
            for (const m of text.matchAll(from)) {
                // The write may be chained a little after the .from(), but not arbitrarily far.
                const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 400);
                const verb = /\.(update|insert|upsert)\(\s*/.exec(after);
                if (!verb) continue;
                const payloadStart = m.index! + m[0].length + verb.index! + verb[0].length;
                const payload = objectLiteralAt(text, payloadStart);
                if (!payload) continue; // a spread or variable payload; not a literal governed write
                if (cols.some((c) => new RegExp(`(?:^|[\\s{,])${c}\\s*:`).test(payload))) found.add(rel);
            }
        }
    }
    return [...found].sort();
}

describe("the governed lifecycle writer set is closed", () => {
    it("every writer is a permitted, classified authority", () => {
        const unexplained = governedLifecycleWriters().filter((f) => !(f in PERMITTED));
        expect(
            unexplained,
            "A new writer of a governed enrollment lifecycle field appeared. Classify it deliberately " +
                "(CANONICAL_LIFECYCLE / INITIALIZATION / MIGRATION_MAINTENANCE) and add it to PERMITTED, " +
                "or route it through canonical lifecycle execution instead.",
        ).toEqual([]);
    });

    it("the record route is not among them", () => {
        expect(governedLifecycleWriters()).not.toContain("web/app/api/admin/opportunities/[id]/route.ts");
    });

    it("no operator surface component writes a governed field", () => {
        // Components are presentation. A write here would be a bypass by another name.
        const componentWriters = governedLifecycleWriters().filter((f) => f.startsWith("web/components/"));
        expect(componentWriters).toEqual([]);
    });
});
