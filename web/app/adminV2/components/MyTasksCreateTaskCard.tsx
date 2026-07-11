"use client";

/** @deprecated Compatibility layer — Work Items V3 uses WorkItemCreateModal + WorkItemDraftV1 runtime. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminAuth } from "@/contexts/AdminAuthContext";
import OperationalWorkAssigneeSelect from "@/components/admin/opportunity/OperationalWorkAssigneeSelect";
import { minOperationalWorkDatetimeLocalValue } from "@/lib/admin/operationalWork/operationalWorkDateTimeLocal";
import type { MyTasksPresentationLabels } from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import {
    fetchTaskAssistEntitySearch,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

export type MyTasksCreateLinkMode = "general" | "linked";

export type MyTasksCreateLinkedRecord = {
    entity_type: "opportunities";
    entity_id: string;
    label: string;
};

export type MyTasksCreateTaskCardProps = {
    open: boolean;
    presentation: MyTasksPresentationLabels;
    linkMode: MyTasksCreateLinkMode;
    linkedRecord: MyTasksCreateLinkedRecord | null;
    contextPrefill: MyTasksCreateLinkedRecord | null;
    workspaceSiteId: string | null;
    title: string;
    due: string;
    notes: string;
    assignedToUserId: string | null;
    busy: boolean;
    onLinkModeChange: (mode: MyTasksCreateLinkMode) => void;
    onLinkedRecordChange: (record: MyTasksCreateLinkedRecord | null) => void;
    onTitleChange: (value: string) => void;
    onDueChange: (value: string) => void;
    onNotesChange: (value: string) => void;
    onAssignedToUserIdChange: (value: string | null) => void;
    onCreate: () => void;
    onCancel: () => void;
};

const LINK_MODE_BTN =
    "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors";
const LINK_MODE_ACTIVE = "border-alloy-midnight/25 bg-alloy-midnight text-white";
const LINK_MODE_IDLE =
    "border-alloy-stone/25 bg-white text-alloy-midnight/75 hover:border-alloy-stone/35";

export default function MyTasksCreateTaskCard({
    open,
    presentation,
    linkMode,
    linkedRecord,
    contextPrefill,
    workspaceSiteId,
    title,
    due,
    notes,
    assignedToUserId,
    busy,
    onLinkModeChange,
    onLinkedRecordChange,
    onTitleChange,
    onDueChange,
    onNotesChange,
    onAssignedToUserIdChange,
    onCreate,
    onCancel,
}: MyTasksCreateTaskCardProps) {
    const { userId } = useAdminAuth();
    const [recordQuery, setRecordQuery] = useState("");
    const [searchBusy, setSearchBusy] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<TaskAssistEntitySearchCandidate[]>([]);

    const entitySingular = presentation.opportunityEntitySingular;

    useEffect(() => {
        if (!open) {
            setRecordQuery("");
            setCandidates([]);
            setSearchError(null);
            setSearchBusy(false);
        }
    }, [open]);

    useEffect(() => {
        if (linkMode !== "linked" || !linkedRecord) return;
        setRecordQuery(linkedRecord.label);
    }, [linkMode, linkedRecord]);

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
                if (!res.ok || json.ok === false) {
                    throw new Error(json.message || "Search failed.");
                }
                setCandidates(Array.isArray(json.candidates) ? json.candidates : []);
            } catch (e: unknown) {
                setCandidates([]);
                setSearchError((e as Error).message || "Search failed.");
            } finally {
                setSearchBusy(false);
            }
        },
        [workspaceSiteId]
    );

    useEffect(() => {
        if (linkMode !== "linked") return;
        const handle = window.setTimeout(() => {
            void runRecordSearch(recordQuery);
        }, 300);
        return () => window.clearTimeout(handle);
    }, [linkMode, recordQuery, runRecordSearch]);

    const canCreate = useMemo(() => {
        if (!title.trim() || !due.trim()) return false;
        if (linkMode === "linked") return Boolean(linkedRecord?.entity_id);
        return true;
    }, [due, linkMode, linkedRecord?.entity_id, title]);

    if (!open) return null;

    return (
        <div
            className="shrink-0 space-y-3 rounded-xl border border-alloy-stone/18 bg-white p-4 text-[13px] shadow-sm ring-1 ring-alloy-stone/[0.06]"
            data-adminv2-create-task-form="true"
        >
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">New task</p>
                {contextPrefill && linkMode === "linked" && linkedRecord?.entity_id === contextPrefill.entity_id ? (
                    <p className="mt-1 text-[11px] text-alloy-midnight/55">
                        Preselected from your open {entitySingular.toLowerCase()}.
                    </p>
                ) : null}
            </div>

            <div>
                <label
                    htmlFor="adminv2-create-task-title"
                    className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                >
                    What is the task?
                </label>
                <input
                    id="adminv2-create-task-title"
                    type="text"
                    placeholder="Describe the follow-up"
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[13px]"
                    data-adminv2-create-task-title="true"
                />
            </div>

            <fieldset className="space-y-2" data-adminv2-create-task-link-mode="true">
                <legend className="mb-1 block text-[12px] font-medium text-alloy-midnight/80">Record link</legend>
                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        className={`${LINK_MODE_BTN} ${linkMode === "general" ? LINK_MODE_ACTIVE : LINK_MODE_IDLE}`}
                        data-adminv2-create-task-mode="general"
                        onClick={() => {
                            onLinkModeChange("general");
                            onLinkedRecordChange(null);
                            setRecordQuery("");
                            setCandidates([]);
                        }}
                    >
                        General task
                    </button>
                    <button
                        type="button"
                        className={`${LINK_MODE_BTN} ${linkMode === "linked" ? LINK_MODE_ACTIVE : LINK_MODE_IDLE}`}
                        data-adminv2-create-task-mode="linked"
                        onClick={() => onLinkModeChange("linked")}
                    >
                        Link to a {entitySingular.toLowerCase()}
                    </button>
                </div>
            </fieldset>

            {linkMode === "linked" ? (
                <div className="space-y-2" data-adminv2-create-task-record-search="true">
                    <label
                        htmlFor="adminv2-create-task-record-query"
                        className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                    >
                        Search {entitySingular.toLowerCase()}s
                    </label>
                    <input
                        id="adminv2-create-task-record-query"
                        type="search"
                        value={recordQuery}
                        onChange={(e) => {
                            setRecordQuery(e.target.value);
                            if (linkedRecord && e.target.value.trim() !== linkedRecord.label) {
                                onLinkedRecordChange(null);
                            }
                        }}
                        placeholder="Name, family, guardian, or child"
                        className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[13px]"
                        autoComplete="off"
                    />
                    {searchBusy ? (
                        <p className="text-[11px] text-alloy-midnight/50">Searching…</p>
                    ) : null}
                    {searchError ? (
                        <p className="text-[11px] text-red-700/85" role="alert">
                            {searchError}
                        </p>
                    ) : null}
                    {linkedRecord ? (
                        <p className="rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.05] px-2.5 py-2 text-[11px] text-alloy-midnight/75">
                            Selected · <span className="font-medium">{linkedRecord.label}</span>
                        </p>
                    ) : null}
                    {!linkedRecord && candidates.length > 0 ? (
                        <ul
                            className="max-h-40 overflow-y-auto rounded-lg border border-alloy-stone/18 bg-white shadow-sm"
                            data-adminv2-create-task-record-results="true"
                        >
                            {candidates.map((c) => (
                                <li key={c.entity_id}>
                                    <button
                                        type="button"
                                        className="flex w-full flex-col items-start px-2.5 py-2 text-left hover:bg-alloy-stone/[0.04]"
                                        onClick={() => {
                                            onLinkedRecordChange({
                                                entity_type: "opportunities",
                                                entity_id: c.entity_id,
                                                label: c.label,
                                            });
                                            setRecordQuery(c.label);
                                            setCandidates([]);
                                        }}
                                    >
                                        <span className="text-[12px] font-medium text-alloy-midnight/88">{c.label}</span>
                                        {c.subtitle ? (
                                            <span className="text-[10px] text-alloy-midnight/50">{c.subtitle}</span>
                                        ) : null}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {!linkedRecord && recordQuery.trim().length >= 2 && !searchBusy && candidates.length === 0 && !searchError ? (
                        <p className="text-[11px] text-alloy-midnight/50">No matching records.</p>
                    ) : null}
                </div>
            ) : (
                <p className="text-[11px] text-alloy-midnight/55" data-adminv2-create-task-general-hint="true">
                    General tasks are not tied to a specific record.
                </p>
            )}

            <div>
                <label
                    htmlFor="adminv2-create-task-notes"
                    className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                >
                    Details (optional)
                </label>
                <textarea
                    id="adminv2-create-task-notes"
                    rows={2}
                    placeholder="Notes for yourself or the team"
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    className="w-full resize-y rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[12px]"
                    data-adminv2-create-task-notes="true"
                />
            </div>

            <div>
                <label
                    htmlFor="adminv2-create-task-due"
                    className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                >
                    Due date & time
                </label>
                <input
                    id="adminv2-create-task-due"
                    type="datetime-local"
                    value={due}
                    min={minOperationalWorkDatetimeLocalValue()}
                    onChange={(e) => onDueChange(e.target.value)}
                    className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[13px]"
                    data-adminv2-create-task-due="true"
                />
            </div>

            <div>
                <label
                    htmlFor="adminv2-create-task-assignee"
                    className="mb-1 block text-[12px] font-medium text-alloy-midnight/80"
                >
                    Assigned to
                </label>
                <OperationalWorkAssigneeSelect
                    id="adminv2-create-task-assignee"
                    value={assignedToUserId}
                    currentUserId={userId}
                    disabled={busy}
                    onChange={onAssignedToUserIdChange}
                />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                    type="button"
                    disabled={busy || !canCreate}
                    className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                    data-adminv2-create-task-submit="true"
                    onClick={() => void onCreate()}
                >
                    Create task
                </button>
                <button
                    type="button"
                    className="rounded-md border border-alloy-stone/30 px-3 py-1.5 text-[11px] font-semibold"
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
