"use client";

import {
    BOS_PANEL,
    FINDINGS_PANEL,
    FORGE_PANEL,
    MATERIAL_PANEL,
    WsBosPeripheral,
    WsConduit,
    WsFindingsOrbit,
    WsMaterialStack,
    WsMockupSection,
    WsTitleBand,
    WsViewport,
} from "./WorkstationArchetypeShared";

/**
 * Workstation archetypes — not modal silhouettes.
 * Material = center of gravity. BOS + findings orbit.
 */
export default function OperationalIntakeWorkstationGallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Workstation archetypes · mockups only · not production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Operational Intake Workstation
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Purpose-built intake machines — not CRM modals. Material is dominant (~50%).
                        BOS peripheral (~20%). Findings supporting (~30%). No equal-width dashboard
                        columns.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">
                        /dev/operational-intake-workstation
                    </p>
                </header>

                {/* 1 · Trapezoid — faces the operator */}
                <WsMockupSection
                    mockupId="archetype-trapezoid"
                    label="Archetype 1"
                    title="Trapezoid workstation"
                    summary="The workspace faces the operator. Findings span the far edge; material dominates the center; BOS anchors the near corner. Not a row of columns — a converging intake machine."
                >
                    <WsViewport>
                        <div className="w-full max-w-[1100px]" data-archetype="trapezoid">
                            <WsTitleBand />
                            <div
                                className="relative mx-auto overflow-hidden"
                                style={{
                                    height: 520,
                                    clipPath: "polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)",
                                    ...FORGE_PANEL,
                                    borderRadius: "4px 4px 0 0",
                                }}
                            >
                                {/* Findings — far edge, full width of trapezoid top */}
                                <div
                                    className="absolute left-[8%] right-[8%] top-0 px-5 py-3"
                                    style={{
                                        height: "26%",
                                        ...FINDINGS_PANEL,
                                        borderRadius: "0 0 12px 12px",
                                    }}
                                >
                                    <WsFindingsOrbit compact />
                                </div>

                                {/* Material — dominant center */}
                                <div
                                    className="absolute left-[14%] right-[14%] top-[28%] px-5 py-4"
                                    style={{
                                        height: "48%",
                                        ...MATERIAL_PANEL,
                                        borderRadius: 16,
                                    }}
                                >
                                    <WsMaterialStack />
                                </div>

                                {/* BOS — near left wedge */}
                                <div
                                    className="absolute bottom-0 left-0 px-4 py-3"
                                    style={{
                                        width: "22%",
                                        height: "28%",
                                        clipPath: "polygon(0 0, 100% 30%, 100% 100%, 0 100%)",
                                        ...BOS_PANEL,
                                    }}
                                >
                                    <WsBosPeripheral />
                                </div>

                                {/* Actions hint — near right wedge */}
                                <div
                                    className="absolute bottom-0 right-0 flex items-end justify-end px-4 py-3"
                                    style={{
                                        width: "18%",
                                        height: "22%",
                                        clipPath: "polygon(0 40%, 100% 0, 100% 100%, 0 100%)",
                                    }}
                                >
                                    <p className="text-[10px] font-medium text-white/40">
                                        Dock material ↑
                                    </p>
                                </div>
                            </div>
                        </div>
                    </WsViewport>
                </WsMockupSection>

                {/* 2 · Flight deck — vertical flow */}
                <WsMockupSection
                    mockupId="archetype-flight-deck"
                    label="Archetype 2"
                    title="Flight deck workstation"
                    summary="Information flows upward. BOS guidance at the deck floor; material command in the middle; findings on the upper display. Star Trek console — not a dashboard."
                >
                    <WsViewport>
                        <div
                            className="flex w-full max-w-[520px] flex-col items-center"
                            data-archetype="flight-deck"
                        >
                            <WsTitleBand compact />
                            <div
                                className="flex w-full flex-col items-center"
                                style={{ filter: "drop-shadow(0 24px 48px rgba(15,35,52,0.2))" }}
                            >
                                {/* Findings — upper display */}
                                <div
                                    className="w-[92%] px-4 py-3"
                                    style={{
                                        ...FINDINGS_PANEL,
                                        borderRadius: "20px 20px 8px 8px",
                                        border: "1px solid rgba(0,162,131,0.12)",
                                    }}
                                >
                                    <WsFindingsOrbit />
                                </div>
                                <WsConduit vertical />
                                {/* Material — command band (largest) */}
                                <div
                                    className="w-full px-5 py-4"
                                    style={{
                                        ...MATERIAL_PANEL,
                                        borderRadius: 12,
                                        border: "2px solid rgba(0,162,131,0.18)",
                                    }}
                                >
                                    <WsMaterialStack />
                                </div>
                                <WsConduit vertical />
                                {/* BOS — deck floor */}
                                <div
                                    className="w-[88%] px-4 py-3"
                                    style={{
                                        ...BOS_PANEL,
                                        borderRadius: "8px 8px 20px 20px",
                                        border: "1px solid rgba(39,63,82,0.08)",
                                    }}
                                >
                                    <WsBosPeripheral />
                                </div>
                            </div>
                        </div>
                    </WsViewport>
                </WsMockupSection>

                {/* 3 · Harbor — everything docks into intake */}
                <WsMockupSection
                    mockupId="archetype-harbor"
                    label="Archetype 3"
                    title="Harbor · docking workstation"
                    summary="Material docks at the harbor floor. BOS watches from port; findings emerge to starboard. V-geometry — everything converges on intake."
                >
                    <WsViewport>
                        <div className="relative w-full max-w-[1000px]" data-archetype="harbor">
                            <WsTitleBand />
                            <div className="relative" style={{ height: 500 }}>
                                {/* BOS port */}
                                <div
                                    className="absolute left-0 top-0 px-4 py-4"
                                    style={{
                                        width: "24%",
                                        height: "38%",
                                        clipPath: "polygon(0 0, 100% 0, 70% 100%, 0 100%)",
                                        ...BOS_PANEL,
                                        borderRadius: "12px 0 0 0",
                                    }}
                                >
                                    <WsBosPeripheral />
                                </div>

                                {/* Findings starboard */}
                                <div
                                    className="absolute right-0 top-0 px-4 py-4"
                                    style={{
                                        width: "28%",
                                        height: "42%",
                                        clipPath: "polygon(30% 0, 100% 0, 100% 100%, 0 100%)",
                                        ...FINDINGS_PANEL,
                                        borderRadius: "0 12px 0 0",
                                    }}
                                >
                                    <WsFindingsOrbit />
                                </div>

                                {/* Harbor basin — material docks here (dominant) */}
                                <div
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 px-6 py-5"
                                    style={{
                                        width: "58%",
                                        height: "58%",
                                        clipPath: "polygon(12% 0, 88% 0, 100% 100%, 0 100%)",
                                        ...MATERIAL_PANEL,
                                        boxShadow:
                                            "0 -8px 40px rgba(0,162,131,0.12), inset 0 2px 0 rgba(0,162,131,0.15)",
                                    }}
                                >
                                    <WsMaterialStack />
                                    <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-[#007A63]/60">
                                        ↓ Material docks here
                                    </p>
                                </div>

                                {/* Water line */}
                                <div
                                    className="pointer-events-none absolute inset-x-[18%] top-[42%] h-px bg-gradient-to-r from-transparent via-[#00A283]/30 to-transparent"
                                    aria-hidden
                                />
                            </div>
                        </div>
                    </WsViewport>
                </WsMockupSection>

                {/* 4 · Cloud core — intake is the nucleus */}
                <WsMockupSection
                    mockupId="archetype-cloud-core"
                    label="Archetype 4"
                    title="Cloud-core workstation"
                    summary="Intake is the nucleus — not a cloud border. BOS, findings, and actions radiate from the material core. Geometric, not fluffy."
                >
                    <WsViewport>
                        <div className="w-full max-w-[980px]" data-archetype="cloud-core">
                            <WsTitleBand />
                            <div
                                className="relative mx-auto"
                                style={{ width: 560, height: 520 }}
                            >
                                {/* Radiating arms — findings top */}
                                <div
                                    className="absolute left-1/2 top-0 -translate-x-1/2 px-4 py-3"
                                    style={{
                                        width: "72%",
                                        ...FINDINGS_PANEL,
                                        borderRadius: "999px 999px 12px 12px",
                                        border: "1px solid rgba(0,162,131,0.1)",
                                    }}
                                >
                                    <WsFindingsOrbit compact />
                                </div>

                                {/* BOS left arm */}
                                <div
                                    className="absolute left-0 top-[32%] px-3 py-3"
                                    style={{
                                        width: "22%",
                                        height: "36%",
                                        ...BOS_PANEL,
                                        borderRadius: "999px 8px 8px 999px",
                                    }}
                                >
                                    <WsBosPeripheral />
                                </div>

                                {/* Actions right arm */}
                                <div
                                    className="absolute right-0 top-[38%] flex flex-col justify-center px-3 py-3"
                                    style={{
                                        width: "18%",
                                        height: "28%",
                                        background: "rgba(39,63,82,0.04)",
                                        borderRadius: "8px 999px 999px 8px",
                                    }}
                                >
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-alloy-midnight/35">
                                        Actions
                                    </p>
                                    <button
                                        type="button"
                                        className="mt-2 text-left text-[11px] text-alloy-midnight/50"
                                    >
                                        Confirm findings
                                    </button>
                                    <button
                                        type="button"
                                        className="mt-1 text-left text-[11px] text-alloy-midnight/50"
                                    >
                                        Create lead
                                    </button>
                                </div>

                                {/* Core — material nucleus */}
                                <div
                                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[42%] px-5 py-4"
                                    style={{
                                        width: "52%",
                                        minHeight: "46%",
                                        ...MATERIAL_PANEL,
                                        borderRadius: 24,
                                        boxShadow:
                                            "0 0 0 2px rgba(0,162,131,0.15), 0 16px 48px rgba(0,162,131,0.12)",
                                    }}
                                >
                                    <div
                                        className="pointer-events-none absolute -inset-3 rounded-[28px] opacity-40"
                                        style={{
                                            background:
                                                "radial-gradient(circle at 50% 50%, rgba(0,162,131,0.14), transparent 70%)",
                                        }}
                                        aria-hidden
                                    />
                                    <WsMaterialStack className="relative" />
                                </div>

                                {/* Core ring */}
                                <div
                                    className="pointer-events-none absolute left-1/2 top-[46%] h-[48%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[#00A283]/15"
                                    aria-hidden
                                />
                            </div>
                        </div>
                    </WsViewport>
                </WsMockupSection>

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Abandoned thinking</p>
                    <p className="mt-1">
                        Modal containers · border variations · equal-width dashboard columns · rectangles
                        with half-circles · cards inside cards.
                    </p>
                </footer>
            </div>
        </div>
    );
}
