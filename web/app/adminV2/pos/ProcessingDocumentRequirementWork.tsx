"use client";

/**
 * Processing → Work → Documents → Missing documents (D6): unmet, required document requirements as DERIVED work.
 *
 * Every row is a fresh evaluation by the one Documents evaluator (`GET /api/admin/documents/requirements/work`); nothing
 * is stored, so a row disappears on the next read once accepted evidence is on file or a valid waiver applies, and
 * moves to "Pending review" while a document awaits review. The same rows feed Work Items (source "Documents") and the
 * Focus Panel readiness card. Subjects outside the operator's scope and requirements of a class they are not cleared
 * for are never listed or counted (server-side).
 *
 * Actions: open the record's Documents card (collect, upload or review there), or waive a waivable requirement with a
 * reason — a governed, audited server action the server refuses without `processing.documents.manage`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";
import {
    REQUIREMENT_BLOCKED_ACTION,
    REQUIREMENT_STATE_ACTION,
    REQUIREMENT_STATE_LABEL,
} from "@/lib/documents/requirements/documentRequirementEvaluator";
import type { RequirementWorkRow } from "@/lib/documents/requirements/documentRequirementService";
import { invalidateDocumentLibraries } from "@/lib/documents/library/documentLibraryClient";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import { invalidateDocumentRequirementWork, loadDocumentRequirementWork } from "@/lib/documents/requirements/documentRequirementWorkClient";

import { documentRequirementApi } from "./useDocumentRequirementApi";

const ENTITY_FOR_SUBJECT: Record<string, string> = { household: "customers", person: "persons", child: "customer_members", opportunity: "opportunities" };
const STATES = ["missing", "pending_review", "blocked"] as const;
type StateFilter = (typeof STATES)[number] | "all";

const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export function requirementWorkAction(r: Pick<RequirementWorkRow, "state" | "blocked_reason">): string {
    return r.state === "blocked" && r.blocked_reason ? REQUIREMENT_BLOCKED_ACTION[r.blocked_reason] : REQUIREMENT_STATE_ACTION[r.state];
}

export default function ProcessingDocumentRequirementWork({ onLeaveProcessing }: { onLeaveProcessing?: () => void }) {
    const [rows, setRows] = useState<RequirementWorkRow[] | null>(null);
    const [truncated, setTruncated] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<StateFilter>("all");
    const [selected, setSelected] = useState<string | null>(null);

    const load = useCallback(async (fresh = false) => {
        const r = await loadDocumentRequirementWork({ fresh });
        if (!r.ok) {
            setError(r.error);
            return;
        }
        setError(null);
        setRows(r.rows);
        setTruncated(r.truncated);
    }, []);
    useEffect(() => {
        void load(true);
    }, [load]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const r of rows ?? []) c[r.state] = (c[r.state] ?? 0) + 1;
        return c;
    }, [rows]);
    const visible = (rows ?? []).filter((r) => filter === "all" || r.state === filter);
    const current = (rows ?? []).find((r) => r.id === selected) ?? null;

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden" data-testid="processing-document-requirement-work">
            <aside className="flex w-[38%] min-w-[18rem] flex-col border-r border-stone-200" aria-label="Missing documents">
                <div className="flex flex-wrap gap-1 border-b border-stone-200 p-2" role="tablist" aria-label="Requirement states">
                    {(["all", ...STATES] as const).map((k) => (
                        <button
                            key={k}
                            type="button"
                            role="tab"
                            aria-selected={filter === k}
                            data-testid={`requirement-work-filter-${k}`}
                            onClick={() => setFilter(k)}
                            className={`rounded-full px-2.5 py-1 text-xs ${filter === k ? "bg-alloy-midnight text-white" : "bg-stone-100 text-alloy-midnight/75 hover:bg-stone-200"}`}
                        >
                            {k === "all" ? "All" : REQUIREMENT_STATE_LABEL[k]}
                            <span className="ml-1 tabular-nums opacity-70">{k === "all" ? rows?.length ?? 0 : counts[k] ?? 0}</span>
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {error ? (
                        <div className="p-3 text-sm text-red-700" role="alert">
                            {error}{" "}
                            <button type="button" className="underline" onClick={() => void load(true)}>
                                Retry
                            </button>
                        </div>
                    ) : rows === null ? (
                        <p className="p-3 text-sm text-alloy-midnight/60">Loading requirements…</p>
                    ) : visible.length === 0 ? (
                        <p className="p-3 text-sm text-alloy-midnight/60" data-testid="requirement-work-empty">
                            No missing documents.
                        </p>
                    ) : (
                        <ul>
                            {visible.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        data-testid={`requirement-work-row-${r.requirement_key}-${r.subject_id}`}
                                        onClick={() => setSelected(r.id)}
                                        className={`w-full border-b border-stone-100 px-3 py-2 text-left hover:bg-stone-50 ${selected === r.id ? "bg-stone-100" : ""}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium text-alloy-midnight">{r.requirement_label}</span>
                                            <span className={`shrink-0 text-[11px] ${r.overdue ? "font-semibold text-red-700" : "text-alloy-midnight/55"}`}>
                                                {r.overdue ? "Overdue · " : "Due "}
                                                {fmtDate(r.due_on)}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 text-xs text-alloy-midnight/65">
                                            {r.subject_label} · {r.document_type_label ?? r.document_type_key}
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                                            <span data-testid={`requirement-work-state-${r.requirement_key}-${r.subject_id}`} className="rounded bg-stone-100 px-1.5 py-0.5">
                                                {REQUIREMENT_STATE_LABEL[r.state]}
                                            </span>
                                            <span className="text-alloy-midnight/60">{requirementWorkAction(r)}</span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {truncated ? <p className="p-3 text-[11px] text-alloy-midnight/50">Showing the first rows only.</p> : null}
                </div>
            </aside>
            <section className="min-h-0 flex-1 overflow-y-auto" aria-label="Requirement">
                {current ? (
                    <RequirementWorkPanel
                        key={current.id}
                        row={current}
                        onChanged={() => {
                            invalidateDocumentRequirementWork();
                            invalidateDocumentLibraries();
                            void load(true);
                        }}
                        onLeaveProcessing={onLeaveProcessing}
                    />
                ) : (
                    <p className="p-6 text-sm text-alloy-midnight/60">Choose a missing document to open its record or waive it.</p>
                )}
            </section>
        </div>
    );
}

function RequirementWorkPanel({ row, onChanged, onLeaveProcessing }: { row: RequirementWorkRow; onChanged: () => void; onLeaveProcessing?: () => void }) {
    const focusRecord = useOperatorRecordFocus();
    const [reason, setReason] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const openRecord = async () => {
        const opened = await focusRecord({
            entity_type: ENTITY_FOR_SUBJECT[row.subject_type] ?? row.subject_type,
            entity_id: row.subject_id,
            intent: "durable_record",
            card_focus: { card_key: OPERATOR_FOCUS_CARDS.documents, item_id: row.pending_document_ids[0] ?? null },
        });
        if (!opened) setNotice("That record can't be opened from here.");
        else onLeaveProcessing?.();
    };
    const waive = async () => {
        setBusy(true);
        setNotice(null);
        const r = await documentRequirementApi.grantWaiver({ requirement_id: row.requirement_id, subject_type: row.subject_type, subject_id: row.subject_id, reason: reason.trim() });
        setBusy(false);
        if (!r.ok) {
            setNotice(`Not waived: ${r.error}${r.code ? ` (${r.code})` : ""}`);
            return;
        }
        setNotice("Waived. The requirement no longer needs work.");
        onChanged();
    };

    return (
        <div className="space-y-4 p-5" data-testid="requirement-work-panel">
            <div>
                <h3 className="text-base font-semibold text-alloy-midnight">{row.requirement_label}</h3>
                <p className="text-sm text-alloy-midnight/65">
                    {row.subject_label} · {row.document_type_label ?? row.document_type_key} · {REQUIREMENT_STATE_LABEL[row.state]}
                </p>
                <p className="mt-1 text-sm text-alloy-midnight/80">{requirementWorkAction(row)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={WS_ACTION_PRIMARY} onClick={() => void openRecord()} data-testid="requirement-work-open-record">
                    {row.state === "pending_review" ? "Review on the record" : "Open the record's documents"}
                </button>
            </div>
            {row.waivable ? (
                <div className="rounded-lg border border-stone-200 p-3">
                    <label className="block text-xs font-semibold text-alloy-midnight/70" htmlFor="requirement-waive-reason">
                        Waive for this record (a reason is required and recorded)
                    </label>
                    <textarea
                        id="requirement-waive-reason"
                        className="mt-1 w-full rounded border border-stone-300 p-2 text-sm"
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        data-testid="requirement-work-waive-reason"
                    />
                    <button type="button" className={`mt-2 ${WS_ACTION_SECONDARY}`} disabled={busy || reason.trim().length < 3} onClick={() => void waive()} data-testid="requirement-work-waive">
                        Waive requirement
                    </button>
                </div>
            ) : (
                <p className="text-xs text-alloy-midnight/55">This requirement cannot be waived.</p>
            )}
            {notice ? (
                <p className="text-sm text-alloy-midnight/75" role="status" data-testid="requirement-work-notice">
                    {notice}
                </p>
            ) : null}
        </div>
    );
}
