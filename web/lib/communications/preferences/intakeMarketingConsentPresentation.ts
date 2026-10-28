/**
 * The intake's marketing-consent evidence, in an operator's words — on the Processing case.
 *
 * Communications owns the meaning: what the family answered on the form, under which wording, and what
 * Approve did with it against the person's canonical preference. Pure: it reads the case's own record
 * (`metadata.marketing_consent`) and never consults or writes `communication_preferences`. An answer that
 * was not given is said as such — never presented as consent.
 */
import type { IntakeMarketingConsentCommitOutcome, IntakeMarketingConsentRecord } from "./intakeMarketingConsentRecord";

export type IntakeMarketingConsentLine = {
    channel: "email" | "sms";
    /** What the family answered on the form. */
    answered: string;
    /** What Approve did with it; null before Approve. */
    applied: string | null;
};

export type IntakeMarketingConsentPresentation = {
    capturedAt: string;
    languageVersion: string | null;
    lines: IntakeMarketingConsentLine[];
    /** Pending: Approve has not committed the evidence; nothing has been written to the person. */
    committed: boolean;
};

const CHANNEL_WORD = { email: "Email news", sms: "Text news" } as const;

const OUTCOME_WORDS: Record<IntakeMarketingConsentCommitOutcome["outcome"], string> = {
    opted_in: "Recorded as opted in",
    already_opted_in: "Already opted in — unchanged",
    preserved_opt_out: "Not applied — the person had opted out; the opt-out stands",
    skipped_unset: "Nothing recorded — no consent given",
    failed: "Could not be recorded — Approve will retry",
};

export function presentIntakeMarketingConsent(record: IntakeMarketingConsentRecord | null): IntakeMarketingConsentPresentation | null {
    if (!record) return null;
    const outcomes = record.committed?.outcomes ?? [];
    return {
        capturedAt: record.captured_at,
        languageVersion: record.language?.version ?? null,
        committed: Boolean(record.committed),
        lines: (["email", "sms"] as const).map((channel) => {
            const answered =
                record.response === "absent"
                    ? `${CHANNEL_WORD[channel]}: no answer sent — treated as no`
                    : `${CHANNEL_WORD[channel]}: ${record.choices[channel] ? "yes" : "no"}`;
            const outcome = outcomes.find((o) => o.channel === channel);
            return { channel, answered, applied: outcome ? OUTCOME_WORDS[outcome.outcome] : null };
        }),
    };
}
