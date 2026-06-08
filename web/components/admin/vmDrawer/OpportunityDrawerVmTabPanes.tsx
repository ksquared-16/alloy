"use client";

import { useCallback, useEffect, useState } from "react";
import EntityDocumentsSection from "@/components/admin/EntityDocumentsSection";
import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";
import { formatDateTime } from "@/lib/adminFormatters";
import { normalizeDocumentRows } from "@/lib/admin/normalizeDocumentRow";
import { opportunityRelatedListPath } from "@/lib/admin/opportunityRelatedApiPaths";
import { takeOpportunityDrawerDocumentsPrefetch, takeOpportunityDrawerActivityPrefetch } from "@/lib/admin/opportunityDrawerTabPrefetch";
import type { DrawerTabKey } from "@/lib/entityPresentation";

function isOpportunityFollowUpOverdue(nextFollowUpAt: unknown): boolean {
    if (nextFollowUpAt == null || nextFollowUpAt === "") return false;
    const t = Date.parse(String(nextFollowUpAt).trim());
    return Number.isFinite(t) && t < Date.now();
}

const DRAWER_SECTION_HEADER_CLASS =
    "text-xs font-semibold tracking-wider text-[#59678b] border-b border-[#e6e8ec] pb-2 mb-4";

type ActivityEventRow = {
    id: string;
    event_type: string;
    occurred_at: string;
    payload?: unknown;
};

type Props = {
    drawerId: string;
    drawerTab: DrawerTabKey;
    record: Record<string, unknown>;
    onSelectTab: (tab: DrawerTabKey) => void;
};

export default function OpportunityDrawerVmTabPanes({
    drawerId,
    drawerTab,
    record,
    onSelectTab,
}: Props) {
    const { canMutate } = useAdminAuth();
    const [followUpNotes, setFollowUpNotes] = useState(String(record.follow_up_notes ?? ""));
    const [notesDirty, setNotesDirty] = useState(false);
    const [notesSaving, setNotesSaving] = useState(false);

    const [documents, setDocuments] = useState<ReturnType<typeof normalizeDocumentRows>>([]);
    const [documentsLoading, setDocumentsLoading] = useState(false);
    const [documentsError, setDocumentsError] = useState<string | null>(null);

    const [activityEvents, setActivityEvents] = useState<ActivityEventRow[] | null>(null);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityError, setActivityError] = useState<string | null>(null);

    useEffect(() => {
        setFollowUpNotes(String(record.follow_up_notes ?? ""));
        setNotesDirty(false);
    }, [drawerId, record.follow_up_notes]);

    const loadDocuments = useCallback(async () => {
        setDocumentsLoading(true);
        setDocumentsError(null);
        const prefetch = takeOpportunityDrawerDocumentsPrefetch(drawerId);
        const snap = prefetch?.documents_snapshot;
        if (snap && !snap.error) {
            setDocuments(snap.documents);
            setDocumentsLoading(false);
            return;
        }
        if (snap?.error) {
            setDocumentsError(snap.error);
            setDocuments([]);
            setDocumentsLoading(false);
            return;
        }
        if (prefetch?.documents) {
            try {
                const result = await prefetch.documents;
                if (!result.error) {
                    setDocuments(result.documents);
                    setDocumentsLoading(false);
                    return;
                }
                setDocumentsError(result.error);
                setDocuments([]);
                setDocumentsLoading(false);
                return;
            } catch {
                /* fall through to network */
            }
        }
        try {
            const res = await fetch(opportunityRelatedListPath(drawerId), {
                credentials: "include",
            });
            const json = (await res.json().catch(() => ({}))) as { documents?: unknown[]; error?: string };
            if (!res.ok) {
                setDocumentsError(json.error ?? "Failed to load documents");
                setDocuments([]);
                return;
            }
            setDocuments(normalizeDocumentRows(json.documents));
        } catch (e) {
            setDocumentsError(e instanceof Error ? e.message : "Failed to load documents");
            setDocuments([]);
        } finally {
            setDocumentsLoading(false);
        }
    }, [drawerId]);

    const loadActivity = useCallback(async () => {
        setActivityLoading(true);
        setActivityError(null);
        const prefetch = takeOpportunityDrawerActivityPrefetch(drawerId);
        const snap = prefetch?.activity_snapshot;
        if (snap && !snap.error) {
            setActivityEvents(snap.events);
            setActivityLoading(false);
            return;
        }
        if (snap?.error) {
            setActivityError(snap.error);
            setActivityEvents(null);
            setActivityLoading(false);
            return;
        }
        if (prefetch?.activity) {
            try {
                const result = await prefetch.activity;
                if (!result.error) {
                    setActivityEvents(result.events);
                    setActivityLoading(false);
                    return;
                }
                setActivityError(result.error);
                setActivityEvents(null);
                setActivityLoading(false);
                return;
            } catch {
                /* fall through to network */
            }
        }
        try {
            const qs = new URLSearchParams({
                entity_type: "opportunities",
                entity_id: drawerId,
                limit: "100",
            });
            const res = await fetch(`/api/admin/activity?${qs.toString()}`, { credentials: "include" });
            const json = (await res.json().catch(() => ({}))) as {
                events?: ActivityEventRow[];
                error?: string;
            };
            if (!res.ok) {
                setActivityError(json.error ?? "Failed to load activity");
                setActivityEvents(null);
                return;
            }
            setActivityEvents(Array.isArray(json.events) ? json.events : []);
        } catch (e) {
            setActivityError(e instanceof Error ? e.message : "Failed to load activity");
            setActivityEvents(null);
        } finally {
            setActivityLoading(false);
        }
    }, [drawerId]);

    useEffect(() => {
        if (drawerTab === "documents") void loadDocuments();
    }, [drawerTab, loadDocuments]);

    useEffect(() => {
        if (drawerTab === "activity") void loadActivity();
    }, [drawerTab, loadActivity]);

    const saveNotes = useCallback(async () => {
        setNotesSaving(true);
        try {
            const res = await fetch(`/api/admin/entity/opportunities/${encodeURIComponent(drawerId)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ follow_up_notes: followUpNotes }),
            });
            if (!res.ok) {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(json.error ?? "Failed to save notes");
            }
            setNotesDirty(false);
        } finally {
            setNotesSaving(false);
        }
    }, [drawerId, followUpNotes]);

    if (drawerTab === "communications") {
        return (
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2 min-h-[22rem] h-[min(72vh,calc(100dvh-15rem))]"
                data-admin-opportunity-comms-panel="true"
                data-drawer-vm-runtime-comms="true"
            >
                <CommunicationsDrawerSection
                    embedded
                    className="min-h-0 flex-1"
                    apiEntityType="opportunities"
                    entityId={drawerId}
                    active
                />
            </div>
        );
    }

    if (drawerTab === "notes") {
        const followUpOverdue = isOpportunityFollowUpOverdue(record.next_follow_up_at);
        const md =
            record.metadata && typeof record.metadata === "object" ?
                (record.metadata as Record<string, unknown>)
            :   null;
        const rawNotes = md && typeof md.notes === "string" ? md.notes.trim() : "";

        return (
            <div className="pt-2 space-y-3" data-drawer-vm-runtime-notes="true">
                <div
                    className={`rounded-lg border border-alloy-stone/[0.1] bg-white/[0.97] p-2.5 shadow-sm ring-1 ring-alloy-stone/[0.06] ${followUpOverdue ? "border-amber-200/75 bg-amber-50/[0.22] ring-amber-100/40" : ""}`}
                >
                    <div className={oppInqEyebrow}>
                        Notes & next step
                        {followUpOverdue ?
                            <span className="ml-2 font-semibold normal-case text-amber-900/85">
                                Follow-up overdue
                            </span>
                        :   null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={!canMutate}
                            onClick={() => {
                                document
                                    .querySelector<HTMLTextAreaElement>('[data-opportunity-notes-follow-up="true"]')
                                    ?.focus();
                            }}
                            className="rounded-md border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight/75 hover:border-alloy-blue/35 hover:text-alloy-blue disabled:opacity-50"
                        >
                            Add note
                        </button>
                        <button
                            type="button"
                            disabled={!canMutate || !notesDirty || notesSaving}
                            onClick={() => void saveNotes()}
                            className="rounded-md border border-alloy-blue/40 bg-alloy-blue px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                            data-opportunity-notes-save="true"
                        >
                            {notesSaving ? "Saving…" : "Save changes"}
                        </button>
                        <button
                            type="button"
                            onClick={() => onSelectTab("activity")}
                            className="rounded-md border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight/75 hover:border-alloy-blue/35 hover:text-alloy-blue"
                        >
                            View activity
                        </button>
                    </div>
                    <textarea
                        data-opportunity-notes-follow-up="true"
                        value={followUpNotes}
                        onChange={(e) => {
                            setFollowUpNotes(e.target.value);
                            setNotesDirty(true);
                        }}
                        rows={3}
                        disabled={!canMutate}
                        placeholder="Add follow-up notes…"
                        className="mt-1.5 w-full resize-none rounded-md border border-alloy-stone/20 bg-white px-2.5 py-2 text-[12px] leading-snug text-alloy-midnight/80 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                    />
                    {rawNotes ?
                        <div className="mt-2.5 rounded-md border border-alloy-stone/15 bg-white px-2.5 py-2">
                            <div className={oppInqEyebrow}>Logged notes (from actions)</div>
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[12px] leading-snug text-alloy-midnight/75">
                                {rawNotes}
                            </pre>
                        </div>
                    :   null}
                </div>
            </div>
        );
    }

    if (drawerTab === "documents") {
        return (
            <div className="pt-2 space-y-3" data-drawer-vm-runtime-documents="true">
                <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                <EntityDocumentsSection
                    documents={documents}
                    loading={documentsLoading}
                    fetchError={documentsError}
                    onRetryFetch={() => void loadDocuments()}
                    uploadEntityType="opportunity"
                    entityId={drawerId}
                    canMutate={!!canMutate}
                    onAfterUpload={() => void loadDocuments()}
                />
            </div>
        );
    }

    if (drawerTab === "activity") {
        return (
            <div className="pt-2 space-y-4" data-drawer-vm-runtime-activity="true">
                <section>
                    <h3 className={DRAWER_SECTION_HEADER_CLASS}>Activity</h3>
                    {activityLoading ?
                        <p className="text-sm text-alloy-midnight/60">Loading activity…</p>
                    : activityError ?
                        <p className="text-sm text-alloy-ember">{activityError}</p>
                    : (activityEvents?.length ?? 0) > 0 ?
                        <ul className="mt-2 space-y-3">
                            {(activityEvents ?? []).map((ev) => {
                                const p = (
                                    ev.payload && typeof ev.payload === "object" ?
                                        ev.payload
                                    :   {}) as Record<string, unknown>;
                                const preview =
                                    p.body_preview != null && String(p.body_preview).trim() ?
                                        String(p.body_preview)
                                    :   null;
                                const act = formatOpportunityActivityTimelineEvent({
                                    event_type: ev.event_type,
                                    payload: p,
                                });
                                return (
                                    <li
                                        key={ev.id}
                                        className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2 text-sm"
                                    >
                                        <div className="font-semibold text-alloy-forge">{act.title}</div>
                                        {act.detail ?
                                            <div className="mt-0.5 text-[13px] font-normal text-alloy-forge/80">
                                                {act.detail}
                                            </div>
                                        :   null}
                                        <div className="mt-0.5 text-[12px] text-alloy-forge/65">
                                            {formatDateTime(ev.occurred_at)} · {act.actorLabel}
                                        </div>
                                        {preview ?
                                            <div className="mt-1.5 text-[13px] text-alloy-forge/85 whitespace-pre-wrap">
                                                {preview}
                                            </div>
                                        :   null}
                                    </li>
                                );
                            })}
                        </ul>
                    :   <p className="text-sm text-alloy-midnight/60">No workflow events yet.</p>}
                </section>
            </div>
        );
    }

    return null;
}
