"use client";

import { useState } from "react";

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
    type OperationalEmploymentPerson,
} from "@/lib/adminV2/runtime/operationalContext/types";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

/**
 * Employment card — "does this person work here, in what capacity, where, and what is the
 * employment state?"
 *
 * ── WHAT THIS CARD IS ──
 *
 * It is the post-drawer home of the presentation that lived in `PersonEmploymentSection`, moved
 * onto the canonical Focus Panel card seam. The content answers the same question in the same
 * order (headline → current period → configured facts → history) because that ordering was the
 * point of the original: the operator gets the answer before any field.
 *
 * ── WHY IT SITS ON A CASE PANEL ──
 *
 * A person has no host Work Unit of its own, so `resolveOperatorFocusTarget` resolves a Person
 * gesture THROUGH the household to its case. The case's Focus Panel is therefore the only
 * surface that composes for that person, and this card reads
 * `context.employment` — a projection of the person-owned composition, carried verbatim.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──
 *
 * No mutation. Add / Edit / End employment are operator capabilities at `/organization/staff`;
 * mounting them here would create a second execution path for one capability. It also never
 * derives employment meaning — `state_label`, `is_staff` and the configured facts all arrive
 * decided by `lib/employment`.
 */
export default function EmploymentCard({ model, context, receded = false, coordination }: Props) {
    const [expanded, setExpanded] = useState(false);

    useReportPerspective(coordination, "employment", expanded ? "focused" : "base");
    useDismissSignal(coordination, "employment", () => setExpanded(false));

    // `undefined`/`null` means the enrichment pass has not composed yet — NOT "nobody is staff".
    // Reading the null signal keeps the card silent instead of asserting an answer it lacks.
    const signal = context.employment ?? NULL_EMPLOYMENT_SIGNAL;
    const people = signal.people;

    if (!model.visible || people.length === 0) return null;

    const lead = signal.primary ?? people[0]!;
    const others = people.filter((p) => p.personId !== lead.personId);

    const footerAction =
        expanded ? (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setExpanded(false)}
                data-employment-action="collapse"
            >
                ← Back to panel
            </button>
        ) : (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setExpanded(true)}
                data-employment-action="expand"
            >
                View employment
            </button>
        );

    return (
        <div
            className="alloy-os-employment"
            data-employment-card="true"
            data-employment-card-perspective={expanded ? "expanded" : "compact"}
        >
            <UniversalCard
                title={model.title}
                insight={model.insight}
                supportingInsight={expanded ? null : model.secondaryInsight}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={model.statusChip}
                statusTone={model.statusTone}
                density={expanded ? "expanded" : (model.density ?? "compact")}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {expanded ? (
                    <div className="alloy-os-employment__expanded" data-employment-expanded="true">
                        <PersonEmployment person={lead} />
                        {others.map((person) => (
                            <PersonEmployment key={person.personId} person={person} />
                        ))}
                    </div>
                ) : null}
            </UniversalCard>
        </div>
    );
}

function formatYmd(ymd: string | null): string {
    if (!ymd) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
}

/** The one sentence the operator actually needs — ported verbatim in meaning. */
function headline(employment: PersonEmploymentComposition): string {
    const current = employment.current;
    if (!current) {
        const last = employment.periods[0];
        if (!last) return "Not staff";
        const role = last.position_label ? ` as ${last.position_label}` : "";
        return `Worked here${role} until ${formatYmd(last.end_date)}`;
    }
    const role = current.position_label ?? "Staff";
    const where = current.primary_location_label ? ` at ${current.primary_location_label}` : "";
    if (current.status === "pending_start") {
        return `${role}${where}, starting ${formatYmd(current.start_date)}`;
    }
    if (current.status === "ending") {
        return `${role}${where}, leaving ${formatYmd(current.end_date)}`;
    }
    return `${role}${where}, since ${formatYmd(current.start_date)}`;
}

function Field({ label, value }: { label: string; value: string | null }) {
    if (!value) return null;
    return (
        <div className="alloy-os-employment__field" data-employment-field={label}>
            <span className="alloy-os-employment__field-label">{label}</span>
            <span className="alloy-os-employment__field-value">{value}</span>
        </div>
    );
}

/** One person's employment, in the order the answer is actually read. */
function PersonEmployment({ person }: { person: OperationalEmploymentPerson }) {
    const employment = person.employment;
    const current = employment.current;
    const history = employment.periods.filter((p) => p.id !== current?.id);

    return (
        <section
            className="alloy-os-employment__person"
            data-employment-person={person.personId}
            data-employment-state={employment.is_staff ? "active" : "ended"}
            aria-label={`Employment — ${person.personLabel ?? "person"}`}
        >
            <div className="alloy-os-employment__person-head">
                <p className="alloy-os-employment__person-name">{person.personLabel ?? "—"}</p>
                {current ? (
                    <span
                        className="alloy-os-employment__state-chip"
                        data-employment-status={current.status}
                    >
                        {current.state_label}
                    </span>
                ) : null}
            </div>

            <p className="alloy-os-employment__headline">{headline(employment)}</p>

            {current ? (
                <div className="alloy-os-employment__fields">
                    <Field label="Position" value={current.position_label} />
                    <Field label="Type" value={current.employment_type_label} />
                    <Field label="Primary location" value={current.primary_location_label} />
                    <Field label="Start date" value={formatYmd(current.start_date)} />
                    {current.end_date ? <Field label="Last day" value={formatYmd(current.end_date)} /> : null}
                    <Field label="Employee ID" value={current.external_employee_id} />
                </div>
            ) : null}

            {employment.configured_facts.length > 0 ? (
                <div className="alloy-os-employment__facts" data-employment-configured-facts="true">
                    {employment.configured_facts.map((f) => (
                        <Field key={f.field_key} label={f.label} value={f.display || "—"} />
                    ))}
                </div>
            ) : null}

            {history.length > 0 ? (
                <div className="alloy-os-employment__history">
                    <p className="alloy-os-employment__field-label">Employment history</p>
                    <ul>
                        {history.map((p) => (
                            <li key={p.id} className="alloy-os-employment__history-row">
                                {p.position_label ? `${p.position_label} · ` : ""}
                                {formatYmd(p.start_date)} – {formatYmd(p.end_date)}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}
