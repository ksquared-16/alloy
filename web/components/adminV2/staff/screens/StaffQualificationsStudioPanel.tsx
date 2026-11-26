"use client";

/**
 * STUDIO → QUALIFICATIONS — what this organization recognises, and where it applies.
 *
 * TWO LISTS ON ONE SURFACE, because they are ONE operator concept. A qualification TYPE is the
 * vocabulary ("CPR Certification"); a REQUIREMENT is the policy that says where holding it matters.
 * Splitting them across two surfaces would make the requirement editor look like a separate product
 * from the types it references, and an operator authoring "CPR required for Lead Teachers" would
 * have to hold both halves in their head across a navigation.
 *
 * ── IT AUTHORS POLICY, IT DOES NOT RECORD FACTS ──
 *
 * Nothing here records that a PERSON holds anything. Held qualifications are facts with dates, and
 * they are recorded through the registered commands on the person's Focus Panel card. Studio
 * configures what the day is made of; it is not a second place to edit a staff record.
 *
 * ── THE SCOPE TARGET IS CHOSEN, NEVER TYPED ──
 *
 * `scope_id` is a real id — a position, a site, an assignment category. Every option here comes from
 * a canonical list, so an operator cannot author a requirement against something that does not
 * exist. The server re-checks org ownership anyway, because a requirement naming another tenant's
 * site would silently never apply, which is worse than an error: it looks configured.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";
import type {
    QualificationRequirementLevel,
    QualificationScopeType,
} from "@/lib/staffQualifications/staffQualificationModel";

type QualificationType = {
    id: string;
    key: string;
    label: string;
    description: string | null;
    category: string | null;
    expiration_expected: boolean;
    default_validity_days: number | null;
    evidence_required_default: boolean;
    is_active: boolean;
    sort_order: number | null;
};

type QualificationRequirement = {
    id: string;
    qualification_type_id: string;
    scope_type: QualificationScopeType;
    scope_id: string | null;
    requirement_level: QualificationRequirementLevel;
    evidence_required: boolean;
    effective_start: string | null;
    effective_end: string | null;
    is_active: boolean;
};

type Position = { id: string; title?: string | null; label?: string | null; name?: string | null };

/**
 * The configured levels, weakest first.
 *
 * `off` is offered because turning a requirement OFF at a narrow scope is how an organization says
 * "not here" without deleting the broad rule that put it everywhere else. Deleting would lose the
 * reason it was ever configured.
 */
const LEVEL_OPTIONS: { value: QualificationRequirementLevel; label: string }[] = [
    { value: "off", label: "Off — does not apply here" },
    { value: "suggested", label: "Suggested" },
    { value: "recommended", label: "Recommended" },
    { value: "required", label: "Required" },
    { value: "enforced", label: "Enforced" },
];

const SCOPE_OPTIONS: { value: QualificationScopeType; label: string }[] = [
    { value: "organization", label: "Everyone in the organization" },
    { value: "position", label: "A position" },
    { value: "site", label: "A site" },
    { value: "assignment_type", label: "An assignment category" },
];

type TypeForm = {
    id: string | null;
    key: string;
    label: string;
    description: string;
    category: string;
    expirationExpected: boolean;
    defaultValidityDays: string;
    evidenceRequiredDefault: boolean;
    isActive: boolean;
};

type RequirementForm = {
    id: string | null;
    qualificationTypeId: string;
    scopeType: QualificationScopeType;
    scopeId: string;
    requirementLevel: QualificationRequirementLevel;
    evidenceRequired: boolean;
    effectiveStart: string;
    effectiveEnd: string;
    isActive: boolean;
};

function emptyTypeForm(): TypeForm {
    return {
        id: null,
        key: "",
        label: "",
        description: "",
        category: "",
        expirationExpected: true,
        defaultValidityDays: "",
        evidenceRequiredDefault: false,
        isActive: true,
    };
}

function emptyRequirementForm(typeId: string): RequirementForm {
    return {
        id: null,
        qualificationTypeId: typeId,
        scopeType: "organization",
        scopeId: "",
        requirementLevel: "required",
        evidenceRequired: false,
        effectiveStart: "",
        effectiveEnd: "",
        isActive: true,
    };
}

function positionLabel(p: Position): string {
    return p.title ?? p.label ?? p.name ?? "Position";
}

export default function StaffQualificationsStudioPanel({
    sites,
    assignmentTypes,
}: {
    sites: { id: string; name: string }[];
    /** Already loaded by the Studio host — the assignment-category scope reads this list. */
    assignmentTypes: { id: string; label?: string | null }[];
}) {
    const [types, setTypes] = useState<QualificationType[] | null>(null);
    const [requirements, setRequirements] = useState<QualificationRequirement[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [typeForm, setTypeForm] = useState<TypeForm | null>(null);
    const [requirementForm, setRequirementForm] = useState<RequirementForm | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            // Inactive types are INCLUDED here and nowhere else: Studio is where an operator
            // retires and revives vocabulary, so it must be able to see what it retired.
            const res = await fetch("/api/admin/staff-qualification-config?include_inactive=true", {
                credentials: "include",
            });
            const json = (await res.json()) as {
                qualification_types?: QualificationType[];
                qualification_requirements?: QualificationRequirement[];
                error?: string;
            };
            if (!res.ok) {
                setError(json?.error || "Qualification configuration could not be read.");
                setTypes([]);
                return;
            }
            setTypes(json.qualification_types ?? []);
            setRequirements(json.qualification_requirements ?? []);
        } catch {
            setError("Qualification configuration could not be read.");
            setTypes([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        // Positions come from the canonical employment vocabulary, not a list this panel owns.
        void (async () => {
            try {
                const res = await fetch("/api/admin/employment-positions", { credentials: "include" });
                const json = (await res.json()) as { positions?: Position[] };
                setPositions(json?.positions ?? []);
            } catch {
                setPositions([]);
            }
        })();
    }, []);

    const typeById = useMemo(
        () => new Map((types ?? []).map((t) => [t.id, t])),
        [types],
    );

    const save = useCallback(
        async (body: Record<string, unknown>) => {
            if (busy) return false;
            setBusy(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/staff-qualification-config", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(body),
                });
                const json = (await res.json()) as { error?: string };
                if (!res.ok) {
                    // A refusal is the server speaking — a capability denial, a duplicate key, a
                    // scope target from another organization. Surfaced, never swallowed.
                    setError(json?.error || "That configuration change was refused.");
                    return false;
                }
                await load();
                return true;
            } catch {
                setError("That configuration change could not be saved.");
                return false;
            } finally {
                setBusy(false);
            }
        },
        [busy, load],
    );

    const scopeOptionsFor = useCallback(
        (scopeType: QualificationScopeType): { value: string; label: string }[] => {
            if (scopeType === "position") return positions.map((p) => ({ value: p.id, label: positionLabel(p) }));
            if (scopeType === "site") return sites.map((s) => ({ value: s.id, label: s.name }));
            if (scopeType === "assignment_type") {
                return assignmentTypes.map((a) => ({ value: a.id, label: a.label ?? "Assignment category" }));
            }
            return [];
        },
        [positions, sites, assignmentTypes],
    );

    const scopeTargetLabel = useCallback(
        (r: QualificationRequirement): string => {
            if (r.scope_type === "organization") return "Everyone";
            const match = scopeOptionsFor(r.scope_type).find((o) => o.value === r.scope_id);
            // An unresolvable target is NAMED as unresolvable rather than hidden. A requirement
            // pointing at something deleted still applies, and an operator must be able to see it.
            return match?.label ?? "Unresolved target";
        },
        [scopeOptionsFor],
    );

    return (
        <div
            className="mx-auto flex w-full max-w-[1240px] flex-col gap-4"
            data-staff-qualifications-studio="true"
        >
            {error ? (
                <WorkspaceCard flat data-qualification-config-error="true">
                    <p className="text-sm text-red-700">{error}</p>
                </WorkspaceCard>
            ) : null}

            <WorkspaceCard data-qualification-config-section="types">
                <div className="flex items-center justify-between">
                    <div>
                        <div className={WS_EYEBROW}>Vocabulary</div>
                        <h2 className="text-base font-semibold">Qualifications we recognise</h2>
                        <p className="text-sm text-slate-600">
                            The credentials, certifications and checks this organization tracks. Recording that a
                            person holds one happens on their Staff record, not here.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                        data-qualification-config-action="new-type"
                        onClick={() => setTypeForm(emptyTypeForm())}
                    >
                        <Plus className="h-4 w-4" strokeWidth={2} />
                        New qualification
                    </button>
                </div>

                {types == null ? (
                    <p className="mt-3 text-sm text-slate-500">Reading configuration…</p>
                ) : types.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500" data-qualification-config-empty="types">
                        Nothing configured yet. Add the first qualification this organization recognises.
                    </p>
                ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                        {types.map((t) => (
                            <li
                                key={t.id}
                                data-qualification-type-id={t.id}
                                data-qualification-type-active={t.is_active ? "true" : "false"}
                                className="flex items-center justify-between rounded-md border px-3 py-2"
                            >
                                <span>
                                    <span className="font-medium">{t.label}</span>
                                    <span className="ml-2 text-xs text-slate-500">{t.key}</span>
                                    {!t.is_active ? (
                                        <span className="ml-2 text-xs text-slate-500">Retired</span>
                                    ) : null}
                                    {t.expiration_expected ? (
                                        <span className="ml-2 text-xs text-slate-500">Expires</span>
                                    ) : null}
                                    {t.evidence_required_default ? (
                                        <span className="ml-2 text-xs text-slate-500">Evidence expected</span>
                                    ) : null}
                                </span>
                                <button
                                    type="button"
                                    className="text-sm underline"
                                    data-qualification-config-action="edit-type"
                                    onClick={() =>
                                        setTypeForm({
                                            id: t.id,
                                            key: t.key,
                                            label: t.label,
                                            description: t.description ?? "",
                                            category: t.category ?? "",
                                            expirationExpected: t.expiration_expected,
                                            defaultValidityDays:
                                                t.default_validity_days == null ? "" : String(t.default_validity_days),
                                            evidenceRequiredDefault: t.evidence_required_default,
                                            isActive: t.is_active,
                                        })
                                    }
                                >
                                    Edit
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {typeForm ? (
                    <form
                        className="mt-4 flex flex-col gap-3 rounded-md border p-3"
                        data-qualification-type-form={typeForm.id ? "edit" : "create"}
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const ok = await save({
                                action: "upsert_type",
                                id: typeForm.id,
                                key: typeForm.key.trim() || null,
                                label: typeForm.label,
                                description: typeForm.description.trim() || null,
                                category: typeForm.category.trim() || null,
                                expiration_expected: typeForm.expirationExpected,
                                default_validity_days:
                                    typeForm.defaultValidityDays.trim() === ""
                                        ? null
                                        : Number(typeForm.defaultValidityDays),
                                evidence_required_default: typeForm.evidenceRequiredDefault,
                                is_active: typeForm.isActive,
                            });
                            if (ok) setTypeForm(null);
                        }}
                    >
                        <label className="text-sm">
                            Name
                            <input
                                className="mt-1 w-full rounded-md border px-2 py-1"
                                data-qualification-type-field="label"
                                value={typeForm.label}
                                onChange={(e) => setTypeForm({ ...typeForm, label: e.target.value })}
                                required
                            />
                        </label>
                        <label className="text-sm">
                            Key
                            <input
                                className="mt-1 w-full rounded-md border px-2 py-1"
                                data-qualification-type-field="key"
                                value={typeForm.key}
                                onChange={(e) => setTypeForm({ ...typeForm, key: e.target.value })}
                                // Blank is allowed on create: the server derives a key from the name.
                                // On an EXISTING type the key is the stable handle other configuration
                                // refers to, so changing it is the operator's deliberate act, never a default.
                                placeholder="Derived from the name when left blank"
                            />
                        </label>
                        <label className="text-sm">
                            Description
                            <input
                                className="mt-1 w-full rounded-md border px-2 py-1"
                                data-qualification-type-field="description"
                                value={typeForm.description}
                                onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                data-qualification-type-field="expiration_expected"
                                checked={typeForm.expirationExpected}
                                onChange={(e) =>
                                    setTypeForm({ ...typeForm, expirationExpected: e.target.checked })
                                }
                            />
                            This qualification expires
                        </label>
                        <label className="text-sm">
                            Default validity (days)
                            <input
                                className="mt-1 w-40 rounded-md border px-2 py-1"
                                data-qualification-type-field="default_validity_days"
                                inputMode="numeric"
                                value={typeForm.defaultValidityDays}
                                onChange={(e) =>
                                    setTypeForm({ ...typeForm, defaultValidityDays: e.target.value })
                                }
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                data-qualification-type-field="evidence_required_default"
                                checked={typeForm.evidenceRequiredDefault}
                                onChange={(e) =>
                                    setTypeForm({ ...typeForm, evidenceRequiredDefault: e.target.checked })
                                }
                            />
                            Expect supporting evidence by default
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                data-qualification-type-field="is_active"
                                checked={typeForm.isActive}
                                onChange={(e) => setTypeForm({ ...typeForm, isActive: e.target.checked })}
                            />
                            In use
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={busy}
                                className="rounded-md border px-3 py-1 text-sm"
                                data-qualification-type-form-action="save"
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                className="rounded-md px-3 py-1 text-sm"
                                data-qualification-type-form-action="cancel"
                                onClick={() => setTypeForm(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                ) : null}
            </WorkspaceCard>

            <WorkspaceCard data-qualification-config-section="requirements">
                <div className="flex items-center justify-between">
                    <div>
                        <div className={WS_EYEBROW}>Policy</div>
                        <h2 className="text-base font-semibold">Where each qualification is required</h2>
                        <p className="text-sm text-slate-600">
                            Requirements combine. A qualification recommended for everyone and required for one
                            position is required for that position — the strongest level that applies wins, and
                            every rule that contributed stays visible on the staff record.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                        data-qualification-config-action="new-requirement"
                        disabled={!types || types.length === 0}
                        onClick={() => setRequirementForm(emptyRequirementForm(types?.[0]?.id ?? ""))}
                    >
                        <Plus className="h-4 w-4" strokeWidth={2} />
                        New requirement
                    </button>
                </div>

                {requirements.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500" data-qualification-config-empty="requirements">
                        No requirements configured. Qualifications can still be recorded — nothing is required of
                        anyone until a rule says so.
                    </p>
                ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                        {requirements.map((r) => (
                            <li
                                key={r.id}
                                data-qualification-requirement-id={r.id}
                                data-qualification-requirement-scope={r.scope_type}
                                data-qualification-requirement-level={r.requirement_level}
                                className="flex items-center justify-between rounded-md border px-3 py-2"
                            >
                                <span>
                                    <span className="font-medium">
                                        {typeById.get(r.qualification_type_id)?.label ?? "Qualification"}
                                    </span>
                                    <span className="ml-2 text-sm text-slate-600">
                                        {LEVEL_OPTIONS.find((o) => o.value === r.requirement_level)?.label ??
                                            r.requirement_level}
                                    </span>
                                    <span className="ml-2 text-sm text-slate-500">{scopeTargetLabel(r)}</span>
                                    {!r.is_active ? (
                                        <span className="ml-2 text-xs text-slate-500">Inactive</span>
                                    ) : null}
                                </span>
                                <button
                                    type="button"
                                    className="text-sm underline"
                                    data-qualification-config-action="edit-requirement"
                                    onClick={() =>
                                        setRequirementForm({
                                            id: r.id,
                                            qualificationTypeId: r.qualification_type_id,
                                            scopeType: r.scope_type,
                                            scopeId: r.scope_id ?? "",
                                            requirementLevel: r.requirement_level,
                                            evidenceRequired: r.evidence_required,
                                            effectiveStart: r.effective_start ?? "",
                                            effectiveEnd: r.effective_end ?? "",
                                            isActive: r.is_active,
                                        })
                                    }
                                >
                                    Edit
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {requirementForm ? (
                    <form
                        className="mt-4 flex flex-col gap-3 rounded-md border p-3"
                        data-qualification-requirement-form={requirementForm.id ? "edit" : "create"}
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const ok = await save({
                                action: "upsert_requirement",
                                id: requirementForm.id,
                                qualification_type_id: requirementForm.qualificationTypeId,
                                scope_type: requirementForm.scopeType,
                                // Organization scope has no target, and sending "" would be a
                                // target that resolves to nothing rather than to everyone.
                                scope_id:
                                    requirementForm.scopeType === "organization"
                                        ? null
                                        : requirementForm.scopeId || null,
                                requirement_level: requirementForm.requirementLevel,
                                evidence_required: requirementForm.evidenceRequired,
                                effective_start: requirementForm.effectiveStart || null,
                                effective_end: requirementForm.effectiveEnd || null,
                                is_active: requirementForm.isActive,
                            });
                            if (ok) setRequirementForm(null);
                        }}
                    >
                        <label className="text-sm">
                            Qualification
                            <AlloySelect
                                testId="qualification-requirement-qualification_type_id"
                                value={requirementForm.qualificationTypeId}
                                onChange={(v) =>
                                    setRequirementForm({ ...requirementForm, qualificationTypeId: v })
                                }
                                options={(types ?? []).map((t) => ({ value: t.id, label: t.label }))}
                            />
                        </label>
                        <label className="text-sm">
                            Applies to
                            <AlloySelect
                                testId="qualification-requirement-scope_type"
                                value={requirementForm.scopeType}
                                onChange={(v) =>
                                    // Changing the axis clears the target: a position id is not a
                                    // site id, and carrying it over would author a rule pointing at
                                    // the wrong kind of thing.
                                    setRequirementForm({
                                        ...requirementForm,
                                        scopeType: v as QualificationScopeType,
                                        scopeId: "",
                                    })
                                }
                                options={SCOPE_OPTIONS}
                            />
                        </label>
                        {requirementForm.scopeType !== "organization" ? (
                            <label className="text-sm">
                                Which one
                                <AlloySelect
                                    testId="qualification-requirement-scope_id"
                                    value={requirementForm.scopeId}
                                    onChange={(v) => setRequirementForm({ ...requirementForm, scopeId: v })}
                                    options={scopeOptionsFor(requirementForm.scopeType)}
                                />
                            </label>
                        ) : null}
                        <label className="text-sm">
                            Level
                            <AlloySelect
                                testId="qualification-requirement-requirement_level"
                                value={requirementForm.requirementLevel}
                                onChange={(v) =>
                                    setRequirementForm({
                                        ...requirementForm,
                                        requirementLevel: v as QualificationRequirementLevel,
                                    })
                                }
                                options={LEVEL_OPTIONS}
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                data-qualification-requirement-field="evidence_required"
                                checked={requirementForm.evidenceRequired}
                                onChange={(e) =>
                                    setRequirementForm({ ...requirementForm, evidenceRequired: e.target.checked })
                                }
                            />
                            Supporting evidence must be attached
                        </label>
                        <div className="flex gap-3">
                            <label className="text-sm">
                                In force from
                                <input
                                    type="date"
                                    className="mt-1 rounded-md border px-2 py-1"
                                    data-qualification-requirement-field="effective_start"
                                    value={requirementForm.effectiveStart}
                                    onChange={(e) =>
                                        setRequirementForm({ ...requirementForm, effectiveStart: e.target.value })
                                    }
                                />
                            </label>
                            <label className="text-sm">
                                Until
                                <input
                                    type="date"
                                    className="mt-1 rounded-md border px-2 py-1"
                                    data-qualification-requirement-field="effective_end"
                                    value={requirementForm.effectiveEnd}
                                    onChange={(e) =>
                                        setRequirementForm({ ...requirementForm, effectiveEnd: e.target.value })
                                    }
                                />
                            </label>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                data-qualification-requirement-field="is_active"
                                checked={requirementForm.isActive}
                                onChange={(e) =>
                                    setRequirementForm({ ...requirementForm, isActive: e.target.checked })
                                }
                            />
                            In use
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={busy}
                                className="rounded-md border px-3 py-1 text-sm"
                                data-qualification-requirement-form-action="save"
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                className="rounded-md px-3 py-1 text-sm"
                                data-qualification-requirement-form-action="cancel"
                                onClick={() => setRequirementForm(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                ) : null}
            </WorkspaceCard>
        </div>
    );
}
