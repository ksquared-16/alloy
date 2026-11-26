"use client";

import { ListChecks, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DocumentTypeSummary } from "@/lib/documents/configuration/documentConfigurationService";
import type { DocumentRequirementSummary, DocumentRequirementVersion } from "@/lib/documents/requirements/documentRequirementConfigService";
import {
    BUSINESS_PROCESS_SCOPE_SUBJECT_TYPES,
    documentRequirementDraftProblems,
    REQUIREMENT_SUBJECT_TYPES,
    type DocumentRequirementDraft,
    type RequirementProblem,
    type RequirementSubjectType,
} from "@/lib/documents/requirements/documentRequirementPolicy";

import { documentRequirementApi } from "./useDocumentRequirementApi";

/**
 * Studio → Documents → Requirements (D6). Which documents the organization requires, for whom, when, and whether a
 * requirement may be waived.
 *
 * Requirements are versioned like types: edits go to a draft, the server validates it (against the PUBLISHED Studio
 * type: it must exist and accept the subject), and only a published version applies — to readiness, the Documents work
 * queue, Work Items and Business Process. Archiving stops a requirement applying and keeps its history and waivers.
 *
 * Every action is a server route gated by `processing.documents.manage` (reads: `documents.read`); a refused write
 * surfaces the server's code.
 */

const SUBJECT_LABEL: Record<RequirementSubjectType, string> = {
    household: "Household",
    person: "Adult (parent / guardian)",
    child: "Child",
    opportunity: "Enrollment case",
};
const PROBLEM_TEXT: Record<string, string> = {
    label_required: "Give the requirement a name.",
    form_evidence_shape: "The completed-forms setting is not understood.",
    form_evidence_field_unknown: "The completed-forms setting has an unknown field.",
    form_evidence_forms_shape: "Choose between one and ten forms.",
    form_evidence_form_unknown: "One of the chosen forms is not an active form of this organization.",
    form_evidence_acceptance_unknown: "Choose whether a completed form needs review.",
    form_evidence_type_not_accepted: "The Completed form document type does not accept this kind of record.",
    subject_type_unsupported: "Choose who the requirement applies to.",
    document_type_not_published: "Choose a published, active document type.",
    subject_type_not_accepted_by_type: "That document type is not filed for this kind of record.",
    scope_kind_unknown: "Choose where the requirement applies.",
    scope_field_unknown: "The scope has an unsupported setting.",
    scope_process_required: "Name the Business Process (its key).",
    scope_stage_keys_shape: "Stage keys are lowercase keys separated by commas (up to 20).",
    scope_grain_unsupported: "A Business Process scope applies to a child, household or enrollment case.",
    timing_kind_unknown: "Choose when it is due.",
    timing_days_range: "Enter a whole number of days from 1 to 365.",
    timing_field_unknown: "The timing has an unsupported setting.",
    effective_range_inverted: "The end date is before the start date.",
    requirement_duplicate: "Another live requirement already covers this type, record and scope.",
};

const EMPTY: DocumentRequirementDraft = {
    label: "",
    description: null,
    document_type_key: "",
    subject_type: "child",
    scope: { kind: "all" },
    timing: { kind: "immediate" },
    policy: "required",
    waivable: false,
    effective_from: null,
    effective_until: null,
    form_evidence: null,
};

function draftFrom(v: DocumentRequirementVersion | null | undefined): DocumentRequirementDraft {
    if (!v) return { ...EMPTY };
    return {
        label: v.label,
        description: v.description ?? null,
        document_type_key: v.document_type_key,
        subject_type: v.subject_type,
        scope: v.scope,
        timing: v.timing,
        policy: v.policy,
        waivable: v.waivable,
        effective_from: v.effective_from,
        effective_until: v.effective_until,
        form_evidence: v.form_evidence ?? null,
    };
}

const INPUT = "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-[13px] shadow-sm focus:border-alloy-bend-pine/40 focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/15";
const BTN = "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/70 disabled:opacity-50";
const PRIMARY = "rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50";

export function describeScope(d: Pick<DocumentRequirementDraft, "scope">): string {
    if (d.scope.kind === "all") return "Every record";
    const stages = d.scope.stage_keys?.length ? ` at ${d.scope.stage_keys.join(", ")}` : "";
    return `In ${d.scope.process_key}${stages}`;
}
export function describeTiming(d: Pick<DocumentRequirementDraft, "timing">): string {
    return d.timing.kind === "immediate" ? "Due immediately" : `Due within ${d.timing.days} days`;
}

export default function ProcessingDocumentRequirementsStudio({ types }: { types: DocumentTypeSummary[] }) {
    const [requirements, setRequirements] = useState<DocumentRequirementSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const reload = useCallback(async () => {
        setLoading(true);
        const r = await documentRequirementApi.list();
        if (r.ok) {
            setRequirements(r.data.requirements);
            setError(null);
        } else setError(r.error);
        setLoading(false);
    }, []);
    useEffect(() => {
        void reload();
    }, [reload]);

    const typeLabel = useMemo(() => new Map(types.map((t) => [t.key, t.published?.label ?? t.key])), [types]);

    if (error) {
        return (
            <div className="m-6 rounded-xl border border-alloy-stone/20 p-6 text-center" role="alert">
                <p className="text-[13px] font-medium text-alloy-midnight/75">Couldn&apos;t load the document requirements</p>
                <p className="mt-1 text-[12px] text-alloy-midnight/50">{error}</p>
                <button type="button" className={`mt-4 ${BTN}`} onClick={() => void reload()}>
                    Retry
                </button>
            </div>
        );
    }
    if (selected || creating) {
        return (
            <RequirementEditor
                requirementId={selected}
                types={types}
                onClose={() => {
                    setSelected(null);
                    setCreating(false);
                    void reload();
                }}
                onCreated={(id) => {
                    setCreating(false);
                    setSelected(id);
                }}
            />
        );
    }
    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" data-testid="documents-studio-requirements">
            <div className="flex items-center gap-3">
                <p className="text-[12px] text-alloy-midnight/60">
                    Published requirements drive document readiness, the Documents work queue, Work Items and Business Process readiness.
                </p>
                <button type="button" onClick={() => setCreating(true)} className={`ml-auto inline-flex items-center gap-1 ${PRIMARY}`} data-testid="documents-studio-new-requirement">
                    <Plus className="h-3.5 w-3.5" aria-hidden /> New requirement
                </button>
            </div>
            {loading && requirements.length === 0 ? (
                <p className="mt-6 text-[12px] text-alloy-midnight/50">Loading…</p>
            ) : requirements.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-alloy-stone/25 p-8 text-center" data-testid="documents-studio-requirements-empty">
                    <ListChecks className="mx-auto h-6 w-6 text-alloy-midnight/30" aria-hidden />
                    <p className="mt-2 text-[13px] text-alloy-midnight/70">No document requirements yet.</p>
                </div>
            ) : (
                <ul className="mt-4 divide-y divide-alloy-stone/10 rounded-xl border border-alloy-stone/15">
                    {requirements.map((r) => {
                        const v = r.published ?? r.open_draft;
                        return (
                            <li key={r.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelected(r.id)}
                                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-alloy-stone/5"
                                    data-testid={`documents-studio-requirement-${r.key}`}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-semibold text-alloy-midnight">{v?.label ?? r.key}</span>
                                        {v ? (
                                            <span className="block text-[12px] text-alloy-midnight/55">
                                                {typeLabel.get(v.document_type_key) ?? v.document_type_key} · {SUBJECT_LABEL[v.subject_type]} · {describeScope(v)} · {describeTiming(v)} ·{" "}
                                                {v.policy === "required" ? "Required" : "Optional"}
                                                {v.waivable ? " · Waivable" : ""}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        {r.status === "archived" ? "Archived" : r.published ? `Published v${r.published.version_number}` : "Draft only"}
                                        {r.open_draft && r.published ? ` · draft v${r.open_draft.version_number}` : ""}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function RequirementEditor({
    requirementId,
    types,
    onClose,
    onCreated,
}: {
    requirementId: string | null;
    types: DocumentTypeSummary[];
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [identity, setIdentity] = useState<{ id: string; key: string; status: "active" | "archived"; published_version_id: string | null } | null>(null);
    const [versions, setVersions] = useState<DocumentRequirementVersion[]>([]);
    const [draft, setDraft] = useState<DocumentRequirementDraft>({ ...EMPTY });
    const [newKey, setNewKey] = useState("");
    const [stageText, setStageText] = useState("");
    const [problems, setProblems] = useState<RequirementProblem[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const published = types.filter((t) => t.status === "active" && t.published);
    // D8: the organization's active forms, for "also satisfied by completed forms".
    const [forms, setForms] = useState<Array<{ key: string; name: string }>>([]);
    useEffect(() => {
        let live = true;
        void fetch("/api/admin/forms", { credentials: "include" })
            .then((r) => r.json())
            .then((j: { data?: Array<{ key?: string; name?: string }> } | Array<{ key?: string; name?: string }>) => {
                const rows = Array.isArray(j) ? j : (j.data ?? []);
                if (live) setForms(rows.filter((f): f is { key: string; name: string } => typeof f.key === "string").map((f) => ({ key: f.key, name: f.name ?? f.key })));
            })
            .catch(() => live && setForms([]));
        return () => {
            live = false;
        };
    }, []);
    const typeGrains = published.find((t) => t.key === draft.document_type_key)?.published?.subject_types ?? null;

    const load = useCallback(async () => {
        if (!requirementId) return;
        const r = await documentRequirementApi.get(requirementId);
        if (!r.ok) {
            setMessage(`Could not load (${r.code ?? r.status}).`);
            return;
        }
        setIdentity(r.data.requirement);
        setVersions(r.data.versions);
        const open = r.data.versions.find((v) => v.status === "draft" || v.status === "validated");
        const current = r.data.versions.find((v) => v.status === "published");
        const d = draftFrom(open ?? current);
        setDraft(d);
        setStageText(d.scope.kind === "business_process" ? (d.scope.stage_keys ?? []).join(", ") : "");
        setProblems(open?.validation_errors ?? []);
    }, [requirementId]);
    useEffect(() => {
        void load();
    }, [load]);

    const open = versions.find((v) => v.status === "draft" || v.status === "validated") ?? null;
    const current = versions.find((v) => v.status === "published") ?? null;
    const set = <K extends keyof DocumentRequirementDraft>(k: K, v: DocumentRequirementDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
    const localProblems = documentRequirementDraftProblems(draft, { typeSubjectTypes: draft.document_type_key ? typeGrains : null, duplicate: false });

    function withStages(d: DocumentRequirementDraft): DocumentRequirementDraft {
        if (d.scope.kind !== "business_process") return d;
        const keys = stageText.split(",").map((s) => s.trim()).filter(Boolean);
        return { ...d, scope: { kind: "business_process", process_key: d.scope.process_key, ...(keys.length ? { stage_keys: keys } : {}) } };
    }

    async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; code?: string | null }>) {
        setBusy(true);
        setMessage(null);
        const r = await fn();
        setBusy(false);
        setMessage(r.ok ? label : `Not done: ${r.error ?? "refused"}${r.code ? ` (${r.code})` : ""}`);
        if (r.ok) await load();
    }

    async function save() {
        const body = withStages(draft);
        if (!requirementId) {
            setBusy(true);
            const r = await documentRequirementApi.create({ ...body, ...(newKey.trim() ? { key: newKey.trim() } : {}) });
            setBusy(false);
            if (!r.ok) return setMessage(`Not created: ${r.error}${r.code ? ` (${r.code})` : ""}`);
            onCreated(r.data.requirement_id);
            return;
        }
        setBusy(true);
        const r = await documentRequirementApi.saveDraft(requirementId, body);
        setBusy(false);
        if (!r.ok) return setMessage(`Not saved: ${r.error}${r.code ? ` (${r.code})` : ""}`);
        setProblems(r.data.problems);
        setMessage(`Draft v${r.data.version_number} saved.`);
        await load();
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="documents-studio-requirement-editor">
            <div className="flex flex-wrap items-center gap-2 border-b border-alloy-stone/12 px-5 py-3">
                <button type="button" className={BTN} onClick={onClose}>
                    ← Requirements
                </button>
                <span className="text-[13px] font-semibold text-alloy-midnight">{identity?.key ?? "New requirement"}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className={BTN} disabled={busy} onClick={save} data-testid="documents-studio-requirement-save">
                        Save draft
                    </button>
                    <button
                        type="button"
                        className={BTN}
                        disabled={busy || !open || !requirementId}
                        onClick={() =>
                            run("Validated.", async () => {
                                const r = await documentRequirementApi.validate(requirementId!, open!.id);
                                if (r.ok) setProblems(r.data.problems);
                                return r.ok ? { ok: true } : { ok: false, error: r.error, code: r.code };
                            })
                        }
                        data-testid="documents-studio-requirement-validate"
                    >
                        Validate
                    </button>
                    <button
                        type="button"
                        className={PRIMARY}
                        disabled={busy || open?.status !== "validated"}
                        onClick={() => run("Published.", () => documentRequirementApi.publish(requirementId!, open!.id, current?.id ?? null))}
                        data-testid="documents-studio-requirement-publish"
                    >
                        Publish
                    </button>
                    {identity ? (
                        <button
                            type="button"
                            className={BTN}
                            disabled={busy}
                            onClick={() => run(identity.status === "active" ? "Archived." : "Re-activated.", () => documentRequirementApi.setStatus(identity.id, identity.status === "active" ? "archive" : "activate"))}
                            data-testid="documents-studio-requirement-archive"
                        >
                            {identity.status === "active" ? "Archive" : "Re-activate"}
                        </button>
                    ) : null}
                    {identity && !identity.published_version_id ? (
                        <button
                            type="button"
                            className={BTN}
                            disabled={busy}
                            onClick={async () => {
                                const r = await documentRequirementApi.remove(identity.id);
                                if (r.ok) onClose();
                                else setMessage(`Not deleted: ${r.error}${r.code ? ` (${r.code})` : ""}`);
                            }}
                            data-testid="documents-studio-requirement-delete"
                        >
                            Delete
                        </button>
                    ) : null}
                </div>
            </div>
            {message ? (
                <p className="px-5 pt-3 text-[12px] text-alloy-midnight/70" role="status" data-testid="documents-studio-requirement-message">
                    {message}
                </p>
            ) : null}
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4 lg:grid-cols-2">
                {!requirementId ? (
                    <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                        Key
                        <input className={INPUT} value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="derived from the name if empty" data-testid="documents-studio-requirement-key" />
                    </label>
                ) : null}
                <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                    Name
                    <input className={INPUT} value={draft.label} onChange={(e) => set("label", e.target.value)} data-testid="documents-studio-requirement-label" />
                </label>
                <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                    Document type (published types only)
                    <select className={INPUT} value={draft.document_type_key} onChange={(e) => set("document_type_key", e.target.value)} data-testid="documents-studio-requirement-type">
                        <option value="">Choose…</option>
                        {published.map((t) => (
                            <option key={t.key} value={t.key}>
                                {t.published?.label ?? t.key}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                    Required for
                    <select className={INPUT} value={draft.subject_type} onChange={(e) => set("subject_type", e.target.value as RequirementSubjectType)} data-testid="documents-studio-requirement-subject">
                        {REQUIREMENT_SUBJECT_TYPES.map((s) => (
                            <option key={s} value={s} disabled={typeGrains !== null && !typeGrains.includes(s)}>
                                {SUBJECT_LABEL[s]}
                                {typeGrains !== null && !typeGrains.includes(s) ? " (not accepted by this type)" : ""}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                    Applies to
                    <select
                        className={INPUT}
                        value={draft.scope.kind}
                        onChange={(e) => set("scope", e.target.value === "all" ? { kind: "all" } : { kind: "business_process", process_key: "enrollment_process" })}
                        data-testid="documents-studio-requirement-scope"
                    >
                        <option value="all">Every record of that kind</option>
                        <option value="business_process" disabled={!BUSINESS_PROCESS_SCOPE_SUBJECT_TYPES.includes(draft.subject_type)}>
                            Records in a Business Process
                        </option>
                    </select>
                </label>
                {draft.scope.kind === "business_process" ? (
                    <>
                        <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                            Business Process key
                            <input
                                className={INPUT}
                                value={draft.scope.process_key}
                                onChange={(e) => set("scope", { kind: "business_process", process_key: e.target.value.trim() })}
                                data-testid="documents-studio-requirement-process"
                            />
                        </label>
                        <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                            Only at these stages (optional, comma-separated keys)
                            <input className={INPUT} value={stageText} onChange={(e) => setStageText(e.target.value)} data-testid="documents-studio-requirement-stages" />
                        </label>
                    </>
                ) : null}
                <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                    Due
                    <select
                        className={INPUT}
                        value={draft.timing.kind}
                        onChange={(e) => set("timing", e.target.value === "immediate" ? { kind: "immediate" } : { kind: "within_days", days: 14 })}
                        data-testid="documents-studio-requirement-timing"
                    >
                        <option value="immediate">Immediately</option>
                        <option value="within_days">Within a number of days</option>
                    </select>
                </label>
                {draft.timing.kind === "within_days" ? (
                    <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                        Days (from when the record enters scope)
                        <input
                            type="number"
                            className={INPUT}
                            value={draft.timing.days}
                            onChange={(e) => set("timing", { kind: "within_days", days: Number(e.target.value) })}
                            data-testid="documents-studio-requirement-days"
                        />
                    </label>
                ) : null}
                <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                    Policy
                    <select className={INPUT} value={draft.policy} onChange={(e) => set("policy", e.target.value === "optional" ? "optional" : "required")} data-testid="documents-studio-requirement-policy">
                        <option value="required">Required (creates work and blocks readiness)</option>
                        <option value="optional">Optional (shown, never blocks)</option>
                    </select>
                </label>
                <label className="flex items-center gap-2 text-[12px] font-semibold text-alloy-midnight/70">
                    <input type="checkbox" checked={draft.waivable} onChange={(e) => set("waivable", e.target.checked)} data-testid="documents-studio-requirement-waivable" />
                    May be waived for a record (with a reason, by a Documents administrator)
                </label>
                <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                    Effective from (optional)
                    <input type="date" className={INPUT} value={draft.effective_from ?? ""} onChange={(e) => set("effective_from", e.target.value || null)} data-testid="documents-studio-requirement-from" />
                </label>
                <label className="block text-[12px] font-semibold text-alloy-midnight/70">
                    Effective until (optional)
                    <input type="date" className={INPUT} value={draft.effective_until ?? ""} onChange={(e) => set("effective_until", e.target.value || null)} data-testid="documents-studio-requirement-until" />
                </label>
                <fieldset className="lg:col-span-2 rounded-lg border border-alloy-stone/15 p-3" data-testid="documents-studio-requirement-forms">
                    <legend className="px-1 text-[12px] font-semibold text-alloy-midnight/70">Also satisfied by completed forms (optional)</legend>
                    {forms.length === 0 ? (
                        <p className="text-[12px] text-alloy-midnight/55">No active forms.</p>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            {forms.map((f) => {
                                const chosen = draft.form_evidence?.form_keys.includes(f.key) ?? false;
                                return (
                                    <label key={f.key} className="flex items-center gap-1.5 text-[12px]">
                                        <input
                                            type="checkbox"
                                            checked={chosen}
                                            data-testid={`documents-studio-requirement-form-${f.key}`}
                                            onChange={(e) => {
                                                const keys = new Set(draft.form_evidence?.form_keys ?? []);
                                                if (e.target.checked) keys.add(f.key);
                                                else keys.delete(f.key);
                                                set("form_evidence", keys.size ? { form_keys: [...keys], acceptance: draft.form_evidence?.acceptance ?? "review" } : null);
                                            }}
                                        />
                                        {f.name}
                                    </label>
                                );
                            })}
                        </div>
                    )}
                    {draft.form_evidence ? (
                        <label className="mt-2 block text-[12px] font-semibold text-alloy-midnight/70">
                            A completed form
                            <select
                                className={INPUT}
                                value={draft.form_evidence.acceptance}
                                onChange={(e) => set("form_evidence", { form_keys: draft.form_evidence!.form_keys, acceptance: e.target.value === "submitted" ? "submitted" : "review" })}
                                data-testid="documents-studio-requirement-form-acceptance"
                            >
                                <option value="review">needs a review before it counts (recommended)</option>
                                <option value="submitted">counts once it is submitted (no review)</option>
                            </select>
                        </label>
                    ) : null}
                </fieldset>
                <div className="lg:col-span-2">
                    {(problems.length ? problems : localProblems).length === 0 ? (
                        open?.status === "validated" ? (
                            <p className="text-[12px] text-alloy-bend-pine" data-testid="documents-studio-requirement-valid">
                                Validated — ready to publish.
                            </p>
                        ) : null
                    ) : (
                        <ul className="space-y-1" data-testid="documents-studio-requirement-problems">
                            {(problems.length ? problems : localProblems).map((p) => (
                                <li key={`${p.field}:${p.code}`} className="text-[12px] text-red-700">
                                    {PROBLEM_TEXT[p.code] ?? p.code}
                                </li>
                            ))}
                        </ul>
                    )}
                    {versions.length ? (
                        <ul className="mt-3 space-y-1 text-[12px] text-alloy-midnight/60" data-testid="documents-studio-requirement-versions">
                            {versions.map((v) => (
                                <li key={v.id}>
                                    v{v.version_number} · {v.status}
                                    {v.published_at ? ` · published ${v.published_at.slice(0, 10)}` : ""}
                                    {v.superseded_at ? ` · superseded ${v.superseded_at.slice(0, 10)}` : ""}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
