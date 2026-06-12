"use client";

import {
    EnvBosWhisper,
    EnvFindingsEmergence,
    EnvMaterialCore,
    EnvMockupSection,
    EnvStage,
} from "./EnvironmentalObjectShared";
import { PROGRESSIVE_FINDINGS } from "../operational-intake-workspace/OperationalIntakeShared";

/**
 * Environmental objects — the workspace IS the object.
 * No modal. No dashboard columns. No container borders.
 */
export default function OperationalIntakeEnvironmentGallery() {
    return (
        <div className="min-h-screen bg-[#c8ccd4] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Environmental objects · V2 · mockups only
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Operational Intake Workspace — Environmental Objects
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        The UI lives inside a recognizable object — not a rectangle with a modified edge.
                        Material is center of gravity. BOS whispers at the periphery. Findings emerge as outputs.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">
                        /dev/operational-intake-environment
                    </p>
                </header>

                {/* A — Oval Command Table */}
                <EnvMockupSection
                    mockupId="env-oval-command-table"
                    label="Object A"
                    title="Oval command table"
                    metaphor="War room command table — operators gather around a horizontal oval. Material sits at the table center; BOS and findings are seated positions around the perimeter, not dashboard columns."
                    crmDistinction="CRM shows a modal dialog. This shows a table you work around — spatial seating, not a form inside a box."
                >
                    <EnvStage>
                        <div
                            className="relative flex items-center justify-center"
                            style={{ width: 920, height: 380 }}
                            data-env-object="oval-command-table"
                        >
                            {/* The table IS the workspace */}
                            <div
                                className="absolute inset-0"
                                style={{
                                    borderRadius: "50%",
                                    background:
                                        "radial-gradient(ellipse 100% 100% at 50% 45%, #2a4458 0%, #1e3344 55%, #152636 100%)",
                                    boxShadow:
                                        "0 40px 80px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -20px 40px rgba(0,0,0,0.25)",
                                }}
                            />
                            {/* Table surface highlight */}
                            <div
                                className="absolute inset-[6%]"
                                style={{
                                    borderRadius: "50%",
                                    background:
                                        "radial-gradient(ellipse 90% 70% at 50% 40%, rgba(0,162,131,0.12), transparent 65%)",
                                }}
                                aria-hidden
                            />

                            {/* Material — table center (~50%) */}
                            <div
                                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-8 py-5"
                                style={{ width: "46%", maxWidth: 380 }}
                            >
                                <EnvMaterialCore />
                            </div>

                            {/* BOS — seated port side */}
                            <div
                                className="absolute left-[8%] top-1/2 z-10 w-[18%] -translate-y-1/2"
                            >
                                <EnvBosWhisper />
                            </div>

                            {/* Findings — seated starboard */}
                            <div
                                className="absolute right-[8%] top-1/2 z-10 w-[22%] -translate-y-1/2"
                            >
                                <EnvFindingsEmergence />
                            </div>
                        </div>
                    </EnvStage>
                </EnvMockupSection>

                {/* B — Arena */}
                <EnvMockupSection
                    mockupId="env-arena"
                    label="Object B"
                    title="Operations arena"
                    metaphor="Central stage with amphitheater geometry — material on the activity floor. BOS and findings occupy opposing tiers that curve inward, pulling attention to the middle."
                    crmDistinction="CRM spreads equal panels across a grid. The arena uses concentric focus — everything converges on the material floor."
                >
                    <EnvStage>
                        <div
                            className="relative"
                            style={{ width: 560, height: 520 }}
                            data-env-object="arena"
                        >
                            {/* Arena bowl */}
                            <div
                                className="absolute inset-0"
                                style={{
                                    clipPath: "ellipse(50% 48% at 50% 55%)",
                                    background:
                                        "radial-gradient(ellipse 100% 100% at 50% 60%, rgba(0,162,131,0.15) 0%, rgba(30,51,68,0.95) 45%, rgba(15,28,40,1) 100%)",
                                }}
                            />
                            {/* Tier rings */}
                            {[88, 72, 58].map((size, i) => (
                                <div
                                    key={size}
                                    className="pointer-events-none absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06]"
                                    style={{ width: `${size}%`, height: `${size * 0.85}%` }}
                                    aria-hidden
                                />
                            ))}

                            {/* Material — stage center */}
                            <div
                                className="absolute left-1/2 top-[48%] z-10 w-[42%] -translate-x-1/2 -translate-y-1/2 px-4 py-4"
                                style={{
                                    clipPath: "ellipse(50% 45% at 50% 50%)",
                                    background: "rgba(255,255,255,0.06)",
                                }}
                            >
                                <EnvMaterialCore dense />
                            </div>

                            {/* BOS — left tier */}
                            <div
                                className="absolute left-0 top-[22%] w-[26%] px-2"
                                style={{ transform: "perspective(400px) rotateY(12deg)" }}
                            >
                                <EnvBosWhisper />
                            </div>

                            {/* Findings — right tier */}
                            <div
                                className="absolute right-0 top-[18%] w-[28%] px-2"
                                style={{ transform: "perspective(400px) rotateY(-12deg)" }}
                            >
                                <EnvFindingsEmergence />
                            </div>
                        </div>
                    </EnvStage>
                </EnvMockupSection>

                {/* C — Forge */}
                <EnvMockupSection
                    mockupId="env-forge"
                    label="Object C"
                    title="Forge"
                    metaphor="Raw material enters the heat; processing transforms it; refined findings exit the far side. BOS monitors from the forge floor — the environment communicates Material → Processing → Outcome without arrows."
                    crmDistinction="CRM is static data entry. The forge is a transformation machine — asymmetric flow, not symmetric columns."
                >
                    <EnvStage>
                        <div
                            className="relative"
                            style={{ width: 880, height: 340 }}
                            data-env-object="forge"
                        >
                            {/* Forge body — asymmetric channel */}
                            <div
                                className="absolute inset-0"
                                style={{
                                    clipPath:
                                        "polygon(0% 35%, 8% 20%, 42% 8%, 58% 8%, 92% 20%, 100% 35%, 100% 65%, 92% 80%, 58% 92%, 42% 92%, 8% 80%, 0% 65%)",
                                    background:
                                        "linear-gradient(90deg, #3d2818 0%, #5c3d1e 18%, #8b4513 42%, #c45c26 50%, #5c3d1e 72%, #2a4458 88%, #1e3344 100%)",
                                    boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
                                }}
                            />
                            {/* Heat glow — processing center */}
                            <div
                                className="pointer-events-none absolute left-[38%] top-[18%] h-[64%] w-[24%]"
                                style={{
                                    background:
                                        "radial-gradient(ellipse at center, rgba(255,140,60,0.45), rgba(255,100,40,0.15) 50%, transparent 70%)",
                                    filter: "blur(8px)",
                                }}
                                aria-hidden
                            />

                            {/* Material — input mouth (left) */}
                            <div className="absolute left-[6%] top-1/2 z-10 w-[28%] -translate-y-1/2 px-3">
                                <EnvMaterialCore dense />
                            </div>

                            {/* BOS — forge floor monitor */}
                            <div className="absolute bottom-[6%] left-1/2 z-10 w-[24%] -translate-x-1/2">
                                <EnvBosWhisper align="center" />
                            </div>

                            {/* Findings — output mouth (right) */}
                            <div
                                className="absolute right-[6%] top-1/2 z-10 w-[26%] -translate-y-1/2 px-3"
                                style={{
                                    background: "rgba(255,255,255,0.04)",
                                    clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0 100%)",
                                }}
                            >
                                <EnvFindingsEmergence />
                            </div>
                        </div>
                    </EnvStage>
                </EnvMockupSection>

                {/* D — Observatory */}
                <EnvMockupSection
                    mockupId="env-observatory"
                    label="Object D"
                    title="Observatory"
                    metaphor="Observation deck — material is the target under analysis. Findings orbit in analytical rings. BOS sits at the observer pedestal below. Geometry feels analytical, not administrative."
                    crmDistinction="CRM lists fields in a form. The observatory maps entities in orbital relation to the material target — spatial intelligence, not field rows."
                >
                    <EnvStage>
                        <div
                            className="relative"
                            style={{ width: 520, height: 540 }}
                            data-env-object="observatory"
                        >
                            {/* Dome */}
                            <div
                                className="absolute left-1/2 top-0 h-[72%] w-[92%] -translate-x-1/2"
                                style={{
                                    borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
                                    background:
                                        "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(30,51,68,0.6) 40%, rgba(15,28,40,0.95) 100%)",
                                    boxShadow: "inset 0 -20px 40px rgba(0,0,0,0.3)",
                                }}
                            />

                            {/* Orbital rings — findings */}
                            {[95, 78, 62].map((diam, i) => (
                                <div
                                    key={diam}
                                    className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#00A283]/[0.12]"
                                    style={{ width: diam * 3.2, height: diam * 2.4 }}
                                    aria-hidden
                                />
                            ))}

                            {/* Findings on orbit positions */}
                            <div className="absolute left-[4%] top-[28%] w-[28%]">
                                <EnvFindingsEmergence findings={PROGRESSIVE_FINDINGS.slice(0, 3)} />
                            </div>
                            <div className="absolute right-[2%] top-[32%] w-[30%]">
                                <EnvFindingsEmergence findings={PROGRESSIVE_FINDINGS.slice(3, 5)} />
                            </div>

                            {/* Material — observation target */}
                            <div
                                className="absolute left-1/2 top-[42%] z-10 w-[38%] -translate-x-1/2 -translate-y-1/2 px-4 py-3"
                                style={{
                                    clipPath: "circle(50% at 50% 50%)",
                                    background:
                                        "radial-gradient(circle, rgba(0,162,131,0.2) 0%, rgba(255,255,255,0.06) 70%)",
                                }}
                            >
                                <EnvMaterialCore dense />
                            </div>

                            {/* Target crosshair */}
                            <div
                                className="pointer-events-none absolute left-1/2 top-[42%] h-16 w-16 -translate-x-1/2 -translate-y-1/2 opacity-20"
                                aria-hidden
                            >
                                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#00A283]" />
                                <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#00A283]" />
                            </div>

                            {/* BOS — observer pedestal */}
                            <div
                                className="absolute bottom-0 left-1/2 w-[44%] -translate-x-1/2 px-4 py-4"
                                style={{
                                    clipPath: "polygon(15% 0, 85% 0, 100% 100%, 0 100%)",
                                    background: "rgba(255,255,255,0.04)",
                                }}
                            >
                                <EnvBosWhisper align="center" />
                            </div>
                        </div>
                    </EnvStage>
                </EnvMockupSection>

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Frozen operational model</p>
                    <p className="mt-1">
                        Material = center of gravity · BOS = supporting intelligence · Findings = emergent
                        outputs · In-place analysis · No wizard · No forms · No giant textareas · No container
                        borders.
                    </p>
                </footer>
            </div>
        </div>
    );
}
