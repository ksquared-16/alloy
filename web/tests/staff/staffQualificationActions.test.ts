/**
 * Staff & Workforce V2 · Slice 3 — the qualification commands.
 *
 * These prove the SHAPE of the operational model: semantic commands rather than
 * table CRUD, no way to toggle a derived state, and validation that refuses
 * impossible facts before they reach the database.
 */

import { describe, expect, it } from "vitest";

import { getRegisteredAction, hasRegisteredHandler } from "@/lib/adminV2/actions/actionRegistry";
import {
    QUALIFICATION_ATTACH_EVIDENCE_ACTION_KEY,
    QUALIFICATION_RECORD_ACTION_KEY,
    QUALIFICATION_VERIFY_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/staffQualificationActions";

const KEYS = [
    QUALIFICATION_RECORD_ACTION_KEY,
    QUALIFICATION_VERIFY_ACTION_KEY,
    QUALIFICATION_ATTACH_EVIDENCE_ACTION_KEY,
];

describe("1. the commands are registered and executable", () => {
    it("every qualification command resolves through the shared registry", () => {
        for (const key of KEYS) {
            expect(getRegisteredAction(key), key).toBeTruthy();
            expect(hasRegisteredHandler(key), key).toBe(true);
        }
    });

    it("addresses the person subject, as employment.update does", () => {
        for (const key of KEYS) {
            expect(getRegisteredAction(key)!.supportedEntityTypes).toContain("person");
        }
    });

    it("declares itself a mutating, audited record action", () => {
        for (const key of KEYS) {
            const a = getRegisteredAction(key)!;
            expect(a.audit.mutates).toBe(true);
            expect(a.audit.eventType).toBe("action_executed");
        }
    });
});

describe("2. there is NO command to toggle a derived state", () => {
    it("registers no mark-expired command in any spelling", async () => {
        const mod = await import("@/lib/adminV2/actions/definitions/staffQualificationActions");
        const keys = Object.values(mod).filter((v) => typeof v === "string") as string[];
        for (const k of keys) {
            expect(k).not.toMatch(/expire|expiry|mark_expired/i);
        }
    });

    it("exposes no raw table CRUD naming", () => {
        for (const key of KEYS) {
            expect(key).not.toMatch(/\.(create|insert|update|delete|upsert)$/);
        }
    });
});

describe("3. impossible facts are refused before they reach the database", () => {
    const record = () => getRegisteredAction(QUALIFICATION_RECORD_ACTION_KEY)!;

    it("refuses an expiry that precedes the issue date", () => {
        const r = record().validatePayload!({ issued_on: "2026-06-01", expires_on: "2026-01-01" });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.blockers.map((b) => b.code)).toContain("expiry_before_issue");
    });

    it("refuses a malformed date", () => {
        const r = record().validatePayload!({ issued_on: "June 1st" });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.blockers.map((b) => b.code)).toContain("invalid_issued_on");
    });

    it("accepts an open-ended qualification with no expiry", () => {
        expect(record().validatePayload!({ issued_on: "2026-06-01" }).ok).toBe(true);
    });

    it("accepts expiry equal to issue date — a same-day credential is not impossible", () => {
        expect(record().validatePayload!({ issued_on: "2026-06-01", expires_on: "2026-06-01" }).ok).toBe(true);
    });

    it("requires the employment and the qualification type", async () => {
        const e = await record().resolveEligibility!({ payload: {} } as never);
        expect(e.eligible).toBe(false);
        expect(e.blockers.map((b) => b.code).sort()).toEqual(["missing_employment", "missing_type"]);
    });
});

describe("4. verification records a decision, not a free-text state", () => {
    const verify = () => getRegisteredAction(QUALIFICATION_VERIFY_ACTION_KEY)!;

    it("accepts verified and rejected only", () => {
        expect(verify().validatePayload!({ verification_state: "verified" }).ok).toBe(true);
        expect(verify().validatePayload!({ verification_state: "rejected" }).ok).toBe(true);
        expect(verify().validatePayload!({ verification_state: "probably_fine" }).ok).toBe(false);
    });

    it("defaults to verified when unspecified", () => {
        expect(verify().validatePayload!({}).ok).toBe(true);
    });
});

describe("5. evidence is referenced, and the copy language is absent", () => {
    it("requires an existing document id", async () => {
        const a = getRegisteredAction(QUALIFICATION_ATTACH_EVIDENCE_ACTION_KEY)!;
        expect(a.validatePayload!({}).ok).toBe(false);
        expect(a.validatePayload!({ document_id: "doc-1" }).ok).toBe(true);
    });

    it("says in its own preview that no copy is made", async () => {
        const a = getRegisteredAction(QUALIFICATION_ATTACH_EVIDENCE_ACTION_KEY)!;
        const preview = await a.buildPreview({} as never);
        expect(JSON.stringify(preview)).toMatch(/no copy|not copied/i);
    });
});

describe("6. renewal is a record that supersedes, never an overwrite", () => {
    it("previews renewal as keeping the replaced qualification", async () => {
        const a = getRegisteredAction(QUALIFICATION_RECORD_ACTION_KEY)!;
        const preview = await a.buildPreview({ payload: { supersedes_qualification_id: "q-old" } } as never);
        expect(JSON.stringify(preview)).toMatch(/history|replaces|keep/i);
    });
});
