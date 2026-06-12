"use client";

import {
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
} from "@/lib/admin/actions/bosWorkspaceShell";

import {
    BOARD_CELL_SCALE,
    FROZEN_INTERIOR_HEIGHT_PX,
    FROZEN_INTERIOR_WIDTH_PX,
    SHELL_STUDIES,
    ShellStudyCell,
} from "./ShellStudyBoardShared";
import { SHELL_CANVAS_H, SHELL_CANVAS_W } from "./shellSilhouettePaths";

/** Single comparison board — 8 shell studies, identical frozen interior. */
export default function OperationalIntakeShellBoardGallery() {
    return (
        <div className="min-h-screen bg-[#d8dce3] px-4 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1920px]">
                <header className="mb-6 border-b border-alloy-midnight/10 pb-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Shell geometry only · comparison board · mockups
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Operational Intake — Shell Comparison Board
                    </h1>
                    <p className="mt-2 max-w-4xl text-sm text-alloy-muted">
                        Interior frozen at {FROZEN_INTERIOR_WIDTH_PX}×{FROZEN_INTERIOR_HEIGHT_PX}px — same
                        three-column Create Lead layout in every cell. Each study is a true SVG silhouette
                        (hardware perimeter, not border-radius cards). Identical scale {BOARD_CELL_SCALE} on
                        a shared {SHELL_CANVAS_W}×{SHELL_CANVAS_H}px canvas.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">
                        /dev/operational-intake-shell-board
                    </p>
                </header>

                <section
                    data-mockup="shell-comparison-board"
                    className="relative overflow-hidden rounded-xl border border-alloy-midnight/10"
                    style={{ minHeight: 920 }}
                >
                    <div className="absolute inset-0" style={BOS_BACKDROP_STYLE} aria-hidden />
                    <div
                        className="pointer-events-none absolute inset-0 opacity-50"
                        style={BOS_AMBIENT_GLOW_STYLE}
                        aria-hidden
                    />
                    <div className="relative grid grid-cols-2 gap-x-8 gap-y-10 p-8 lg:grid-cols-4">
                        {SHELL_STUDIES.map((study) => (
                            <ShellStudyCell key={study.id} study={study} />
                        ))}
                    </div>
                </section>

                <footer className="mt-6 rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Unchanged in every cell</p>
                    <p className="mt-1">
                        Header · BOS column · material stack · live findings · spacing · proportions. Perimeter
                        = SVG path silhouette only. No decorative bumps. No border-radius card tricks. No
                        interior resize or clip-path on content.
                    </p>
                </footer>
            </div>
        </div>
    );
}
