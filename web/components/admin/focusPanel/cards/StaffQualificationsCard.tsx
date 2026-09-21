"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import {
    NULL_EMPLOYMENT_SIGNAL,
    type OperationalContext,
} from "@/lib/adminV2/runtime/operationalContext/types";
import type {
    QualificationRequirementLevel,
    QualificationScopeType,
    QualificationStanding,
    QualificationVerificationState,
} from "@/lib/staffQualifications/staffQualificationModel";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

type HeldQualification = {
    id: string;
    qualification_type_id: string;
    issued_on: string | null;
    expires_on: string | null;
    verification_state: QualificationVerificationState;
    supersedes_qualification_id: string | null;
    revoked_at: string | null;
    standing: QualificationStanding;
    days_until_expiry: number | null;
    evidence_count: number;
};

type QualificationType = {
    id: string;
    key: string;
    label: string;
    expiration_expected: boolean;
    evidence_required_default: boolean;
};

type SatisfactionRow = {
    requirement: {
        qualificationTypeId: string;
        level: QualificationRequirementLevel;
        evidenceRequired: boolean;
        provenance: { scopeType: QualificationScopeType; scopeId: string | null; level: QualificationRequirementLevel }[];
    };
    satisfied: boolean;
    reason: "satisfied" | "missing" | "expired" | "not_yet_effective" | "revoked" | "evidence_missing";
};

type CardState = {
    as_of: string;
    types: QualificationType[];
    held: HeldQualification[];
    satisfaction: SatisfactionRow[];
};

/** Operator language for a held qualification's standing on the org's day. */
const STANDING_LABEL: Readonly<Record<QualificationStanding, string>> = {
    valid: "Valid",
    expired: "Expired",
    not_yet_effective: "Not yet effective",
    revoked: "Revoked",
};

/**
 * Why a requirement is unsatisfied, in the operator's words.
 *
 * "Missing" and "expired" send an operator to different places — one to a person who never held
 * the credential, the other to a renewal — so the card carries the distinction the model already
 * drew rather than collapsing both to "not met".
 */
const REASON_LABEL: Readonly<Record<SatisfactionRow["reason"], string>> = {
    satisfied: "Satisfied",
    missing: "Not held",
    expired: "Expired",
    not_yet_effective: "Not yet effective",
    revoked: "Revoked",
    evidence_missing: "Evidence missing",
};

const SCOPE_LABEL: Readonly<Record<QualificationScopeType, string>> = {
    organization: "Organization",
    position: "Position",
    site: "Site",
    assignment_type: "Assignment type",
};

/** The levels that make an unsatisfied requirement worth an operator's attention. */
const ATTENTION_LEVELS: ReadonlySet<QualificationRequirementLevel> = new Set(["required", "enforced"]);

/** Expiry inside this window is "expiring soon" — a warning, not yet a failure. */
const EXPIRY_WARNING_DAYS = 60;

function formatYmd(ymd: string | null): string | null {
    if (!ymd) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
}

/**
 * Staff Qualifications card — "what qualifications does this Staff member hold, what needs
 * attention, and what requirements apply?"
 *
 * ── WHAT IT DELIBERATELY DOES NOT SAY ──
 *
 * There is no Staff Ready / Blocked headline here. Readiness spans more than qualifications, and a
 * card that can only see credentials must not publish a verdict that reads as the whole answer. It
 * reports what it can see: how many applicable requirements are unmet, and which.
 *
 * ── WHY THE DAY COMES FROM THE SERVER ──
 *
 * Every standing on this card — valid, expired, not yet effective — is derived against the
 * ORGANISATION's calendar day, resolved server-side and echoed back as `as_of`. A card that read
 * `new Date()` would tell an operator in one timezone that a credential expired and an operator in
 * another that it had not.
 */
export default function StaffQualificationsCard({ model, context, receded = false, coordination }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [state, setState] = useState<CardState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    useReportPerspective(coordination, "staff_qualifications", expanded ? "focused" : "base");
    useDismissSignal(coordination, "staff_qualifications", () => setExpanded(false));

    const signal = context.employment ?? NULL_EMPLOYMENT_SIGNAL;
    const person = signal.primary ?? signal.people[0] ?? null;
    // The OPEN period. Qualifications hang off an employment, and an ended one is history:
    // recording a credential against it would attach a live fact to a closed relationship.
    const employmentId = person?.employment.current?.id ?? null;

    const load = useCallback(async () => {
        if (!employmentId) {
            setState(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/staff-qualifications?employment_id=${encodeURIComponent(employmentId)}`,
                { credentials: "include" },
            );
            const json = (await res.json()) as Partial<CardState> & { error?: string };
            if (!res.ok) {
                setError(json?.error || "Qualifications could not be read.");
                setState(null);
                return;
            }
            setState({
                as_of: json.as_of ?? "",
                types: json.types ?? [],
                held: json.held ?? [],
                satisfaction: json.satisfaction ?? [],
            });
        } catch {
            setError("Qualifications could not be read.");
            setState(null);
        } finally {
            setLoading(false);
        }
    }, [employmentId]);

    useEffect(() => {
        // Clear FIRST: one person's credentials must not linger for a frame over another's.
        setState(null);
        void load();
    }, [load]);

    const typeLabel = useCallback(
        (typeId: string) => state?.types.find((t) => t.id === typeId)?.label ?? "Qualification",
        [state],
    );

    /**
     * The attention answer — unsatisfied requirements at a level that demands action, plus held
     * qualifications inside the expiry warning window.
     *
     * `suggested` and `recommended` are counted separately and NOT folded in: a suggestion that
     * raised an alarm would train an operator to ignore the alarm.
     */
    const attention = useMemo(() => {
        const rows = state?.satisfaction ?? [];
        const unmet = rows.filter((r) => !r.satisfied && ATTENTION_LEVELS.has(r.requirement.level));
        const advisory = rows.filter((r) => !r.satisfied && !ATTENTION_LEVELS.has(r.requirement.level));
        const expiringSoon = (state?.held ?? []).filter(
            (h) =>
                h.standing === "valid" &&
                h.days_until_expiry != null &&
                h.days_until_expiry >= 0 &&
                h.days_until_expiry <= EXPIRY_WARNING_DAYS,
        );
        return { unmet, advisory, expiringSoon };
    }, [state]);

    const runCommand = useCallback(
        async (actionKey: string, payload: Record<string, unknown>) => {
            if (!person || running) return;
            setRunning(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: actionKey,
                        entity_type: "person",
                        entity_id: person.personId,
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload,
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
                if (!json?.ok) {
                    // A refusal is the domain speaking. Surfaced verbatim.
                    const message =
                        typeof json?.error === "string" ? json.error : json?.error?.message;
                    setError(message || "That qualification change could not be completed.");
                    return;
                }
                // Re-read rather than splicing the row just written: the list and the requirement
                // answer only agree if both come from the same read.
                await load();
            } catch {
                setError("That qualification change could not be completed.");
            } finally {
                setRunning(false);
            }
        },
        [person, running, load],
    );

    if (!model.visible || !person) return null;
    /*
     * NO OPEN EMPLOYMENT, NO CARD. This is a real answer, not a loading state: qualifications are
     * held BY an employment, so a person with none has nowhere for one to hang. Rendering an empty
     * card here would assert a staff relationship that does not exist — the same mistake the
     * Employment card documents for `never_employed`.
     */
    if (!employmentId) return null;

    const unmetCount = attention.unmet.length;
    const statusChip = state
        ? unmetCount > 0
            ? `${unmetCount} unmet`
            : attention.expiringSoon.length > 0
              ? `${attention.expiringSoon.length} expiring`
              : null
        : null;
    const statusTone = unmetCount > 0 ? "blocked" : attention.expiringSoon.length > 0 ? "at-risk" : "neutral";

    const insight = !state
        ? loading
            ? "Reading qualifications…"
            : (error ?? "Qualifications unavailable")
        : state.held.length === 0
          ? "No qualifications recorded"
          : `${state.held.filter((h) => h.standing === "valid").length} valid of ${state.held.length} recorded`;

    const secondary = state
        ? unmetCount > 0
            ? `${unmetCount} required ${unmetCount === 1 ? "qualification is" : "qualifications are"} unmet`
            : attention.advisory.length > 0
              ? `${attention.advisory.length} recommended not held`
              : "All applicable requirements met"
        : null;

    const footerAction = (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setExpanded((v) => !v)}
            data-staff-qualifications-action={expanded ? "collapse" : "expand"}
        >
            {expanded ? "← Back to panel" : "View qualifications"}
        </button>
    );

    return (
        <div
            className="alloy-os-staff-qualifications"
            data-staff-qualifications-card="true"
            data-staff-qualifications-perspective={expanded ? "expanded" : "compact"}
            data-staff-qualifications-as-of={state?.as_of ?? ""}
        >
            <UniversalCard
                title={model.title}
                insight={insight}
                supportingInsight={expanded ? null : secondary}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={statusChip}
                statusTone={statusTone}
                density={expanded ? "expanded" : (model.density ?? "compact")}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {expanded && state ? (
                    <div className="alloy-os-staff-qualifications__expanded" data-staff-qualifications-expanded="true">
                        {error ? (
                            <p className="alloy-os-staff-qualifications__error" data-staff-qualifications-error="true">
                                {error}
                            </p>
                        ) : null}

                        <section data-staff-qualifications-section="held">
                            <h4>Held</h4>
                            {state.held.length === 0 ? (
                                <p data-staff-qualifications-empty="held">Nothing recorded for this employment.</p>
                            ) : (
                                <ul>
                                    {state.held.map((h) => (
                                        <li
                                            key={h.id}
                                            data-staff-qualification-id={h.id}
                                            data-staff-qualification-standing={h.standing}
                                        >
                                            <span data-staff-qualification-label="true">
                                                {typeLabel(h.qualification_type_id)}
                                            </span>
                                            <span data-staff-qualification-status="true">
                                                {STANDING_LABEL[h.standing]}
                                            </span>
                                            <span data-staff-qualification-dates="true">
                                                {[
                                                    formatYmd(h.issued_on) ? `Issued ${formatYmd(h.issued_on)}` : null,
                                                    formatYmd(h.expires_on) ? `Expires ${formatYmd(h.expires_on)}` : null,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ") || "No dates recorded"}
                                            </span>
                                            <span
                                                data-staff-qualification-verification={h.verification_state}
                                            >
                                                {h.verification_state === "verified"
                                                    ? "Verified"
                                                    : h.verification_state === "rejected"
                                                      ? "Rejected"
                                                      : "Unverified"}
                                            </span>
                                            <span data-staff-qualification-evidence-count={h.evidence_count}>
                                                {h.evidence_count === 0
                                                    ? "No evidence"
                                                    : `${h.evidence_count} evidence`}
                                            </span>
                                            {h.verification_state === "unverified" ? (
                                                <button
                                                    type="button"
                                                    disabled={running}
                                                    data-staff-qualification-command="verify"
                                                    onClick={() =>
                                                        void runCommand("staff_qualification.verify", {
                                                            qualification_id: h.id,
                                                            verification_state: "verified",
                                                        })
                                                    }
                                                >
                                                    Verify
                                                </button>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section data-staff-qualifications-section="requirements">
                            <h4>Requirements</h4>
                            {state.satisfaction.length === 0 ? (
                                <p data-staff-qualifications-empty="requirements">
                                    No qualification requirements are configured for this work.
                                </p>
                            ) : (
                                <ul>
                                    {state.satisfaction.map((row) => (
                                        <li
                                            key={row.requirement.qualificationTypeId}
                                            data-staff-requirement-type-id={row.requirement.qualificationTypeId}
                                            data-staff-requirement-level={row.requirement.level}
                                            data-staff-requirement-satisfied={row.satisfied ? "true" : "false"}
                                        >
                                            <span data-staff-requirement-label="true">
                                                {typeLabel(row.requirement.qualificationTypeId)}
                                            </span>
                                            <span data-staff-requirement-status="true">
                                                {REASON_LABEL[row.reason]}
                                            </span>
                                            {/*
                                              * WHY IT APPLIES, carried rather than summarised. A
                                              * requirement an operator cannot explain is one they
                                              * cannot change, and the model already preserved every
                                              * contributing scope for exactly this line.
                                              */}
                                            <span data-staff-requirement-provenance="true">
                                                {row.requirement.provenance
                                                    .map((p) => `${SCOPE_LABEL[p.scopeType]} · ${p.level}`)
                                                    .join(", ")}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                ) : null}
            </UniversalCard>
        </div>
    );
}
