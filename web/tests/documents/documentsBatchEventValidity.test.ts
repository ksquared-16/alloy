/**
 * D7 batch B2 — event-relative validity, resolved from the subject's authoritative dates; never guessed.
 */
import { describe, expect, it } from "vitest";

import { InMemorySupabase } from "../harness/inMemorySupabase";
import { evaluateDocumentValidity, nextBirthdayAfter, type ValidityEventDates } from "@/lib/documents/validity/documentValidity";
import { loadDocumentOwnerEventDates, loadValidityEventDates } from "@/lib/documents/validity/validityEventDates";
import type { ValidityPolicy } from "@/lib/documents/configuration/documentTypePolicy";

const TODAY = "2026-10-27";
const v = (policy: ValidityPolicy, facts: Partial<{ effective_on: string; received_on: string; reviewed_on: string; expires_on: string }>, events: ValidityEventDates | null | undefined, today = TODAY) =>
    evaluateDocumentValidity({
        policy,
        facts: { effective_on: facts.effective_on ?? null, expires_on: facts.expires_on ?? null, received_on: facts.received_on ?? null, reviewed_on: facts.reviewed_on ?? null, events },
        today,
    });
const birthday: ValidityPolicy = { kind: "event_renewal", event: "birthday", warning_days: [30] } as ValidityPolicy;
const enrollment: ValidityPolicy = { kind: "event_renewal", event: "enrollment_start" } as ValidityPolicy;
const programYear: ValidityPolicy = { kind: "event_renewal", event: "program_year_start" } as ValidityPolicy;

describe("birthday — expires the day before the first birthday after the anchor", () => {
    it("derives from the date of birth", () => {
        const r = v(birthday, { effective_on: "2026-03-01" }, { birthday: "2021-11-15", enrollment_starts: [] });
        expect(r).toMatchObject({ expires_on: "2026-11-14", expires_source: "derived", status: "expiring_soon" });
        expect(v(birthday, { effective_on: "2026-03-01" }, { birthday: "2021-11-15", enrollment_starts: [] }, "2026-11-15").status).toBe("expired");
    });
    it("a document dated on the birthday runs to the next one", () => {
        expect(v(birthday, { effective_on: "2025-11-15" }, { birthday: "2021-11-15", enrollment_starts: [] }).expires_on).toBe("2026-11-14");
    });
    it("anchors on the review date, else receipt, when no effective date is recorded", () => {
        expect(v(birthday, { reviewed_on: "2026-12-01", received_on: "2026-01-01" }, { birthday: "2021-11-15", enrollment_starts: [] }).expires_on).toBe("2027-11-14");
        expect(v(birthday, { received_on: "2026-01-01" }, { birthday: "2021-11-15", enrollment_starts: [] }).expires_on).toBe("2026-11-14");
    });
    it("29 February falls on 28 February in a common year", () => {
        expect(nextBirthdayAfter("2020-02-29", "2026-01-10")).toBe("2026-02-28");
        expect(nextBirthdayAfter("2020-02-29", "2027-03-01")).toBe("2028-02-29");
    });
    it("no date of birth on record is date_missing, with the reason", () => {
        expect(v(birthday, { effective_on: "2026-03-01" }, { birthday: null, enrollment_starts: [] })).toMatchObject({ status: "date_missing", event_unavailable: "birthday_not_recorded", expires_on: null });
    });
});

describe("enrollment start — a document covers one enrollment", () => {
    it("expires the day before the next enrollment after the one it covers", () => {
        expect(v(enrollment, { effective_on: "2025-09-15" }, { birthday: null, enrollment_starts: ["2025-09-01", "2026-09-01"] })).toMatchObject({ expires_on: "2026-08-31", status: "expired" });
    });
    it("collected ahead of the first enrollment, it covers that enrollment", () => {
        const r = v(enrollment, { effective_on: "2026-05-01" }, { birthday: null, enrollment_starts: ["2026-09-01", "2027-09-01"] });
        expect(r).toMatchObject({ expires_on: "2027-08-31", status: "valid" });
    });
    it("with no later enrollment on record it is valid with no end date yet", () => {
        const r = v(enrollment, { effective_on: "2026-05-01" }, { birthday: null, enrollment_starts: ["2026-09-01"] });
        expect(r).toMatchObject({ status: "valid", expires_on: null, open_until_event: true });
    });
    it("no enrollment is date_missing, with the reason", () => {
        expect(v(enrollment, { effective_on: "2026-05-01" }, { birthday: null, enrollment_starts: [] })).toMatchObject({ status: "date_missing", event_unavailable: "no_enrollment" });
        expect(v(enrollment, { effective_on: "2026-05-01" }, { birthday: "2020-01-01", enrollment_starts: null })).toMatchObject({ status: "date_missing", event_unavailable: "no_enrollment" });
    });
});

describe("never guessed", () => {
    it("program year has no authoritative source: date_missing, event_source_unavailable — even with dates on record", () => {
        expect(v(programYear, { effective_on: "2026-05-01" }, { birthday: "2020-01-01", enrollment_starts: ["2026-09-01"] })).toMatchObject({ status: "date_missing", event_unavailable: "event_source_unavailable" });
    });
    it("unresolved event dates (a caller that did not load them, or a failed read) are date_missing", () => {
        expect(v(birthday, { effective_on: "2026-05-01" }, null)).toMatchObject({ status: "date_missing", event_unavailable: "event_dates_not_resolved" });
        expect(v(birthday, { effective_on: "2026-05-01" }, undefined).status).toBe("date_missing");
    });
    it("a recorded expiration always wins", () => {
        expect(v(birthday, { effective_on: "2026-05-01", expires_on: "2027-12-31" }, { birthday: "2021-11-15", enrollment_starts: [] })).toMatchObject({ expires_on: "2027-12-31", expires_source: "recorded", status: "valid" });
    });
    it("not yet in force still wins over an open enrollment", () => {
        expect(v(enrollment, { effective_on: "2027-01-01" }, { birthday: null, enrollment_starts: ["2026-09-01"] }).status).toBe("not_yet_effective");
    });
});

describe("authoritative sources", () => {
    const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
    const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";
    const C1 = "c1000000-0000-4000-8000-000000000001";
    const P1 = "9e100000-0000-4000-8000-000000000001";
    const db = () =>
        new InMemorySupabase()
            .seed("customer_members", [{ id: C1, org_id: ORG, dob: "2021-11-15" }])
            .seed("persons", [{ id: P1, org_id: ORG, date_of_birth: "1990-04-02" }])
            .seed("child_enrollment_agreements", [
                { org_id: ORG, customer_member_id: C1, start_date: "2025-09-01", status: "ended" },
                { org_id: ORG, customer_member_id: C1, start_date: "2026-09-01", status: "active" },
                { org_id: ORG, customer_member_id: C1, start_date: "2026-10-01", status: "voided" },
                { org_id: ORG, customer_member_id: C1, start_date: "2026-06-01", status: "canceled" },
                { org_id: OTHER, customer_member_id: C1, start_date: "2027-09-01", status: "active" },
            ])
            .seed("document_subjects", [{ org_id: ORG, document_id: "d1", subject_type: "child", subject_id: C1, association: "owner", is_primary: true, ended_at: null }]);
    it("child: dob and service enrollments only (voided, canceled and other organizations excluded)", async () => {
        const m = await loadValidityEventDates(db() as never, ORG, [{ subject_type: "child", subject_id: C1 }]);
        expect(m?.get(`child:${C1}`)?.birthday).toBe("2021-11-15");
        expect([...(m?.get(`child:${C1}`)?.enrollment_starts ?? [])].sort()).toEqual(["2025-09-01", "2026-09-01"]);
    });
    it("person: date of birth, no enrollment; household: nothing", async () => {
        const m = await loadValidityEventDates(db() as never, ORG, [{ subject_type: "person", subject_id: P1 }, { subject_type: "household", subject_id: "h1" }]);
        expect(m?.get(`person:${P1}`)).toEqual({ birthday: "1990-04-02", enrollment_starts: null });
        expect(m?.get("household:h1")).toEqual({ birthday: null, enrollment_starts: null });
    });
    it("a document's owner resolves for the validity route", async () => {
        expect((await loadDocumentOwnerEventDates(db() as never, ORG, "d1"))?.birthday).toBe("2021-11-15");
    });
});
