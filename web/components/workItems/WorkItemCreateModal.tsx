"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import OperationalWorkAssigneeSelect from "@/components/admin/opportunity/OperationalWorkAssigneeSelect";
import WorkItemCreatePreviewPanel from "@/components/workItems/WorkItemCreatePreviewPanel";
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
    applyConversationInput,
    applyDraftMutation,
    beginWorkItemDraft,
    cancelWorkItemCreationSession,
    sessionCanCommit,
    type WorkItemCreationSession,
} from "@/lib/workItems/workItemCreationRuntime";
import {
    applyValidationToWorkItemDraft,
    mutateWorkItemDraft,
    type WorkItemDraftEntity,
    type WorkItemDraftSeed,
    type WorkItemDraftV1,
} from "@/lib/workItems/workItemDraftV1";
import { validateWorkItemDraft } from "@/lib/workItems/validateWorkItemDraft";
import {
    buildClarificationChipsForDraft,
    type WorkItemClarificationChip,
} from "@/lib/workItems/resolveWorkItemConversation";

export type WorkItemCreateModalProps = {
    open: boolean;
    busy: boolean;
    presentation: MyTasksPresentationLabels;
    workspaceSiteId: string | null;
    contextPrefill: WorkItemDraftEntity | null;
    onCommit: (session: WorkItemCreationSession) => Promise<void>;
    onCancel: () => void;
};

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
    const [composerText, setComposerText] = useState("");
    const [recordQuery, setRecordQuery] = useState("");
    const [searchBusy, setSearchBusy] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<TaskAssistEntitySearchCandidate[]>([]);
    const composerRef = useRef<HTMLTextAreaElement>(null);

    const entitySingular = presentation.opportunityEntitySingular;

    useEffect(() => {
        if (!open) {
            setSession(null);
            setComposerText("");
            setRecordQuery("");
            setCandidates([]);
            setSearchError(null);
            return;
        }

        const seed: WorkItemDraftSeed = {
            entry_point: "work_items_create",
            entity: contextPrefill,
        };
        setSession(beginWorkItemDraft({ seed, defaultAssigneeUserId: userId?.trim() || null }));
        setComposerText("");
    }, [contextPrefill, open, userId]);

    useEffect(() => {
        if (open) composerRef.current?.focus();
    }, [open, session?.draft.draft_id]);

    const validation = useMemo(() => {
        if (!session) return { issues: [], blockingIssues: [], canCommit: false };
        return validateWorkItemDraft(session.draft);
    }, [session]);

    const canCommit = session ? sessionCanCommit(session) && !busy : false;

    const refreshSessionDraft = useCallback(
        (nextDraft: WorkItemDraftV1) => {
            const validation = validateWorkItemDraft(nextDraft);
            const draft = applyValidationToWorkItemDraft(nextDraft, validation.issues);
            setSession((prev) =>
                prev ?
                    {
                        ...prev,
                        draft,
                        chips: buildClarificationChipsForDraft(draft, userId),
                    }
                :   prev,
            );
        },
        [userId],
    );


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

    useEffect(() => {
        if (!open || session?.draft.link_mode !== "linked") return;
        const handle = window.setTimeout(() => void runRecordSearch(recordQuery), 300);
        return () => window.clearTimeout(handle);
    }, [open, recordQuery, runRecordSearch, session?.draft.link_mode]);

    const submitConversation = useCallback(() => {
        if (!session) return;
        const text = composerText.trim();
        if (!text) return;
        setSession((prev) => (prev ? applyConversationInput(prev, text, userId) : prev));
        setComposerText("");
    }, [composerText, session, userId]);

    const applyChip = useCallback(
        (chip: WorkItemClarificationChip) => {
            setSession((prev) => (prev ? applyDraftMutation(prev, chip.mutation) : prev));
        },
        [],
    );

    const selectRecord = useCallback((candidate: TaskAssistEntitySearchCandidate) => {
        const entity: WorkItemDraftEntity = {
            type: "opportunities",
            id: candidate.entity_id,
            label: candidate.label,
        };
        setSession((prev) => {
            if (!prev) return prev;
            const withEntity = applyDraftMutation(prev, { kind: "set_entity", entity });
            return applyConversationInput(withEntity, `Link to ${candidate.label}`, userId);
        });
        setRecordQuery(candidate.label);
        setCandidates([]);
    }, [userId]);

    const handleCancel = useCallback(() => {
        setSession((prev) => (prev ? cancelWorkItemCreationSession(prev) : prev));
        onCancel();
    }, [onCancel]);

    const handleCommit = useCallback(async () => {
        if (!session || !canCommit) return;
        await onCommit(session);
    }, [canCommit, onCommit, session]);

    if (!open || !session) return null;

    const showRecordSearch = session.draft.link_mode === "linked";

    return (
        <div
            className="flex min-h-0 flex-1 flex-col rounded-xl border border-alloy-stone/18 bg-white shadow-sm ring-1 ring-alloy-stone/[0.06]"
            data-work-item-create-modal="true"
            data-adminv2-create-task-form="true"
            role="dialog"
            aria-labelledby="work-item-create-title"
        >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-alloy-stone/15 px-4 py-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Create work item</p>
                    <h2 id="work-item-create-title" className="text-[14px] font-semibold text-alloy-midnight">
                        Describe what needs to happen. BOS will help build it.
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={!canCommit || busy}
                        className="rounded-md bg-alloy-juniper px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                        data-adminv2-create-task-submit="true"
                        data-work-item-create-enabled={canCommit ? "true" : "false"}
                        onClick={() => void handleCommit()}
                    >
                        Create work item
                    </button>
                    <button
                        type="button"
                        className="rounded-md border border-alloy-stone/25 p-1.5 text-alloy-midnight/60 hover:bg-alloy-stone/[0.05]"
                        aria-label="Cancel create work item"
                        onClick={handleCancel}
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[2fr_3fr]">
                <section
                    className="flex min-h-0 flex-col border-b border-alloy-stone/15 lg:border-b-0 lg:border-r"
                    data-work-item-create-conversation="true"
                    aria-label="Work item creation conversation"
                >
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
                        {session.turns.map((turn) => (
                            <div
                                key={turn.id}
                                className={`rounded-lg px-3 py-2 text-[12px] leading-snug ${
                                    turn.role === "operator" ?
                                        "ml-6 bg-alloy-juniper/[0.08] text-alloy-midnight/85"
                                    :   "mr-4 border border-alloy-stone/15 bg-alloy-stone/[0.03] text-alloy-midnight/72"
                                }`}
                                data-work-item-conversation-role={turn.role}
                            >
                                {turn.text}
                            </div>
                        ))}

                        {session.chips.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5" data-work-item-clarification-chips="true">
                                {session.chips.map((chip) => (
                                    <button
                                        key={chip.id}
                                        type="button"
                                        className="rounded-full border border-alloy-stone/25 bg-white px-2.5 py-1 text-[10px] font-semibold text-alloy-juniper hover:bg-alloy-juniper/[0.06]"
                                        onClick={() => applyChip(chip)}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {showRecordSearch ? (
                            <div className="space-y-2 rounded-lg border border-alloy-stone/15 bg-white p-3" data-adminv2-create-task-record-search="true">
                                <label htmlFor="work-item-create-record-query" className="text-[11px] font-medium text-alloy-midnight/75">
                                    Search {entitySingular.toLowerCase()}s to link
                                </label>
                                <input
                                    id="work-item-create-record-query"
                                    type="search"
                                    value={recordQuery}
                                    onChange={(e) => setRecordQuery(e.target.value)}
                                    placeholder="Name, family, guardian, or child"
                                    className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[12px]"
                                    autoComplete="off"
                                />
                                {searchBusy ? <p className="text-[10px] text-alloy-midnight/50">Searching…</p> : null}
                                {searchError ? (
                                    <p className="text-[10px] text-red-700/85" role="alert">
                                        {searchError}
                                    </p>
                                ) : null}
                                {session.draft.entity?.label ? (
                                    <p className="rounded-lg border border-alloy-juniper/20 bg-alloy-juniper/[0.05] px-2.5 py-2 text-[10px] text-alloy-midnight/75">
                                        Selected · <span className="font-medium">{session.draft.entity.label}</span>
                                    </p>
                                ) : null}
                                {!session.draft.entity?.id && candidates.length > 0 ? (
                                    <ul className="max-h-36 overflow-y-auto rounded-lg border border-alloy-stone/18" data-adminv2-create-task-record-results="true">
                                        {candidates.map((c) => (
                                            <li key={c.entity_id}>
                                                <button
                                                    type="button"
                                                    className="flex w-full flex-col items-start px-2.5 py-2 text-left hover:bg-alloy-stone/[0.04]"
                                                    onClick={() => selectRecord(c)}
                                                >
                                                    <span className="text-[11px] font-medium text-alloy-midnight/88">{c.label}</span>
                                                    {c.subtitle ? (
                                                        <span className="text-[10px] text-alloy-midnight/50">{c.subtitle}</span>
                                                    ) : null}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="grid gap-2 rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.02] p-3">
                            <label htmlFor="work-item-create-due" className="text-[11px] font-medium text-alloy-midnight/75">
                                Due date & time
                            </label>
                            <input
                                id="work-item-create-due"
                                type="datetime-local"
                                value={session.draft.due_at ? operationalWorkIsoToDatetimeLocal(session.draft.due_at) : ""}
                                min={minOperationalWorkDatetimeLocalValue()}
                                onChange={(e) => {
                                    const iso = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                                    refreshSessionDraft(mutateWorkItemDraft(session.draft, { due_at: iso }));
                                }}
                                className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[12px]"
                                data-adminv2-create-task-due="true"
                            />
                            <label htmlFor="work-item-create-assignee" className="text-[11px] font-medium text-alloy-midnight/75">
                                Assigned to
                            </label>
                            <OperationalWorkAssigneeSelect
                                id="work-item-create-assignee"
                                value={session.draft.assigned_to_user_id ?? null}
                                currentUserId={userId}
                                disabled={busy}
                                onChange={(next) => {
                                    refreshSessionDraft(mutateWorkItemDraft(session.draft, { assigned_to_user_id: next }));
                                }}
                            />
                        </div>
                    </div>

                    <footer className="shrink-0 border-t border-alloy-stone/15 px-4 py-3">
                        <label htmlFor="work-item-create-composer" className="sr-only">
                            Describe the work item
                        </label>
                        <textarea
                            ref={composerRef}
                            id="work-item-create-composer"
                            rows={2}
                            value={composerText}
                            onChange={(e) => setComposerText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    submitConversation();
                                }
                            }}
                            placeholder="Describe the work, due timing, or priority…"
                            className="w-full resize-none rounded-lg border border-alloy-stone/25 px-3 py-2 text-[12px]"
                            data-work-item-create-composer="true"
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                            <p className="text-[10px] text-alloy-midnight/45">Enter to send · Shift+Enter for newline</p>
                            <button
                                type="button"
                                className="rounded-md border border-alloy-stone/25 px-2.5 py-1 text-[10px] font-semibold text-alloy-juniper"
                                onClick={submitConversation}
                            >
                                Update draft
                            </button>
                        </div>
                    </footer>
                </section>

                <section className="min-h-0 p-4" data-work-item-create-preview-pane="true" aria-label="Work item preview">
                    <WorkItemCreatePreviewPanel draft={session.draft} validationIssues={validation.issues} />
                </section>
            </div>
        </div>
    );
}
