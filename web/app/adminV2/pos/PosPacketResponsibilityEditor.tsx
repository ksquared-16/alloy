"use client";

/**
 * Phase 7 Slice 2 — operator responsibility configuration + live household preview.
 *
 * Meaning-first: the operator sees the meaningful requirements found in the selected forms, a concise
 * responsibility summary per requirement, and a focused editor (applies-to / who / when) in real-world
 * language — never schema ids or raw enums. A live preview (same projection seam as the runtime) shows
 * how work lands for two guardians across two children, with a completion summary + blocking validation.
 *
 * Emits the configured rules + launch-blocked state up to the composer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Ref {
    form_definition_id: string;
    section_id?: string | null;
    field_id?: string | null;
}
interface Responsibility {
    applies_to: string;
    responsible_party: { kind: string; role?: string; person_id?: string };
    satisfied_by: string;
}
interface RequirementDTO {
    ref: Ref;
    requirement_key: string;
    type: string;
    type_label: string;
    label: string;
    required: boolean;
    informational_only: boolean;
    configurable: boolean;
    source_form: { id: string; name: string | null };
    source_section: { id: string; title: string | null } | null;
    recommended: Responsibility;
    recommended_summary: string;
    options: {
        applies_to: Array<{ value: string; label: string }>;
        responsible_party: Array<{ kind: string; label: string }>;
        satisfied_by: Array<{ value: string; label: string }>;
    };
}
interface PreviewGuardian {
    person_id: string;
    label: string;
    view: Array<{ label: string; type: string; scope_key: string; child_id: string | null; state: string }>;
}
interface PreviewResult {
    launch_blocked: boolean;
    validation: Array<{ code: string; label: string; message: string; blocking: boolean }>;
    household: { guardians: Array<{ person_id: string; label: string }>; children: Array<{ id: string; label: string }> };
    guardians: PreviewGuardian[];
    summary: { total_required: number; complete: number; remaining: number; blocking_issues: number; warnings: number };
}

export interface ResponsibilityRulePayload extends Responsibility {
    ref: Ref;
}

const SATISFY_BY_SCOPE: Record<string, Array<{ value: string; label: string }>> = {
    child: [
        { value: "one_per_child", label: "Once for each child" },
        { value: "one_participant", label: "One responsible person completes it" },
        { value: "every_assigned_participant", label: "Every responsible person completes it" },
    ],
    document: [
        { value: "one_per_document", label: "Once for each document" },
        { value: "one_participant", label: "One responsible person completes it" },
    ],
    default: [
        { value: "one_participant", label: "One responsible person completes it" },
        { value: "assigned_participant", label: "The assigned person completes it" },
        { value: "every_assigned_participant", label: "Every responsible person completes it" },
    ],
};

function satisfyOptionsFor(scope: string): Array<{ value: string; label: string }> {
    return SATISFY_BY_SCOPE[scope] ?? SATISFY_BY_SCOPE.default;
}

function summarize(resp: Responsibility, opts: RequirementDTO["options"]): string {
    const party = resp.responsible_party.kind === "role" ? `Role: ${resp.responsible_party.role ?? ""}` : opts.responsible_party.find((o) => o.kind === resp.responsible_party.kind)?.label ?? resp.responsible_party.kind;
    const satisfy = satisfyOptionsFor(resp.applies_to).find((o) => o.value === resp.satisfied_by)?.label ?? resp.satisfied_by;
    return `${party} · ${satisfy}`;
}

export default function PosPacketResponsibilityEditor({
    formIds,
    anchor,
    onChange,
}: {
    formIds: string[];
    anchor: { entity_type: string; entity_id: string } | null;
    onChange: (rules: ResponsibilityRulePayload[], launchBlocked: boolean) => void;
}) {
    const [requirements, setRequirements] = useState<RequirementDTO[] | null>(null);
    const [rules, setRules] = useState<Record<string, Responsibility>>({});
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [loadingReq, setLoadingReq] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load enumerated requirements whenever the selected forms change.
    const formKey = formIds.join(",");
    useEffect(() => {
        if (formIds.length === 0) {
            setRequirements(null);
            setRules({});
            return;
        }
        let cancelled = false;
        setLoadingReq(true);
        void (async () => {
            try {
                const res = await fetch(`/api/admin/pos/packets/requirements?form_definition_ids=${encodeURIComponent(formKey)}`, { credentials: "same-origin" });
                const body = (await res.json().catch(() => ({}))) as { data?: { forms: Array<{ requirements: RequirementDTO[] }> } };
                if (cancelled) return;
                const all = (body.data?.forms ?? []).flatMap((f) => f.requirements);
                setRequirements(all);
                // Seed rules from recommended defaults for every configurable requirement.
                setRules((prev) => {
                    const next: Record<string, Responsibility> = {};
                    for (const r of all) {
                        if (!r.configurable) continue;
                        next[r.requirement_key] = prev[r.requirement_key] ?? r.recommended;
                    }
                    return next;
                });
            } catch {
                if (!cancelled) setRequirements([]);
            } finally {
                if (!cancelled) setLoadingReq(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [formKey, formIds.length]);

    // Build the rule payload array from configured requirements.
    const rulePayload = useMemo<ResponsibilityRulePayload[]>(() => {
        const reqByKey = new Map((requirements ?? []).map((r) => [r.requirement_key, r]));
        return Object.entries(rules)
            .map(([key, resp]) => {
                const req = reqByKey.get(key);
                return req ? { ref: req.ref, ...resp } : null;
            })
            .filter((x): x is ResponsibilityRulePayload => !!x);
    }, [rules, requirements]);

    // Live preview (debounced) whenever rules/forms/anchor change.
    useEffect(() => {
        if (formIds.length === 0 || !requirements || requirements.length === 0) {
            setPreview(null);
            return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            void (async () => {
                setPreviewing(true);
                try {
                    const res = await fetch("/api/admin/pos/packets/preview", {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ form_definition_ids: formIds, requirement_responsibilities: rulePayload, ...(anchor ? { anchor } : {}) }),
                    });
                    const body = (await res.json().catch(() => ({}))) as { data?: PreviewResult };
                    setPreview(body.data ?? null);
                    onChange(rulePayload, body.data?.launch_blocked ?? false);
                } catch {
                    setPreview(null);
                } finally {
                    setPreviewing(false);
                }
            })();
        }, 250);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(rulePayload), formKey, anchor?.entity_id]);

    const updateRule = useCallback((key: string, patch: Partial<Responsibility>) => {
        setRules((cur) => {
            const base = cur[key];
            if (!base) return cur;
            const next = { ...base, ...patch };
            // When scope changes, keep satisfaction valid for the new scope.
            if (patch.applies_to) {
                const valid = satisfyOptionsFor(patch.applies_to).map((o) => o.value);
                if (!valid.includes(next.satisfied_by)) next.satisfied_by = valid[0];
            }
            return { ...cur, [key]: next };
        });
    }, []);

    if (formIds.length === 0) return null;

    const configurable = (requirements ?? []).filter((r) => r.configurable);
    const informational = (requirements ?? []).filter((r) => !r.configurable);

    return (
        <div className="space-y-3" data-testid="packet-responsibility">
            <div>
                <div className="text-[10.5px] font-medium text-stone-500">Requirements found</div>
                {loadingReq ? (
                    <div className="mt-1 text-[11px] text-stone-400">Reading the forms…</div>
                ) : (requirements ?? []).length === 0 ? (
                    <div className="mt-1 text-[11px] text-stone-400">No meaningful requirements detected in the selected forms.</div>
                ) : (
                    <ul className="mt-1 space-y-1" data-testid="packet-requirements">
                        {configurable.map((req) => {
                            const resp = rules[req.requirement_key] ?? req.recommended;
                            const isOpen = open[req.requirement_key] ?? false;
                            const previewIssue = preview?.validation.find((v) => v.label === req.label);
                            return (
                                <li key={req.requirement_key} className="rounded border border-stone-200 bg-white" data-testid={`requirement-row-${req.requirement_key}`}>
                                    <button
                                        type="button"
                                        onClick={() => setOpen((o) => ({ ...o, [req.requirement_key]: !isOpen }))}
                                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                                    >
                                        {isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-stone-400" /> : <ChevronRight className="h-3 w-3 shrink-0 text-stone-400" />}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[11.5px] font-medium text-stone-800">{req.label}</span>
                                            <span className="block truncate text-[10px] text-stone-500" data-testid={`requirement-summary-${req.requirement_key}`}>
                                                {req.type_label} · {summarize(resp, req.options)}
                                            </span>
                                        </span>
                                        {previewIssue?.blocking ? (
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="Blocking issue" />
                                        ) : req.required ? (
                                            <span className="shrink-0 rounded bg-stone-100 px-1 py-0.5 text-[8.5px] font-semibold text-stone-500">Required</span>
                                        ) : null}
                                    </button>
                                    {isOpen ? (
                                        <div className="space-y-2 border-t border-stone-100 px-2 py-2" data-testid={`requirement-editor-${req.requirement_key}`}>
                                            <label className="block text-[10px] text-stone-500">
                                                Applies to
                                                <select
                                                    data-testid={`req-applies-${req.requirement_key}`}
                                                    value={resp.applies_to}
                                                    onChange={(e) => updateRule(req.requirement_key, { applies_to: e.target.value })}
                                                    className="mt-0.5 block w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-[11px] text-stone-700"
                                                >
                                                    {req.options.applies_to.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            </label>
                                            <label className="block text-[10px] text-stone-500">
                                                Who completes it
                                                <select
                                                    data-testid={`req-party-${req.requirement_key}`}
                                                    value={resp.responsible_party.kind}
                                                    onChange={(e) => updateRule(req.requirement_key, { responsible_party: e.target.value === "role" ? { kind: "role", role: resp.responsible_party.role ?? "" } : { kind: e.target.value } })}
                                                    className="mt-0.5 block w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-[11px] text-stone-700"
                                                >
                                                    {req.options.responsible_party.map((o) => <option key={o.kind} value={o.kind}>{o.label}</option>)}
                                                </select>
                                            </label>
                                            {resp.responsible_party.kind === "role" ? (
                                                <input
                                                    type="text"
                                                    data-testid={`req-role-${req.requirement_key}`}
                                                    value={resp.responsible_party.role ?? ""}
                                                    onChange={(e) => updateRule(req.requirement_key, { responsible_party: { kind: "role", role: e.target.value } })}
                                                    placeholder="Role name (e.g. Financial contact)"
                                                    className="block w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-[11px] text-stone-700"
                                                />
                                            ) : null}
                                            <label className="block text-[10px] text-stone-500">
                                                When it is complete
                                                <select
                                                    data-testid={`req-satisfy-${req.requirement_key}`}
                                                    value={resp.satisfied_by}
                                                    onChange={(e) => updateRule(req.requirement_key, { satisfied_by: e.target.value })}
                                                    className="mt-0.5 block w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-[11px] text-stone-700"
                                                >
                                                    {satisfyOptionsFor(resp.applies_to).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            </label>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                        {informational.map((req) => (
                            <li key={req.requirement_key} className="rounded border border-dashed border-stone-200 bg-stone-50/50 px-2 py-1.5 text-[10.5px] text-stone-500">
                                {req.label} <span className="text-stone-400">· {req.type_label} (shown to participants)</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {preview ? (
                <div className="rounded border border-alloy-bend-pine/25 bg-white p-2" data-testid="packet-preview">
                    <div className="text-[10.5px] font-semibold text-alloy-midnight">Household preview</div>
                    <div className="mt-0.5 text-[9.5px] text-stone-500">
                        {preview.household.guardians.map((g) => g.label).join(" & ")} · {preview.household.children.length} child{preview.household.children.length === 1 ? "" : "ren"}
                        {previewing ? " · updating…" : ""}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        {preview.guardians.map((g) => (
                            <div key={g.person_id} data-testid={`preview-guardian-${g.person_id}`}>
                                <div className="text-[10px] font-semibold text-stone-700">{g.label}</div>
                                <ul className="mt-0.5 space-y-0.5">
                                    {g.view.filter((v) => v.state !== "complete").slice(0, 8).map((v, i) => (
                                        <li key={i} className="flex items-center gap-1 text-[10px] text-stone-600">
                                            <span className="truncate">{v.label}</span>
                                            {v.child_id ? <span className="shrink-0 text-stone-400">(per child)</span> : null}
                                            {v.state === "either_can_complete" ? <span className="shrink-0 text-[8.5px] text-sky-600">either</span> : v.state === "owned_by_others" ? <span className="shrink-0 text-[8.5px] text-stone-400">other</span> : null}
                                        </li>
                                    ))}
                                    {g.view.filter((v) => v.state !== "complete").length === 0 ? <li className="text-[10px] text-stone-400">Nothing outstanding.</li> : null}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-1.5 text-[10px]" data-testid="preview-summary">
                        <span className="text-stone-600">{preview.summary.total_required} required · {preview.summary.remaining} remaining</span>
                        {preview.launch_blocked ? (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700" data-testid="preview-blocked">
                                <AlertTriangle className="h-3 w-3" /> {preview.summary.blocking_issues} blocking issue{preview.summary.blocking_issues === 1 ? "" : "s"}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-alloy-bend-pine/[0.08] px-1.5 py-0.5 font-semibold text-alloy-bend-pine" data-testid="preview-ok">
                                <CheckCircle2 className="h-3 w-3" /> Ready to launch
                            </span>
                        )}
                        {preview.summary.warnings > 0 ? <span className="text-amber-600">{preview.summary.warnings} warning{preview.summary.warnings === 1 ? "" : "s"}</span> : null}
                    </div>
                    {preview.validation.filter((v) => v.blocking).map((v, i) => (
                        <p key={i} className="mt-1 text-[10px] text-rose-600" data-testid="preview-validation-blocking">{v.message}</p>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
