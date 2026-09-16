"use client";


import { opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type PacketUsageVM = {
    processName: string;
    stageName: string;
    level: string;
    blocking: boolean;
    published: boolean;
};

export type PacketExperienceVM = {
    familyExperience: string[];
    /** "1 Form and 2 document obligations" — what the packet CONTAINS. */
    contentSummary?: string;
    readiness: { ok: boolean; label: string }[];
    ready: boolean;
    usage: PacketUsageVM[];
};

/**
 * METADATA, NOT A DASHBOARD.
 *
 * This was three full-width cards — Family experience, Ready to use, Used by — stacked above the
 * obligations. Between them and the packet title they pushed "What families complete", the actual
 * object of this workspace, off the bottom of a laptop screen. An administrator opened a packet
 * configuration screen and had to scroll past a dashboard reporting that everything was fine.
 *
 * Three green checks are not information; "Ready to use ✓" is. The checks come back the moment
 * something is actually wrong, which is the only moment they were ever worth the space.
 *
 * The ordered obligations below already say what a family experiences, and Preview experience
 * shows it. So the narrative card is gone rather than collapsed: it was a third telling.
 */

/** "Ready to use ✓", or the specific things that are not ready. Same readiness owner, less paint. */
export function PacketReadinessChip({ vm }: { vm: PacketExperienceVM }) {
    const problems = vm.readiness.filter((r) => !r.ok);
    if (vm.ready && problems.length === 0) {
        return (
            <span
                className="inline-flex items-center gap-1 text-[12px] font-medium text-alloy-bend-pine"
                data-testid="packet-readiness"
            >
                <span aria-hidden>✓</span>
                Ready to use
            </span>
        );
    }
    return (
        <span className="inline-flex flex-col gap-0.5" data-testid="packet-readiness">
            {problems.map((r) => (
                <span key={r.label} className="inline-flex items-start gap-1 text-[12px] font-medium text-alloy-ember">
                    <span aria-hidden className="shrink-0">
                        !
                    </span>
                    {r.label}
                </span>
            ))}
        </span>
    );
}

/** "Enrollment · Enrolling · required · blocking" — one line, because that is all it ever said. */
export function PacketUsageLine({ vm }: { vm: PacketExperienceVM }) {
    if (vm.usage.length === 0) {
        return (
            <span className={opMutedMeta} data-testid="packet-usage">
                Not required by a process — can be sent on its own
            </span>
        );
    }
    return (
        <span className={opMutedMeta} data-testid="packet-usage">
            {vm.usage
                .map((u) => [u.processName, u.stageName, u.level, u.blocking ? "blocking" : null].filter(Boolean).join(" · "))
                .join("  |  ")}
        </span>
    );
}
