"use client";

import "@/app/adminV2/components/alloyOsRuntime.css";

import FocusPanelSummarySurfaceEditor from "@/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor";

/**
 * Dev harness (no auth) rendering the REAL `/settings/surfaces` Focus Panel editor —
 * the same `FocusPanelSummarySurfaceEditor` mounted in the gated settings route — so
 * the mounted row-based builder is screenshot-able. The layout fetch fails gracefully
 * without auth; the editor still renders with the default order + the row builder.
 */
export default function SurfaceEditorDevClient() {
    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: 24 }}>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
                Dev mirror of <code>/settings/surfaces</code> (Enrollment Focus Panel) — row-based composition mounted.
            </p>
            <div style={{ height: 1100, width: 1240, maxWidth: "100%", background: "#fff", borderRadius: 12, padding: 16, boxSizing: "border-box" }}>
                <FocusPanelSummarySurfaceEditor />
            </div>
        </div>
    );
}
