"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import {
    IntakeWorkspaceHubView,
    intakeWorkspaceBtnPrimary,
    type IntakeWorkspaceFormRow,
    type IntakeWorkspacePacketRow,
    type IntakeWorkspaceSessionRow,
    type IntakeWorkspaceSubmissionRow,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { opMetadata, opOrientationSurface } from "@/lib/operational/ui/operationalVisualTokens";
import { sortSubmissionsByActivity } from "@/lib/forms/submissionOperationalNarrative";
import { FORMS_SUBMISSIONS_API_PATH } from "@/lib/forms/intakeRuntimeTestFixtures";

type FormRow = IntakeWorkspaceFormRow & {
    key: string;
    kind: string;
    is_active: boolean;
    updated_at: string | null;
    created_at: string;
};

type PacketSessionRow = {
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    form_packet_definitions?: { name: string } | { name: string }[] | null;
};

function packetSessionName(row: PacketSessionRow): string {
    const def = row.form_packet_definitions;
    if (Array.isArray(def)) return def[0]?.name ?? "Packet session";
    return def?.name ?? "Packet session";
}

function sortSessionsForReview(rows: PacketSessionRow[]): IntakeWorkspaceSessionRow[] {
    const priority = (s: PacketSessionRow) => {
        if (s.status === "completed") return 0;
        if (s.status === "in_progress") return 1;
        return 2;
    };
    return [...rows]
        .sort((a, b) => priority(a) - priority(b) || b.created_at.localeCompare(a.created_at))
        .map((s) => ({
            id: s.id,
            status: s.status,
            created_at: s.created_at,
            packet_name: packetSessionName(s),
        }));
}

export default function FormsHubClient() {
    const router = useRouter();
    const viewerTz = useAdminViewerTimezone();
    const { canMutate, orgId: activeOrgId } = useAdminAuth();

    const [forms, setForms] = useState<IntakeWorkspaceFormRow[]>([]);
    const [sessions, setSessions] = useState<IntakeWorkspaceSessionRow[]>([]);
    const [packets, setPackets] = useState<IntakeWorkspacePacketRow[]>([]);
    const [submissions, setSubmissions] = useState<IntakeWorkspaceSubmissionRow[]>([]);
    const [apiFetchMeta, setApiFetchMeta] = useState<{ apiOrgId: string | null; apiUrl: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [createBusy, setCreateBusy] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);
    const [nfName, setNfName] = useState("");
    const [nfDesc, setNfDesc] = useState("");
    const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
    const [nfKind, setNfKind] = useState<"center" | "state">("center");
    const [nfCategory, setNfCategory] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [formsRes, sessionsRes, packetsRes, subRes] = await Promise.all([
                fetch("/api/admin/forms", { credentials: "include" }),
                fetch("/api/admin/forms/packet-sessions", { credentials: "include" }),
                fetch("/api/admin/forms/packet-definitions", { credentials: "include" }),
                fetch(FORMS_SUBMISSIONS_API_PATH, { credentials: "include" }),
            ]);

            const formsJson = await formsRes.json().catch(() => ({}));
            const sessionsJson = await sessionsRes.json().catch(() => ({}));
            const packetsJson = await packetsRes.json().catch(() => ({}));
            const subJson = await subRes.json().catch(() => ({}));

            if (!formsRes.ok) throw new Error((formsJson as { error?: string }).error ?? "Failed to load forms");
            if (!subRes.ok) {
                throw new Error((subJson as { error?: string }).error ?? "Failed to load submissions");
            }

            const formRows = (formsJson as { data?: FormRow[] }).data ?? [];
            setForms(formRows);
            setSessions(
                sessionsRes.ok ?
                    sortSessionsForReview((sessionsJson as { data?: PacketSessionRow[] }).data ?? [])
                    : []
            );
            setPackets(
                packetsRes.ok ?
                    ((packetsJson as { data?: IntakeWorkspacePacketRow[] }).data ?? [])
                        .filter((p) => p.is_active !== false)
                        .map((p) => ({ id: p.id, name: p.name }))
                    : []
            );
            const mapped = sortSubmissionsByActivity(
                ((subJson as { data?: IntakeWorkspaceSubmissionRow[] }).data ?? []).map((r) => ({
                    id: r.id,
                    status: r.status,
                    created_at: r.created_at,
                    submitted_at: r.submitted_at,
                    form_definition_id: r.form_definition_id,
                    person_id: r.person_id,
                    customer_id: r.customer_id,
                    customer_member_id: r.customer_member_id,
                    opportunity_id: r.opportunity_id,
                    payload: r.payload,
                }))
            );
            setSubmissions(mapped);
            setApiFetchMeta({
                apiOrgId: subRes.headers.get("X-Admin-Org-Id"),
                apiUrl: FORMS_SUBMISSIONS_API_PATH,
            });
        } catch (e) {
            setError((e as Error).message);
            setForms([]);
            setSessions([]);
            setPackets([]);
            setSubmissions([]);
            setApiFetchMeta(null);
        } finally {
            setLoading(false);
        }
    }, [activeOrgId]);

    useEffect(() => {
        void load();
    }, [load]);

    const submitCreate = async () => {
        if (!canMutate) return;
        setCreateBusy(true);
        setCreateErr(null);
        try {
            const res = await fetch("/api/admin/forms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: nfName.trim(),
                    description: nfDesc.trim() || null,
                    ...(showAdvancedCreate ? { kind: nfKind } : {}),
                    ...(showAdvancedCreate && nfCategory.trim() ? { admin_category: nfCategory.trim() } : {}),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not create form");
            const id = (json as { data?: { id: string } }).data?.id;
            if (!id) throw new Error("Missing id");
            setShowCreate(false);
            setNfName("");
            setNfDesc("");
            setNfCategory("");
            setShowAdvancedCreate(false);
            router.push(`${ADMIN_FORMS_UI_BASE}/${id}`);
        } catch (e) {
            setCreateErr((e as Error).message);
        } finally {
            setCreateBusy(false);
        }
    };

    const createPanel = useMemo(
        () => (
            <div className={opOrientationSurface} data-testid="intake-create-form-panel">
                <p className={clsx("mb-3", opMetadata)}>New form definition — opens in the form workspace after save.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm sm:col-span-2">
                        <span className={opMetadata}>Name</span>
                        <input
                            className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm shadow-sm"
                            value={nfName}
                            onChange={(e) => setNfName(e.target.value)}
                            placeholder="Waitlist intake"
                        />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                        <span className={opMetadata}>Description (optional)</span>
                        <input
                            className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm shadow-sm"
                            value={nfDesc}
                            onChange={(e) => setNfDesc(e.target.value)}
                        />
                    </label>
                </div>
                <details
                    className="mt-3 rounded-lg border border-alloy-midnight/10 bg-white/60 px-3 py-2"
                    open={showAdvancedCreate}
                    onToggle={(e) => setShowAdvancedCreate((e.target as HTMLDetailsElement).open)}
                    data-testid="intake-create-form-advanced"
                >
                    <summary className="cursor-pointer text-sm font-medium text-alloy-midnight/80">Advanced settings</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                            <span className={opMetadata}>Kind (internal)</span>
                            <select
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm"
                                value={nfKind}
                                onChange={(e) => setNfKind(e.target.value as "center" | "state")}
                            >
                                <option value="center">Center</option>
                                <option value="state">State</option>
                            </select>
                        </label>
                        <label className="space-y-1">
                            <span className={opMetadata}>Category (internal label)</span>
                            <input
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2 text-sm"
                                value={nfCategory}
                                onChange={(e) => setNfCategory(e.target.value)}
                            />
                        </label>
                    </div>
                    <p className={clsx("mt-2", opMetadata)}>Not required for website inquiry or enrollment lead forms.</p>
                </details>
                {createErr ?
                    <p className="mt-2 text-sm text-alloy-ember">{createErr}</p>
                    : null}
                <PrimaryButton
                    type="button"
                    className="!mt-3 !px-3 !py-2 text-sm"
                    disabled={createBusy}
                    onClick={() => void submitCreate()}
                >
                    {createBusy ? "Creating…" : "Create and open"}
                </PrimaryButton>
            </div>
        ),
        [nfName, nfDesc, nfKind, nfCategory, createErr, createBusy, showAdvancedCreate]
    );

    return (
        <IntakeWorkspaceHubView
            viewerTz={viewerTz}
            forms={forms}
            sessions={sessions}
            packets={packets}
            submissions={submissions}
            loading={loading}
            error={error}
            canMutate={canMutate}
            showCreate={showCreate}
            onToggleCreate={() => setShowCreate((v) => !v)}
            createPanel={createPanel}
            onRefresh={() => void load()}
            activeOrgId={activeOrgId}
            apiFetchMeta={apiFetchMeta}
        />
    );
}
