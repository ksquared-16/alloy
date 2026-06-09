"use client";

import { Check } from "lucide-react";
import { FINDINGS_FULL, SOURCE_INQUIRY } from "../action-workspace-v2-mockups/fixtures";
import { AMBER_REVIEW, BEND_PINE, BOS_WASH, FORGE_DEEP, MIDNIGHT_FORGE } from "../bos-shape-exploration/bosShapeTokens";

/**
 * Approved Concept B interior — fixed. Shell explorations wrap this unchanged.
 */
export function WorkspaceInterior() {
    const findings = FINDINGS_FULL.slice(0, 4);

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div
                className="shrink-0 border-b px-4 py-2"
                style={{ background: BOS_WASH, borderColor: "rgba(0,162,131,0.2)" }}
            >
                <p className="text-[11px] text-alloy-muted">
                    <span className="font-semibold" style={{ color: BEND_PINE }}>
                        BOS ·{" "}
                    </span>
                    I read the inquiry. Contact and family names look solid. Please confirm the source.
                </p>
            </div>

            <div className="flex min-h-0 flex-1">
                <aside
                    className="flex w-[38%] flex-col border-r bg-[#eceef2]"
                    style={{ borderColor: "rgba(39,63,82,0.1)" }}
                >
                    <div
                        className="px-3 py-1 text-[9px] font-bold uppercase tracking-[0.12em]"
                        style={{ color: MIDNIGHT_FORGE, opacity: 0.5 }}
                    >
                        Source Material
                    </div>
                    <pre className="flex-1 overflow-hidden whitespace-pre-wrap p-3 font-sans text-[11px] leading-relaxed text-alloy-forge/90">
                        {SOURCE_INQUIRY}
                    </pre>
                </aside>

                <div className="min-w-0 flex-1 overflow-hidden bg-[#f4f6f9] p-2">
                    <div className="space-y-1">
                        {findings.map((f) => {
                            const review = f.status === "review";
                            return (
                                <div
                                    key={f.id}
                                    className="rounded-md px-2 py-1.5"
                                    style={{
                                        background: review ? AMBER_REVIEW.bg : "#fff",
                                        border: `1px solid ${review ? AMBER_REVIEW.border : "rgba(39,63,82,0.08)"}`,
                                        borderLeft: `3px solid ${review ? AMBER_REVIEW.rail : BEND_PINE}`,
                                    }}
                                >
                                    <div className="flex items-start gap-1.5">
                                        {review ?
                                            <span className="text-[10px] font-bold text-amber-600">!</span>
                                        :   <Check className="h-3 w-3 shrink-0" style={{ color: BEND_PINE }} strokeWidth={2.5} />}
                                        <div>
                                            <p className="text-[11px] font-semibold" style={{ color: FORGE_DEEP }}>
                                                {f.headline}
                                            </p>
                                            {!review ?
                                                <p className="text-[10px]" style={{ color: BEND_PINE }}>
                                                    {f.details.map((d) => d.value).join(" · ")}
                                                </p>
                                            :   null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <footer className="flex shrink-0 items-center justify-between border-t px-3 py-1.5">
                <span className="text-[10px] text-alloy-muted">Back</span>
                <button
                    type="button"
                    className="rounded-md px-3 py-1 text-[10px] font-semibold text-white"
                    style={{ background: BEND_PINE }}
                >
                    Apply findings
                </button>
            </footer>
        </div>
    );
}
