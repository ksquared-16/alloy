"use client";

import clsx from "clsx";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type PacketUsageVM = {
    processName: string;
    stageName: string;
    level: string;
    blocking: boolean;
    published: boolean;
};

export type PacketExperienceVM = {
    familyExperience: string[];
    readiness: { ok: boolean; label: string }[];
    ready: boolean;
    usage: PacketUsageVM[];
};

/**
 * The bridge between a packet's configuration and the experience it produces.
 *
 * An administrator configures obligations; Alloy decides the guided conversation from them. Nobody
 * authors a prompt, so the only honest way to show what a family will meet is to state the
 * obligations in order, in the words the family experiences them — which is what this reads back
 * from the configuration that is actually saved.
 */
export function PacketExperienceOverview({ vm }: { vm: PacketExperienceVM | null }) {
    if (!vm) return null;

    return (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="packet-experience-overview">
            <section className="rounded-[14px] border border-alloy-stone/20 bg-white p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                    Family experience
                </h3>
                <p className={clsx("mt-1", opMutedMeta)}>
                    {vm.familyExperience.length} step{vm.familyExperience.length === 1 ? "" : "s"}, in this order.
                </p>
                <ol className="mt-2 space-y-1.5" data-testid="packet-family-experience">
                    {vm.familyExperience.map((line, i) => (
                        <li key={line} className="flex gap-2 text-[12px] leading-snug text-alloy-midnight/80">
                            <span className="shrink-0 font-semibold text-alloy-midnight/40">{i + 1}.</span>
                            <span>{line}</span>
                        </li>
                    ))}
                </ol>
                {/*
                 * Said out loud because it is the question the screen kept failing to answer: the
                 * guided conversation is not configured here, and there is no prompt to author.
                 */}
                <p className={clsx("mt-3", opMutedMeta)}>
                    Alloy guides the family through these conversationally, reuses what it already knows, lets them
                    correct it, and asks them to review before they finish. That behaviour is managed by Alloy.
                </p>
            </section>

            <div className="space-y-4">
                <section className="rounded-[14px] border border-alloy-stone/20 bg-white p-4">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                        {vm.ready ? "Ready to use" : "Not ready yet"}
                    </h3>
                    <ul className="mt-2 space-y-1" data-testid="packet-readiness">
                        {vm.readiness.map((row) => (
                            <li
                                key={row.label}
                                className={clsx(
                                    "flex items-start gap-1.5 text-[12px] leading-snug",
                                    row.ok ? "text-alloy-midnight/75" : "text-alloy-ember",
                                )}
                            >
                                <span aria-hidden className="shrink-0 font-semibold">
                                    {row.ok ? "✓" : "!"}
                                </span>
                                <span>{row.label}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="rounded-[14px] border border-alloy-stone/20 bg-white p-4">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">Used by</h3>
                    {vm.usage.length === 0 ? (
                        <p className={clsx("mt-1", opMetadata)}>
                            No business process requires this packet yet. It can still be sent on its own.
                        </p>
                    ) : (
                        <ul className="mt-2 space-y-1.5" data-testid="packet-usage">
                            {vm.usage.map((u) => (
                                <li key={`${u.processName}-${u.stageName}`} className="text-[12px] leading-snug text-alloy-midnight/80">
                                    <span className="font-medium text-alloy-midnight">
                                        {u.processName} · {u.stageName} stage
                                    </span>
                                    <span className="text-alloy-midnight/55">
                                        {" "}
                                        — {u.level}
                                        {u.blocking ? " · blocking" : ""}
                                    </span>
                                    {/*
                                     * A requirement saved but not published is the difference between what
                                     * this screen shows and what families actually meet. Saying so here is
                                     * the whole reason usage is read from the draft at all.
                                     */}
                                    {!u.published ? (
                                        <p className="mt-0.5 text-[11px] font-medium text-alloy-ember">
                                            Saved, not published yet — families are not being asked for this until the
                                            process is published.
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className={clsx("mt-2", opMutedMeta)}>
                        When a process requires this packet, it launches the family&rsquo;s work automatically.
                    </p>
                </section>
            </div>
        </div>
    );
}
