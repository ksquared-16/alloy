"use client";

import { ShapeR2Triple, type ShapeR2Id } from "./ShapeR2Shared";

const SHAPE_ORDER: ShapeR2Id[] = [
    "stadium-plus",
    "cloud-stadium",
    "orbital-capsule",
    "cloud-core",
    "winged-stadium",
    "superellipse",
    "forged-oval",
    "signature-bos",
];

export default function OperationalIntakeShapeR2Gallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1600px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Shape exploration round 2 · mockups only
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Operational Intake Workspace — Signature Shell Shapes
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Eight signature silhouettes. Frozen interior. Each shape shown with atmosphere A (Bend
                        Pine only), B (+ smoke aura), C (+ material glow). Shell is outer frame — safe area
                        never clipped.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/operational-intake-shape-r2</p>
                </header>

                {SHAPE_ORDER.map((id) => (
                    <ShapeR2Triple key={id} shapeId={id} />
                ))}

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Round 2 winner baseline: Stadium Plus</p>
                    <p className="mt-1">
                        Compare silhouettes at distance — operational, premium, BOS. Interior frozen across all{" "}
                        {SHAPE_ORDER.length} shapes × 3 atmosphere passes.
                    </p>
                </footer>
            </div>
        </div>
    );
}
