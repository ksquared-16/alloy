"use client";

/**
 * Layout V2 Proof — /adminV2/layout-proof
 *
 * Shows what a configured Lead drawer/queue WOULD look like: a work-unit-style
 * Lead list, and — on click — a drawer-shell that visually mirrors the staging
 * opportunity drawer (header, status, tabs, lifecycle rail) with a Layout
 * V2-driven Overview body.
 *
 * ISOLATED: it reads the entity-layouts resolve API + a read-only proof query,
 * and mirrors the drawer chrome with proof-only components. It imports NO live
 * AdminEntityDrawer / VM / work-unit / DataTable / bootstrap code. Mutation
 * affordances are disabled/simulated. No production cutover.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LayoutDoc, LayoutResolutionSource } from "@/lib/layout/layoutV2";
import { isLayoutV2PreviewEnabledClient } from "@/lib/layout/featureFlag";
import { entityTypeLabel, fetchEntityLabelMap, type EntityLabelMap } from "@/lib/layout/entityLabels";
import LayoutRecordView from "@/components/layout/LayoutRecordView";
import QueueCardProofRenderer from "@/components/layout/QueueCardProofRenderer";
import WaitlistCandidateCardProofRenderer from "@/components/layout/WaitlistCandidateCardProofRenderer";
import type { WaitlistCandidateCardVM } from "@/lib/layout/waitlist/waitlistCandidateCardVm";
import { readWaitlistGroupConfig } from "@/lib/layout/defaultWaitlistLayouts";
import ProofRecordModal from "@/components/layout/proofShell/ProofRecordModal";

const ENTITY_TYPE = "opportunities";

type Rec = Record<string, unknown> & { id: string };
type Stage = { statusKey: string; label: string; sortOrder: number };
type ProofData = {
    lifecycle: { key: string; label: string; note: string; stages: Stage[] };
    stage: string;
    counts: Record<string, number>;
    entityType: string;
    records: Rec[];
};
type ResolveResp = { resolved: LayoutDoc; source: LayoutResolutionSource };

const TEXT = "#273F52";
const MUTED = "rgba(39,63,82,0.65)";

function SourceBadge({ source }: { source: LayoutResolutionSource | null }) {
    if (!source) return <span className="text-xs text-[#9aa4bf]">—</span>;
    const map: Record<LayoutResolutionSource, { bg: string; fg: string; border: string; label: string }> = {
        org: { bg: "#ecfdf3", fg: "#067647", border: "#abefc6", label: "org layout" },
        default: { bg: "#eff8ff", fg: "#175cd3", border: "#b2ddff", label: "default layout" },
        registry: { bg: "#fffaeb", fg: "#b54708", border: "#fedf89", label: "registry fallback" },
        builtin: { bg: "#f4f3ff", fg: "#5925dc", border: "#d9d6fe", label: "builtin variant" },
    };
    const s = map[source];
    return (
        <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}>
            {s.label}
        </span>
    );
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
function recordName(rec: Rec): string {
    return str(rec["_customer_name"]) || str(rec["name"]) || `Lead ${str(rec.id).slice(0, 6)}`;
}
function recordStatusLabel(rec: Rec): string {
    return str(rec["_status_display"]) || str(rec["status_key"]) || str(rec["status"]) || "—";
}

/**
 * Group candidate cards by cohort section for display only. This is presentation
 * grouping (preserves API order within a group) — NOT the runtime's ranked
 * sectioning, which the proof does not re-implement.
 */
function groupWaitlist(cards: WaitlistCandidateCardVM[]): [string, WaitlistCandidateCardVM[]][] {
    const order: string[] = [];
    const bySection = new Map<string, WaitlistCandidateCardVM[]>();
    for (const vm of cards) {
        const key = vm.waitlist.cohortLabel || "Waitlist";
        if (!bySection.has(key)) { bySection.set(key, []); order.push(key); }
        bySection.get(key)!.push(vm);
    }
    return order.map((k) => [k, bySection.get(k)!]);
}

export default function LayoutProofClient() {
    const flagOnClient = isLayoutV2PreviewEnabledClient();

    const [stage, setStage] = useState("qualified");
    const [queue, setQueue] = useState<ResolveResp | null>(null);
    const [drawer, setDrawer] = useState<ResolveResp | null>(null);
    const [proof, setProof] = useState<ProofData | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [flagDisabled, setFlagDisabled] = useState(false);
    const [labelMap, setLabelMap] = useState<EntityLabelMap>({});
    const [simNav, setSimNav] = useState<string | null>(null);

    // Waitlist proof mode (placement_candidate card surface).
    const [mode, setMode] = useState<"leads" | "waitlist">("leads");
    const [waitlistDoc, setWaitlistDoc] = useState<ResolveResp | null>(null);
    const [waitlistCards, setWaitlistCards] = useState<WaitlistCandidateCardVM[] | null>(null);
    const [waitlistLoading, setWaitlistLoading] = useState(false);

    const loadWaitlist = useCallback(async () => {
        setWaitlistLoading(true);
        try {
            const [layoutRes, candRes] = await Promise.all([
                fetch(`/api/admin/entity-layouts?entity_type=placement_candidate&surface=queue`),
                fetch(`/api/admin/layout-proof/waitlist-candidates`),
            ]);
            if (layoutRes.ok) setWaitlistDoc((await layoutRes.json()) as ResolveResp);
            if (candRes.ok) {
                const j = (await candRes.json()) as { candidates: WaitlistCandidateCardVM[] };
                setWaitlistCards(j.candidates ?? []);
            } else if (candRes.status === 404) {
                setFlagDisabled(true);
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setWaitlistLoading(false);
        }
    }, []);

    const switchMode = useCallback((next: "leads" | "waitlist") => {
        setMode(next);
        if (next === "waitlist" && waitlistCards === null) void loadWaitlist();
    }, [waitlistCards, loadWaitlist]);

    const onAdornment = useCallback((item: { label?: string; refKey: string }, ad: { action?: { entity: string } }) => {
        const target = ad.action?.entity ?? "record";
        console.log("[layout-proof] adornment action →", { refKey: item.refKey, action: ad.action });
        setSimNav(`Would open ${target} drawer · ${item.label || item.refKey}`);
    }, []);

    const loadLayouts = useCallback(async () => {
        const fetchResolve = async (surface: "queue" | "drawer"): Promise<ResolveResp | null> => {
            const res = await fetch(`/api/admin/entity-layouts?entity_type=${ENTITY_TYPE}&surface=${surface}`);
            if (res.status === 404) {
                setFlagDisabled(true);
                return null;
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? `Failed to resolve ${surface} layout`);
            return json as ResolveResp;
        };
        const [q, d] = await Promise.all([fetchResolve("queue"), fetchResolve("drawer")]);
        setQueue(q);
        setDrawer(d);
    }, []);

    const loadRecords = useCallback(async (forStage: string) => {
        const res = await fetch(`/api/admin/layout-proof/opportunities?stage=${encodeURIComponent(forStage)}`);
        if (res.status === 404) {
            setFlagDisabled(true);
            return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load records");
        setProof(json as ProofData);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                fetchEntityLabelMap().then((m) => { if (!cancelled) setLabelMap(m); }).catch(() => {});
                await loadLayouts();
                if (!cancelled) await loadRecords(stage);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onStageChange = useCallback(
        async (next: string) => {
            setStage(next);
            setSelectedId(null);
            setLoading(true);
            setError(null);
            try {
                await loadRecords(next);
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setLoading(false);
            }
        },
        [loadRecords],
    );

    const records = proof?.records ?? [];
    const selectedRecord = records.find((r) => r.id === selectedId) ?? null;
    const stages = proof?.lifecycle.stages ?? [{ statusKey: "qualified", label: "Qualified", sortOrder: 0 }];

    if (!flagOnClient) {
        return (
            <Shell>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Layout V2 preview is disabled on the client. Set{" "}
                    <code className="font-mono text-xs">NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED=1</code> (and{" "}
                    <code className="font-mono text-xs">LAYOUT_V2_PREVIEW_ENABLED=1</code> on the server), then reload.
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            {flagDisabled && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    The server feature flag is OFF (API returned 404). Set{" "}
                    <code className="font-mono text-xs">LAYOUT_V2_PREVIEW_ENABLED=1</code> and reload.
                </div>
            )}
            {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

            {/* Deprecation-prep notice (Goal 3): the builder preview is now the primary surface. */}
            <div className="mb-4 rounded-md border border-[rgba(39,63,82,0.18)] bg-[#F6F8FC] px-3 py-2 text-[12px]" style={{ color: MUTED }}>
                <strong style={{ color: TEXT }}>Internal preview.</strong> This standalone proof is slated to become internal-only — the builder preview in{" "}
                <a className="text-[#00458C] underline" href="/adminV2/settings/layouts">Configuration → Surfaces</a>{" "}now renders the same drawer, queue, and waitlist cards live while you edit. Kept for now for full-data review; not a primary navigation surface.
            </div>

            {/* Work-unit-style Lead list */}
            <div className="overflow-hidden rounded-xl border border-[rgba(39,63,82,0.14)] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(39,63,82,0.12)] bg-[#F6F8FC] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: TEXT }}>
                            {mode === "waitlist" ? "Waitlist candidates" : proof?.lifecycle.label ?? "Lead Management"}
                        </span>
                        <span className="text-xs" style={{ color: MUTED }}>· {mode === "waitlist" ? "placement_candidate card" : "work unit queue"}</span>
                        <span className="inline-flex overflow-hidden rounded-md border border-[rgba(39,63,82,0.18)] text-[11px]">
                            {(["leads", "waitlist"] as const).map((m) => (
                                <button key={m} type="button" onClick={() => switchMode(m)} className={`px-2 py-0.5 ${mode === m ? "bg-[#273F52] text-white" : "bg-white text-[#273F52]"}`}>
                                    {m === "leads" ? "Leads" : "Waitlist"}
                                </button>
                            ))}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {mode === "leads" ? (
                            <>
                                <label className="text-[11px]" style={{ color: MUTED }}>Stage</label>
                                <select value={stage} onChange={(e) => onStageChange(e.target.value)} className="rounded-md border border-[rgba(39,63,82,0.18)] bg-white px-2 py-1 text-xs">
                                    {stages.map((s) => (
                                        <option key={s.statusKey} value={s.statusKey}>{s.label} ({proof?.counts[s.statusKey] ?? 0})</option>
                                    ))}
                                </select>
                                <span className="text-xs" style={{ color: MUTED }}>{records.length} record{records.length === 1 ? "" : "s"}</span>
                            </>
                        ) : (
                            <span className="text-xs" style={{ color: MUTED }}>{waitlistCards?.length ?? 0} candidate{(waitlistCards?.length ?? 0) === 1 ? "" : "s"}</span>
                        )}
                    </div>
                </div>

                {mode === "waitlist" ? (
                    waitlistLoading ? (
                        <p className="p-4 text-sm" style={{ color: MUTED }}>Loading…</p>
                    ) : !waitlistCards || waitlistCards.length === 0 ? (
                        <p className="p-4 text-sm" style={{ color: MUTED }}>
                            No active placement candidates for your org. The proof never injects demo candidates.
                            Tier and position are computed by the placement runtime and shown blank here (proof renders, never ranks).
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3 p-3">
                            {(() => {
                                const cfg = readWaitlistGroupConfig(waitlistDoc?.resolved);
                                return groupWaitlist(waitlistCards).map(([cohort, cards]) => {
                                    const header = cfg.headerTemplate.replace(/\{label\}/g, cohort).replace(/\{count\}/g, String(cards.length));
                                    return (
                                        <div key={cohort} className="flex flex-col gap-2">
                                            {cfg.showGroupHeader ? (
                                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                                                    <span>{header}</span>
                                                    {cfg.showGroupCount ? <span className="text-[rgba(39,63,82,0.45)]">({cards.length})</span> : null}
                                                    {cfg.showGroupBadge ? <span className="rounded-full bg-[rgba(0,162,131,0.12)] px-1.5 py-0.5 text-[9px] font-medium normal-case text-[#0a8f78]">cohort</span> : null}
                                                </div>
                                            ) : null}
                                            {cards.map((vm) =>
                                                waitlistDoc?.resolved ? (
                                                    <WaitlistCandidateCardProofRenderer
                                                        key={vm.candidateId}
                                                        doc={waitlistDoc.resolved}
                                                        vm={vm}
                                                        showRuntimePosition={cfg.showRuntimePosition}
                                                        onOpen={() => setSimNav(`Open candidate · ${vm.child.name}`)}
                                                        onAction={(label) => setSimNav(`${label} · ${vm.child.name}`)}
                                                    />
                                                ) : null,
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                            <p className="text-[11px]" style={{ color: MUTED }}>
                                <strong>This is a repeating candidate card</strong> — one card renders for each candidate in the group.
                                Cohort grouping + header styling are display only; ranking, ordering, and cohort membership stay in the placement runtime.
                            </p>
                        </div>
                    )
                ) : loading ? (
                    <p className="p-4 text-sm" style={{ color: MUTED }}>Loading…</p>
                ) : records.length === 0 ? (
                    <p className="p-4 text-sm" style={{ color: MUTED }}>
                        No records in this stage for your org. Pick another stage above, or move an opportunity into this stage.
                        (The proof never injects demo records.)
                    </p>
                ) : (
                    <div className="flex flex-col gap-2 p-3">
                        {records.map((rec) =>
                            queue?.resolved ? (
                                <QueueCardProofRenderer
                                    key={rec.id}
                                    doc={queue.resolved}
                                    record={rec}
                                    onOpen={() => setSelectedId(rec.id)}
                                    onAction={(label) => setSimNav(`${label} · ${recordName(rec)}`)}
                                    onAdornmentAction={onAdornment}
                                />
                            ) : (
                                <button key={rec.id} type="button" onClick={() => setSelectedId(rec.id)} className="rounded-lg border border-[rgba(39,63,82,0.14)] px-4 py-2.5 text-left text-sm font-semibold hover:bg-[#f5f8ff]" style={{ color: TEXT }}>
                                    {recordName(rec)} · {recordStatusLabel(rec)}
                                </button>
                            ),
                        )}
                    </div>
                )}
            </div>

            {/* Center modal record drawer (mirrors current staging chrome; Overview = Layout V2) */}
            <ProofRecordModal
                open={!!selectedRecord}
                onClose={() => setSelectedId(null)}
                title={selectedRecord ? `Lead — ${recordName(selectedRecord)}` : ""}
                location={selectedRecord ? str(selectedRecord["_location_name"]) || null : null}
                statusLabel={selectedRecord ? recordStatusLabel(selectedRecord) : undefined}
                attention={selectedRecord ? `Layout V2 proof · Overview below is config-driven (source: ${drawer?.source ?? "—"}).` : null}
                lifecycleStatusKey={selectedRecord ? (str(selectedRecord["status_key"]) || str(selectedRecord["status"])) : null}
                footer={
                    <span>
                        Proof shell — chrome is mirrored from staging; status/actions are simulated. Overview body source:{" "}
                        <SourceBadge source={drawer?.source ?? null} />
                    </span>
                }
            >
                {selectedRecord && drawer?.resolved ? (
                    <LayoutRecordView doc={drawer.resolved} record={selectedRecord} onAdornmentAction={onAdornment} />
                ) : (
                    <p className="text-sm" style={{ color: MUTED }}>No drawer layout resolved.</p>
                )}
            </ProofRecordModal>

            {/* Proof details (collapsed by default — not the dominant visual) */}
            <details className="mt-4 rounded-lg border border-[rgba(39,63,82,0.12)] bg-white px-3 py-2 text-sm">
                <summary className="cursor-pointer text-[12px] font-medium" style={{ color: MUTED }}>Proof details</summary>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Detail label="Feature flag"><span className="text-green-700">enabled</span></Detail>
                    <Detail label="Entity type">{entityTypeLabel(labelMap, ENTITY_TYPE, "singular")}</Detail>
                    <Detail label="Queue source"><SourceBadge source={queue?.source ?? null} /></Detail>
                    <Detail label="Drawer source"><SourceBadge source={drawer?.source ?? null} /></Detail>
                </div>
                <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
                    {proof?.lifecycle.note}{" "}Configure at{" "}
                    <a className="text-[#00458C] underline" href="/adminV2/settings/layouts">/adminV2/settings/layouts</a>{" "}— publish a Lead drawer/queue and reload; the source badge flips to <strong>org layout</strong> and edits appear here.
                </p>
                <p className="mt-2 text-[11px]">
                    <Link className="text-[#00458C] underline" href="/adminV2/layout-proof/opportunity-drawer">
                        Opportunity drawer runtime proof →
                    </Link>
                    <span className="text-[10px]" style={{ color: MUTED }}>
                        {" "}Add ?opportunityId=&lt;uuid&gt; for real-record shadow validation
                    </span>
                </p>
                <p className="mt-1 text-[11px]">
                    <Link className="text-[#00458C] underline" href="/adminV2/layout-proof/person-drawer">
                        Person drawer runtime proof →
                    </Link>
                    {" · "}
                    <Link className="text-[#00458C] underline" href="/adminV2/layout-proof/child-drawer">
                        Child drawer runtime proof →
                    </Link>
                </p>
            </details>

            {simNav && (
                <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-[#00458C] bg-white px-4 py-2 text-sm shadow-lg" role="status">
                    <span style={{ color: TEXT }}>{simNav}</span>
                    <span className="ml-2 text-[11px] text-[#9aa4bf]">(simulated — proof only)</span>
                    <button type="button" onClick={() => setSimNav(null)} className="ml-3 text-[#59678b]">✕</button>
                </div>
            )}
        </Shell>
    );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{label}</span>
            <span className="text-sm" style={{ color: TEXT }}>{children}</span>
        </div>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto max-w-[1100px] px-6 py-6">
            <header className="mb-5">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#273F52" }}>Lead layout proof</h1>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                    What a configured Lead queue and drawer would look like. Click a Lead to open the drawer shell — its
                    Overview is driven by your Layout V2 config. Not connected to live drawers, queues, or AdminV2 runtime.
                </p>
            </header>
            {children}
        </div>
    );
}
