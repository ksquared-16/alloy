"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";

/**
 * Temporary integration probe: verifies AdminDrawerProvider + AdminEntityDrawer
 * under /adminV2/workspace with real org data (jobs list → openDrawer → entity resolver).
 */
export default function AdminV2WorkspaceDrawerProbePage() {
  const { openDrawer } = useAdminDrawer();
  const [sampleJobId, setSampleJobId] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/admin/jobs?unassigned_work_unit=true&limit=1");
        const json = (await res.json()) as { jobs?: { id: string }[]; error?: string };
        if (!res.ok) {
          setLoadError(json.error ?? res.statusText);
          setLoading(false);
          return;
        }
        const first = json.jobs?.[0]?.id;
        if (first && !cancelled) {
          setSampleJobId(first);
          setLoading(false);
          return;
        }
        const res2 = await fetch("/api/admin/jobs?limit=1");
        const json2 = (await res2.json()) as { jobs?: { id: string }[]; error?: string };
        if (!res2.ok) {
          setLoadError(json2.error ?? res2.statusText);
          return;
        }
        const id2 = json2.jobs?.[0]?.id;
        if (!cancelled) setSampleJobId(id2 ?? null);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const openJobDrawer = useCallback(() => {
    const id = manualId.trim() || sampleJobId;
    if (!id) return;
    openDrawer({ type: "jobs", id, jobRecordSurface: "drawer" });
  }, [manualId, openDrawer, sampleJobId]);

  return (
    <div className="max-w-xl space-y-4 text-alloy-forge">
      <h1 className="text-lg font-semibold">Drawer integration probe</h1>
      <p className="text-sm text-alloy-midnight/70">
        Verifies <code className="rounded bg-alloy-stone/30 px-1">openDrawer</code> and resolver-backed job load (
        <code className="rounded bg-alloy-stone/30 px-1">surface=drawer</code>) under{" "}
        <code className="rounded bg-alloy-stone/30 px-1">/adminV2/workspace</code>. Remove or replace when department
        routes are migrated.
      </p>
      {loading && <p className="text-sm">Loading a sample job id…</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {!loading && sampleJobId && (
        <p className="text-sm">
          Sample job id (unassigned queue, else first job in org):{" "}
          <span className="font-mono break-all">{sampleJobId}</span>
        </p>
      )}
      {!loading && !sampleJobId && !loadError && (
        <p className="text-sm text-alloy-midnight/70">No jobs found — paste a job UUID below.</p>
      )}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="probe-job-id">
          Optional: job UUID
        </label>
        <input
          id="probe-job-id"
          className="rounded border border-admin-border bg-admin-surface-card px-3 py-2 text-sm"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="Paste job id"
        />
      </div>
      <button
        type="button"
        disabled={!manualId.trim() && !sampleJobId}
        onClick={openJobDrawer}
        className="rounded-md bg-alloy-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Open job drawer
      </button>
    </div>
  );
}
