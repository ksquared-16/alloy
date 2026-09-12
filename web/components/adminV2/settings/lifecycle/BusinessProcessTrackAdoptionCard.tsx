"use client";

import { useCallback, useState } from "react";

import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

/**
 * ADOPT CANONICAL TRACKS — the Settings operation for a process that was built before tracks existed.
 *
 * A process whose stages were authored by hand could never obtain `tracks_v1`: the only writer was
 * template instantiation, which refuses a process that already has stages. So the card exists for
 * exactly one situation and says so — a process that already has tracks gets nothing here, because
 * there is nothing to adopt.
 *
 * ── WHY PREVIEW IS A SEPARATE ROUND TRIP ──
 *
 * Adoption re-homes every lane in the process at once. An operator is entitled to see which stages
 * land in which track, where the split happens and how many live records are involved BEFORE
 * anything is written, and to see it as often as they like. The preview request writes nothing — not
 * even a draft revision — so looking is free and pressing Adopt is the only act with consequences.
 *
 * The refusals are rendered as the server sent them. They name the stage in the operator's own label
 * and say what disagrees, because the operator is the only one who can fix a stage whose grain and
 * queue membership contradict each other.
 */

type Blocker = { code: string; message: string; stage_key?: string };

type PreviewTrack = {
    key: string;
    label: string;
    subject: string;
    stage_labels: string[];
};

type AdoptionReport = {
    adoptable: boolean;
    already_adopted: boolean;
    blockers: Blocker[];
    preview: {
        before: { tracks_configured: boolean; track_count: number; routing: string };
        after: {
            track_count: number;
            routing: string;
            tracks: PreviewTrack[];
            split_points: {
                from_stage_label: string;
                into_track_key: string;
                outcome_labels: string[];
            }[];
        };
        stage_routing_changes: { stage_key: string; label: string; grain: string; track_key: string }[];
    };
    observed_instances: { stage_keys: string[]; instance_count: number };
};

export default function BusinessProcessTrackAdoptionCard({
    departmentId,
    processId,
    tracksConfigured,
    canEdit,
    onAdopted,
}: {
    departmentId: string;
    processId: string;
    /** When the process already has tracks there is nothing to adopt and the card stays away. */
    tracksConfigured: boolean;
    canEdit: boolean;
    onAdopted: () => void;
}) {
    const [report, setReport] = useState<AdoptionReport | null>(null);
    const [busy, setBusy] = useState<null | "preview" | "adopt">(null);
    const [error, setError] = useState<string | null>(null);
    const [adopted, setAdopted] = useState(false);

    const call = useCallback(
        async (action: "preview_process_track_adoption" | "adopt_process_tracks") => {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, process_id: processId }),
                },
            );
            const json = (await res.json().catch(() => ({}))) as Partial<AdoptionReport> & {
                error?: string;
                track_adoption?: AdoptionReport;
            };
            return { res, json };
        },
        [departmentId, processId],
    );

    const runPreview = useCallback(async () => {
        setBusy("preview");
        setError(null);
        try {
            const { res, json } = await call("preview_process_track_adoption");
            if (!res.ok) throw new Error(json.error ?? "Could not preview track adoption");
            setReport(json as AdoptionReport);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not preview track adoption");
        } finally {
            setBusy(null);
        }
    }, [call]);

    const runAdopt = useCallback(async () => {
        setBusy("adopt");
        setError(null);
        try {
            const { res, json } = await call("adopt_process_tracks");
            if (!res.ok) {
                // A refusal carries the full report, so the blockers stay on screen to be acted on.
                if (json.blockers?.length) setReport(json as AdoptionReport);
                throw new Error(json.error ?? "Track adoption was refused");
            }
            setAdopted(true);
            onAdopted();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Track adoption was refused");
        } finally {
            setBusy(null);
        }
    }, [call, onAdopted]);

    if (tracksConfigured && !adopted) return null;

    return (
        <div
            className="process-config-setup-card p-4"
            data-testid="business-process-track-adoption"
        >
            <header className="mb-2">
                <h3 className="text-base font-semibold text-alloy-midnight">Adopt track configuration</h3>
                <p className="mt-1 text-sm leading-6 text-alloy-midnight/60">
                    This process was built before tracks existed, so its stages all route the same way.
                    Adopting the canonical track model lets family stages and child stages route
                    independently. Nothing changes until you adopt.
                </p>
            </header>

            {adopted ?
                <p className="text-sm text-alloy-pine" data-testid="business-process-track-adoption-done">
                    Tracks adopted. Publish the configuration to activate the new routing.
                </p>
            :   <>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-md border border-alloy-forge/20 px-3 py-1.5 text-sm font-medium text-alloy-midnight hover:bg-alloy-forge/5 disabled:opacity-50"
                            onClick={runPreview}
                            disabled={busy !== null}
                            data-testid="business-process-track-adoption-preview"
                        >
                            {busy === "preview" ? "Checking…" : "Preview impact"}
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                            onClick={runAdopt}
                            disabled={busy !== null || !canEdit || !report?.adoptable}
                            data-testid="business-process-track-adoption-apply"
                        >
                            {busy === "adopt" ? "Adopting…" : "Adopt tracks"}
                        </button>
                    </div>

                    {error ?
                        <p
                            className="mt-3 text-sm text-alloy-rust"
                            data-testid="business-process-track-adoption-error"
                        >
                            {error}
                        </p>
                    :   null}

                    {report?.blockers.length ?
                        <div className="mt-3" data-testid="business-process-track-adoption-blockers">
                            <p className="text-sm font-medium text-alloy-midnight">
                                Fix these before adopting:
                            </p>
                            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-alloy-midnight/70">
                                {report.blockers.map((b, i) => (
                                    <li key={`${b.code}-${b.stage_key ?? i}`}>{b.message}</li>
                                ))}
                            </ul>
                        </div>
                    :   null}

                    {report && !report.blockers.length ?
                        <div className="mt-3 space-y-2" data-testid="business-process-track-adoption-preview-result">
                            <p className="text-sm text-alloy-midnight/70">
                                Routing changes from <strong>{report.preview.before.routing}</strong> to{" "}
                                <strong>{report.preview.after.routing}</strong> for{" "}
                                {report.preview.stage_routing_changes.length} stages.{" "}
                                {report.observed_instances.instance_count} records are currently in this
                                process.
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {report.preview.after.tracks.map((track) => (
                                    <div
                                        key={track.key}
                                        className="rounded-lg border border-alloy-forge/12 bg-white/70 px-3 py-2"
                                        data-testid={`business-process-track-adoption-track-${track.key}`}
                                    >
                                        <p className="text-sm font-semibold text-alloy-midnight">{track.label}</p>
                                        <p className="mt-0.5 text-xs text-alloy-midnight/55">
                                            {track.stage_labels.join(" · ") || "No stages"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            {report.preview.after.split_points.map((split) => (
                                <p
                                    key={`${split.from_stage_label}-${split.into_track_key}`}
                                    className="text-xs text-alloy-midnight/55"
                                    data-testid="business-process-track-adoption-split"
                                >
                                    Splits at <strong>{split.from_stage_label}</strong> into{" "}
                                    {split.outcome_labels.join(", ")}.
                                </p>
                            ))}
                        </div>
                    :   null}
                </>
            }
        </div>
    );
}
