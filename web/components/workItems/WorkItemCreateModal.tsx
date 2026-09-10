"use client";

/**
 * Create Work Item — centered dialog.
 *
 * A manual work item is subject CREATION, not an action against an already-selected subject, so it
 * does not belong in the detail pane: the previous surface replaced the selected work item's detail
 * with a two-column conversation/preview form, which cost the operator their place in the queue and
 * read as "configure an operational task record" rather than "create a piece of work".
 *
 * The fields here are exactly the ones that survive `draftToOperationalTaskBody` into
 * `operational_tasks`. Priority, tags, category, checklist, recurrence and follow-on exist on
 * WorkItemDraftV1 but are never persisted by the commit adapter, so offering them would promise the
 * operator state the platform then drops on the floor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import OperationalWorkAssigneeSelect from "@/components/admin/opportunity/OperationalWorkAssigneeSelect";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    minOperationalWorkDatetimeLocalValue,
    operationalWorkIsoToDatetimeLocal,
} from "@/lib/admin/operationalWork/operationalWorkDateTimeLocal";
import type { MyTasksPresentationLabels } from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import {
    fetchTaskAssistEntitySearch,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
import {
    beginWorkItemDraft,
    cancelWorkItemCreationSession,
    sessionCanCommit,
    type WorkItemCreationSession,
} from "@/lib/workItems/workItemCreationRuntime";
import {
    applyValidationToWorkItemDraft,
    mutateWorkItemDraft,
    type WorkItemDraftEntity,
    type WorkItemDraftPatch,
    type WorkItemDraftSeed,
} from "@/lib/workItems/workItemDraftV1";
import { validateWorkItemDraft } from "@/lib/workItems/validateWorkItemDraft";

export type WorkItemCreateModalProps = {
    open: boolean;
    busy: boolean;
    presentation: MyTasksPresentationLabels;
    workspaceSiteId: string | null;
    contextPrefill: WorkItemDraftEntity | null;
    onCommit: (session: WorkItemCreationSession) => Promise<void>;
    onCancel: () => void;
};

const FIELD_LABEL = "block text-[11px] font-semibold text-alloy-midnight/62";
const FIELD_INPUT =
    "mt-1 w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-[12px] text-alloy-midnight/88 shadow-sm placeholder:text-alloy-midnight/35 focus:border-alloy-juniper/45 focus:outline-none focus:ring-2 focus:ring-alloy-juniper/15";

export default function WorkItemCreateModal({
    open,
    busy,
    presentation,
    workspaceSiteId,
    contextPrefill,
    onCommit,
    onCancel,
}: WorkItemCreateModalProps) {
    const { userId } = useAdminAuth();
    const [session, setSession] = useState<WorkItemCreationSession | null>(null);
    const [recordQuery, setRecordQuery] = useState("");
    const [searchBusy, setSearchBusy] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<TaskAssistEntitySearchCandidate[]>([]);
    const [showIssues, setShowIssues] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);

    const entitySingular = presentation.opportunityEntitySingular;

    useEffect(() => {
        if (!open) {
            setSession(null);
            setRecordQuery("");
            setCandidates([]);
            setSearchError(null);
            setShowIssues(false);
            return;
        }

        const seed: WorkItemDraftSeed = {
            entry_point: "work_items_create",
            entity: contextPrefill,
        };
        setSession(beginWorkItemDraft({ seed, defaultAssigneeUserId: userId?.trim() || null }));
        setRecordQuery(contextPrefill?.label ?? "");
    }, [contextPrefill, open, userId]);

    useEffect(() => {
        if (open) titleRef.current?.focus();
    }, [open, session?.draft.draft_id]);

    const validation = useMemo(() => {
        if (!session) return { issues: [], blockingIssues: [], canCommit: false };
        return validateWorkItemDraft(session.draft);
    }, [session]);

    const canCommit = session ? sessionCanCommit(session) && !busy : false;

    /** Single write path for every field: patch → validate → stamp issues back onto the draft. */
    const patchDraft = useCallback((patch: WorkItemDraftPatch) => {
        setSession((prev) => {
            if (!prev) return prev;
            const next = mutateWorkItemDraft(prev.draft, patch);
            const result = validateWorkItemDraft(next);
            return { ...prev, draft: applyValidationToWorkItemDraft(next, result.issues) };
        });
    }, []);

    const runRecordSearch = useCallback(
        async (q: string) => {
            const trimmed = q.trim();
            if (trimmed.length < 2) {
                setCandidates([]);
                setSearchError(null);
                return;
            }
            setSearchBusy(true);
            setSearchError(null);
            try {
                const res = await fetchTaskAssistEntitySearch({
                    q: trimmed,
                    entity_type: "opportunities",
                    limit: 8,
                    include_customers: true,
                    workspace_site_id: workspaceSiteId,
                });
                const json = await readJson<{
                    ok?: boolean;
                    candidates?: TaskAssistEntitySearchCandidate[];
                    message?: string;
                }>(res);
                if (!res.ok || json.ok === false) throw new Error(json.message || "Search failed.");
                setCandidates(Array.isArray(json.candidates) ? json.candidates : []);
            } catch (e: unknown) {
                setCandidates([]);
                setSearchError((e as Error).message || "Search failed.");
            } finally {
                setSearchBusy(false);
            }
        },
        [workspaceSiteId],
    );

    const linked = session?.draft.link_mode === "linked";
    const selectedEntityLabel = session?.draft.entity?.label ?? null;

    useEffect(() => {
        if (!open || !linked) return;
        // Once a record is chosen the query box holds its label; re-searching it would reopen the list.
        if (selectedEntityLabel && recordQuery === selectedEntityLabel) return;
        const handle = window.setTimeout(() => void runRecordSearch(recordQuery), 300);
        return () => window.clearTimeout(handle);
    }, [linked, open, recordQuery, runRecordSearch, selectedEntityLabel]);

    const selectRecord = useCallback((candidate: TaskAssistEntitySearchCandidate) => {
        // Canonical identity only — the label is display, `entity_id` is the link.
        patchDraft({
            entity: { type: "opportunities", id: candidate.entity_id, label: candidate.label },
        });
        setRecordQuery(candidate.label);
        setCandidates([]);
    }, [patchDraft]);

    const handleCancel = useCallback(() => {
        setSession((prev) => (prev ? cancelWorkItemCreationSession(prev) : prev));
        onCancel();
    }, [onCancel]);

    const handleCommit = useCallback(async () => {
        if (!session) return;
        if (!canCommit) {
            setShowIssues(true);
            return;
        }
        await onCommit(session);
    }, [canCommit, onCommit, session]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                handleCancel();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [handleCancel, open]);

    if (!open || !session) return null;

    const draft = session.draft;
    const issueFor = (field: string) =>
        showIssues ? validation.blockingIssues.find((i) => i.field === field)?.message ?? null : null;

    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center p-4"
            data-work-item-create-overlay="true"
        >
            <button
                type="button"
                aria-label="Cancel create work item"
                tabIndex={-1}
                className="absolute inset-0 cursor-default bg-alloy-midnight/25 backdrop-blur-[1px]"
                onClick={handleCancel}
            />
            <div
                className="relative flex max-h-full w-full max-w-[30rem] flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white shadow-xl ring-1 ring-alloy-midnight/[0.06]"
                data-work-item-create-modal="true"
                data-adminv2-create-task-form="true"
                role="dialog"
                aria-modal="true"
                aria-labelledby="work-item-create-title"
            >
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-alloy-stone/15 px-5 py-3.5">
                    <h2 id="work-item-create-title" className="text-[14px] font-semibold text-alloy-midnight">
                        Create work item
                    </h2>
                    <button
                        type="button"
                        className="-mr-1.5 rounded-md p-1.5 text-alloy-midnight/50 hover:bg-alloy-stone/[0.07] hover:text-alloy-midnight/80"
                        aria-label="Cancel create work item"
                        onClick={handleCancel}
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                </header>

                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
                    <div>
                        <label className={FIELD_LABEL} htmlFor="work-item-create-title-input">
                            What needs to happen?
                        </label>
                        <input
                            id="work-item-create-title-input"
                            ref={titleRef}
                            type="text"
                            value={draft.title}
                            placeholder="Call the Rivera family about the tour"
                            className={FIELD_INPUT}
                            data-work-item-create-field="title"
                            onChange={(e) => patchDraft({ title: e.target.value })}
                        />
                        {issueFor("title") ? (
                            <p className="mt-1 text-[10.5px] text-alloy-clay">{issueFor("title")}</p>
                        ) : null}
                    </div>

                    <div>
                        <label className={FIELD_LABEL} htmlFor="work-item-create-record">
                            Related {entitySingular.toLowerCase()}{" "}
                            <span className="font-normal text-alloy-midnight/40">— optional</span>
                        </label>
                        {draft.entity?.id ? (
                            <div
                                className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-alloy-juniper/25 bg-alloy-juniper/[0.05] px-3 py-2"
                                data-work-item-create-linked-record="true"
                            >
                                <span className="truncate text-[12px] font-medium text-alloy-midnight/85">
                                    {draft.entity.label ?? "Linked record"}
                                </span>
                                <button
                                    type="button"
                                    className="shrink-0 text-[11px] font-semibold text-alloy-juniper hover:underline"
                                    onClick={() => {
                                        patchDraft({ entity: null, link_mode: "general" });
                                        setRecordQuery("");
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                        ) : (
                            <>
                                <input
                                    id="work-item-create-record"
                                    type="search"
                                    value={recordQuery}
                                    placeholder="Search family, guardian, or child…"
                                    className={FIELD_INPUT}
                                    data-work-item-create-field="entity"
                                    onFocus={() => {
                                        if (draft.link_mode !== "linked") patchDraft({ link_mode: "linked" });
                                    }}
                                    onChange={(e) => setRecordQuery(e.target.value)}
                                />
                                {searchBusy ? (
                                    <p className="mt-1 text-[10.5px] text-alloy-midnight/45">Searching…</p>
                                ) : null}
                                {searchError ? (
                                    <p className="mt-1 text-[10.5px] text-alloy-clay">{searchError}</p>
                                ) : null}
                                {candidates.length > 0 ? (
                                    <ul
                                        className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-alloy-stone/20 bg-white shadow-sm"
                                        data-work-item-create-candidates="true"
                                    >
                                        {candidates.map((c) => (
                                            <li key={c.entity_id}>
                                                <button
                                                    type="button"
                                                    className="block w-full truncate px-3 py-2 text-left text-[12px] text-alloy-midnight/80 hover:bg-alloy-juniper/[0.06]"
                                                    onClick={() => selectRecord(c)}
                                                >
                                                    {c.label}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        <div>
                            <label className={FIELD_LABEL} htmlFor="work-item-create-assignee">
                                Assignee
                            </label>
                            <div className="mt-1" data-work-item-create-field="assigned_to_user_id">
                                <OperationalWorkAssigneeSelect
                                    id="work-item-create-assignee"
                                    value={draft.assigned_to_user_id ?? ""}
                                    onChange={(next) => patchDraft({ assigned_to_user_id: next || null })}
                                />
                            </div>
                            {issueFor("assigned_to_user_id") ? (
                                <p className="mt-1 text-[10.5px] text-alloy-clay">
                                    {issueFor("assigned_to_user_id")}
                                </p>
                            ) : null}
                        </div>

                        <div>
                            <label className={FIELD_LABEL} htmlFor="work-item-create-due">
                                Due
                            </label>
                            <input
                                id="work-item-create-due"
                                type="datetime-local"
                                value={operationalWorkIsoToDatetimeLocal(draft.due_at ?? "")}
                                min={minOperationalWorkDatetimeLocalValue()}
                                className={FIELD_INPUT}
                                data-work-item-create-field="due_at"
                                onChange={(e) => {
                                    const v = e.target.value;
                                    patchDraft({ due_at: v ? new Date(v).toISOString() : undefined });
                                }}
                            />
                            {issueFor("due_at") ? (
                                <p className="mt-1 text-[10.5px] text-alloy-clay">{issueFor("due_at")}</p>
                            ) : null}
                        </div>
                    </div>

                    <div>
                        <label className={FIELD_LABEL} htmlFor="work-item-create-notes">
                            Notes <span className="font-normal text-alloy-midnight/40">— optional</span>
                        </label>
                        <textarea
                            id="work-item-create-notes"
                            rows={3}
                            value={draft.description ?? ""}
                            placeholder="Anything the assignee needs to know."
                            className={`${FIELD_INPUT} resize-none`}
                            data-work-item-create-field="description"
                            onChange={(e) => patchDraft({ description: e.target.value })}
                        />
                    </div>
                </div>

                <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-alloy-stone/15 bg-alloy-stone/[0.02] px-5 py-3">
                    <button
                        type="button"
                        className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-alloy-midnight/60 hover:bg-alloy-stone/[0.07]"
                        onClick={handleCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        className="rounded-lg bg-alloy-juniper px-4 py-1.5 text-[11.5px] font-semibold text-white shadow-sm hover:bg-alloy-juniper/92 disabled:opacity-45"
                        data-adminv2-create-task-submit="true"
                        data-work-item-create-enabled={canCommit ? "true" : "false"}
                        onClick={() => void handleCommit()}
                    >
                        {busy ? "Creating…" : "Create work item"}
                    </button>
                </footer>
            </div>
        </div>
    );
}
