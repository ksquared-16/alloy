/**
 * THE ALLOY-CERT INCIDENT CENSUS v2 — static proof of its scope and its request packet. Reads files only.
 *
 * The census is NOT executed anywhere in this repository (no registered action can reach the shared
 * stack yet). What can be proven here is that the query asks exactly the narrow questions it claims:
 * one read-only frame, labelled count-only statements, every predicate bound to a fixed incident
 * identity with the org pinned, none of v1's org-wide / prefix / whole-org window / pg_stat questions —
 * and that the request packet's hashes, question ids and target binding are the file's own.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const DIR = join(REPO, "certification/financials/incidents/2026-10-30-alloy-cert-live-suites");
const V1 = join(DIR, "alloy-cert-incident-census.sql");
const V2 = join(DIR, "alloy-cert-incident-census.v2.sql");
const PACKET = JSON.parse(readFileSync(join(DIR, "CENSUS-V2-REQUEST-PACKET.json"), "utf8"));

const ORG = "00000000-0000-4000-8000-000000000001";
const IDENTITIES = [
    "77000000-0000-4000-8000-0000000000a1",
    "77000000-0000-4000-8000-0000000000b1",
    "77000000-0000-4000-8000-0000000000b2",
    "cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01",
    "cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-02",
    "fc500000-0000-4000-8000-0000000a0001",
    "fc500000-0000-4000-8000-0000000c0001",
];
const W0 = "2026-10-30T15:52:11.391Z";
const W1 = "2026-10-30T15:52:32.859Z";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const raw = readFileSync(V2, "utf8");
/* Comments dropped, then split on `;` — v2 carries no `;` or quote inside a string literal but its own. */
const statements = raw.replace(/--[^\n]*/g, " ").split(";").map((s) => s.trim()).filter(Boolean);
const inner = statements.slice(1, -1);

describe("census v2 — the narrow incident question set", () => {
    it("is one read-only frame of labelled SELECTs, each counting once", () => {
        expect(statements[0].replace(/\s+/g, " ").toLowerCase()).toBe("begin transaction read only");
        expect(statements.at(-1)!.toLowerCase()).toBe("rollback");
        expect(inner).toHaveLength(27);
        for (const s of inner) {
            expect(s).toMatch(/^select '(q\d{2}_[a-z0-9_]{1,80})' \|\| '\|count\|' \|\| count\(\*\)\s/);
            expect(s).not.toMatch(/\b(insert|update|delete|truncate|alter|create|drop|grant|copy|call|do|perform|set_config|pg_sleep|nextval)\b/i);
        }
    });

    it("pins the org and binds every statement to at least one fixed incident identity", () => {
        for (const s of inner) {
            expect(s, s.slice(0, 60)).toContain(`org_id = '${ORG}'`);
            expect(IDENTITIES.some((id) => s.includes(`'${id}'`)), s.slice(0, 60)).toBe(true);
        }
    });

    it("drops every v1 broad question: no LIKE prefix, no pg_stat, no unbound time window", () => {
        expect(raw.replace(/--[^\n]*/g, "")).not.toMatch(/\blike\b|pg_stat|stats_reset|live-1793375/i);
        for (const s of inner.filter((x) => x.includes("created_at"))) {
            /* A window is always beside a fixed identity, never the only bound on a table. */
            expect(IDENTITIES.some((id) => s.includes(`'${id}'`))).toBe(true);
            for (const bound of s.match(/created_at\s*[<>]=?\s*'([^']+)'/g) ?? []) expect([W0, W1].some((w) => bound.includes(w))).toBe(true);
        }
    });

    it("joins dependencies only through those identities", () => {
        for (const s of inner.filter((x) => /\bjoin\b/i.test(x))) {
            expect(IDENTITIES.some((id) => s.includes(`'${id}'`))).toBe(true);
            expect(s).toMatch(/join public\.(consumption_events e on e\.id = o\.consumption_event_id|charges s on s\.id = c\.source_charge_id|charges c on c\.id = pa\.charge_id)/);
        }
    });

    it("separates pre-existing rows from window-attributable ones for every fixed identity it counts by time", () => {
        const ids = inner.map((s) => /^select '([^']+)'/.exec(s)![1]);
        for (const group of ["tuition_agreement", "tuition_terms", "tuition_events", "tuition_obligations", "tuition_charges", "spine_charges"]) {
            for (const phase of ["before", "during", "after"]) expect(ids.some((id) => id.endsWith(`${group}_${phase}`)), `${group}_${phase}`).toBe(true);
        }
        expect(ids).toContain("q17_spine_agreement_before");
    });
});

describe("the request packet is the file's own — and honest about its dependency", () => {
    it("carries the file hash, the executed-SQL hash and the question ids, in order", () => {
        expect(PACKET.expected_hashes.file_sha256).toBe(sha256(raw));
        expect(PACKET.proposed_registration.sha256).toBe(sha256(raw));
        expect(PACKET.expected_hashes.executed_sql_sha256).toBe(sha256(`${inner.join(";\n")};\n`));
        expect(PACKET.proposed_registration.statements).toBe(inner.length);
        expect(PACKET.proposed_registration.question_ids).toEqual(inner.map((s) => /^select '([^']+)'/.exec(s)![1]));
        expect(PACKET.proposed_registration.triples).toEqual([]);
        expect(PACKET.questions.map((q: { id: string }) => q.id)).toEqual(PACKET.proposed_registration.question_ids);
    });

    it("binds exactly the shared alloy-cert target, owned by this lane", () => {
        expect(PACKET.request_inputs).toMatchObject({
            databaseTarget: "alloy_cert",
            targetBinding: { target_id: "alloy-cert@127.0.0.1:54422", target_class: "shared_local_certification", census_id: PACKET.proposed_registration.census_id },
            requestLaneId: "lane_b77b3cbb5840",
            queryArtifactPath: PACKET.proposed_registration.path,
        });
    });

    it("says it is a dependency, not a payload, and states the deletion limit", () => {
        expect(PACKET.status).toBe("DEPENDENCY_NOT_INSTALLED");
        expect(PACKET.dependency.owner_objective).toBe("OPWORK_25AD3858DE4D_SPRINT_A741F0C6D2E9");
        expect(PACKET.provenance_limit).toMatch(/cannot prove historical deletion/);
    });

    it("v1 is kept byte-identical — a draft contract pins it", () => {
        expect(sha256(readFileSync(V1, "utf8"))).toBe("6a3a03bdfe4ed2c061dd85e9b668281b7f31f0016f779c2e6f3ff6eae1bc26aa");
        expect(PACKET.supersedes.sha256).toBe("6a3a03bdfe4ed2c061dd85e9b668281b7f31f0016f779c2e6f3ff6eae1bc26aa");
    });

    it("a synthetic census output in the contract's line form parses to one integer per registered question", () => {
        const ids: string[] = PACKET.proposed_registration.question_ids;
        const output = ids.map((id, i) => `${id}|count|${i % 2}`).join("\n");
        const counts: Record<string, number> = {};
        for (const line of output.split("\n")) {
            const m = /^(q\d{2}_[a-z0-9_]{1,80})\|count\|(\d{1,15})$/.exec(line);
            expect(m, line).not.toBeNull();
            expect(ids).toContain(m![1]);
            counts[m![1]] = Number(m![2]);
        }
        expect(Object.keys(counts)).toEqual(ids);
    });
});
