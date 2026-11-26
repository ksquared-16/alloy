/**
 * EN-FI-10 — the five immunization evidence states, kept apart.
 *
 *   1. REPORTED vaccine information   an active immunization fact (a family's Forms answer committed by an operator, or
 *                                      an operator's entry) — what someone SAID; `confirmed_at` empty.
 *   2. UPLOADED certificate            an immunization_record document exists for the child, not yet reviewed.
 *   3. REVIEWED certificate            Documents review decided its current version (D7 review history).
 *   4. ACCEPTED / REJECTED evidence    that decision — accepted evidence satisfies a Documents requirement; rejected
 *                                      does not. It is a statement about the DOCUMENT, not about the child's vaccines.
 *   5. VERIFIED Medical state          an immunization fact Medical verified (`verifyImmunizationFact`, health.manage):
 *                                      `confirmed_at` set. The ONLY path to verified.
 *
 * Pure: the caller supplies the child's active immunization facts and immunization-record documents. Nothing here
 * writes, and no combination of 1–4 yields 5 — an accepted certificate beside a reported fact is
 * `certificate_accepted_unverified`, never `verified`. Oregon nonmedical exemption is out of scope (deferred; it is a
 * Business Process requirement exception, not a health fact).
 */

export type ImmunizationFactInput = {
    id: string;
    vaccine_key: string | null;
    source_kind: string | null;
    confirmed_at: string | null;
    /** metadata.verification.evidence_document_id, when Medical cited a certificate. */
    verified_from_document_id?: string | null;
};

export type ImmunizationCertificateInput = {
    document_id: string;
    /** documents.status (quarantined / deleted / restricted are unavailable). */
    status: string | null;
    /** The CURRENT version's review decision. */
    review_status: "pending" | "accepted" | "rejected" | null;
    /** D7 validity status of the current version, when evaluated. */
    validity_status?: string | null;
};

export type CertificateState = "none" | "uploaded" | "accepted" | "rejected" | "expired" | "unavailable";
export type MedicalVerificationState = "none" | "unverified" | "partially_verified" | "verified";
export type ImmunizationEvidenceSummary =
    | "nothing_on_file"
    | "reported_only"
    | "certificate_uploaded"
    | "certificate_rejected"
    | "certificate_expired"
    | "certificate_accepted_unverified"
    | "partially_verified"
    | "verified";

export type ImmunizationEvidence = {
    reported: { vaccines: number; sources: string[] };
    certificate: { state: CertificateState; reviewed: boolean; document_id: string | null };
    medical: { state: MedicalVerificationState; verified: number; total: number };
    summary: ImmunizationEvidenceSummary;
};

const UNAVAILABLE = new Set(["deleted", "quarantined", "restricted"]);

/** The child's best certificate: accepted (in force) beats pending beats rejected; unavailable ones never count. */
function certificateState(certs: readonly ImmunizationCertificateInput[]): ImmunizationEvidence["certificate"] {
    if (certs.length === 0) return { state: "none", reviewed: false, document_id: null };
    const available = certs.filter((c) => !UNAVAILABLE.has(String(c.status ?? "")));
    if (available.length === 0) return { state: "unavailable", reviewed: false, document_id: null };
    const rank = (c: ImmunizationCertificateInput): number => {
        if (c.review_status === "accepted") return c.validity_status === "expired" ? 2 : 4;
        if (c.review_status === "pending" || c.review_status === null) return 3;
        return 1;
    };
    const best = [...available].sort((a, b) => rank(b) - rank(a) || a.document_id.localeCompare(b.document_id))[0]!;
    const state: CertificateState =
        best.review_status === "accepted" ? (best.validity_status === "expired" ? "expired" : "accepted") : best.review_status === "rejected" ? "rejected" : "uploaded";
    return { state, reviewed: best.review_status === "accepted" || best.review_status === "rejected", document_id: best.document_id };
}

export function classifyImmunizationEvidence(input: {
    facts: readonly ImmunizationFactInput[];
    certificates: readonly ImmunizationCertificateInput[];
}): ImmunizationEvidence {
    const facts = input.facts;
    const verified = facts.filter((f) => Boolean(f.confirmed_at)).length;
    const medicalState: MedicalVerificationState =
        facts.length === 0 ? "none" : verified === 0 ? "unverified" : verified < facts.length ? "partially_verified" : "verified";
    const certificate = certificateState(input.certificates);
    const reported = { vaccines: facts.length, sources: [...new Set(facts.map((f) => String(f.source_kind ?? "unknown")))].sort() };

    let summary: ImmunizationEvidenceSummary;
    if (medicalState === "verified") summary = "verified";
    else if (medicalState === "partially_verified") summary = "partially_verified";
    else if (certificate.state === "accepted") summary = "certificate_accepted_unverified";
    else if (certificate.state === "expired") summary = "certificate_expired";
    else if (certificate.state === "rejected") summary = "certificate_rejected";
    else if (certificate.state === "uploaded") summary = "certificate_uploaded";
    else if (facts.length > 0) summary = "reported_only";
    else summary = "nothing_on_file";
    return { reported, certificate, medical: { state: medicalState, verified, total: facts.length }, summary };
}

export const IMMUNIZATION_EVIDENCE_LABEL: Readonly<Record<ImmunizationEvidenceSummary, string>> = Object.freeze({
    nothing_on_file: "No immunization information on file",
    reported_only: "Reported by the family — no certificate yet",
    certificate_uploaded: "Certificate uploaded — awaiting Documents review",
    certificate_rejected: "Certificate rejected in review — a new one is needed",
    certificate_expired: "Certificate expired — a current one is needed",
    certificate_accepted_unverified: "Certificate accepted — awaiting Medical verification",
    partially_verified: "Partly verified by Medical",
    verified: "Verified by Medical",
});
