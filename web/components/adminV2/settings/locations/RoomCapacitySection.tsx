"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { CONFIG_OBJECT_CELL, ConfigEditorSection } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { locationWorkspaceHref } from "@/lib/locations/locationWorkspaceModel";
import {
    CAPACITY_KIND_HINTS,
    CAPACITY_KIND_LABELS,
    LEGACY_CAPACITY_DISCARDED,
    LEGACY_CAPACITY_REVIEW_KEY,
    resolveRoomCapacityStanding,
    type CapacityKindName,
    type RoomCapacityStanding,
} from "@/lib/locations/capacityAdoptionState";
import {
    adoptableCapacity,
    buildAdoptionPreview,
    buildLegacyCapacityAdoptionBody,
    buildLegacyCapacityDiscardMetadata,
} from "@/lib/locations/capacityAdoptionRequest";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

/** Canonical resolution, as the server returns it. Never recomputed here. */
type ResolvedCapacity = {
    status: string;
    physicalCapacity: number | null;
    licensedCapacity: number | null;
    configuredCapacity: number | null;
    ratioConstrainedCapacity: number | null;
    bindingCapacity: number | null;
    limitingFactor: string | null;
};

const LIMITING_FACTOR_LABELS: Record<string, string> = {
    physical: "Physical capacity",
    licensed: "Licensed capacity",
    operational: "Operational capacity",
    ratio: "Ratio",
    staffed: "Staffing",
};

const KINDS: CapacityKindName[] = ["physical", "licensed", "operational"];

/**
 * A room's capacity, across the two systems that currently hold it.
 *
 * The legacy field is a single untyped number; canonical capacity is typed,
 * effective-dated and resolved server-side. This surface never mixes them and
 * never computes a binding figure of its own — binding weighs ratio-limited
 * capacity, which is derived rather than authored, so a client minimum over the
 * authored kinds would print a larger number than the room can operate at.
 */
export default function RoomCapacitySection({
    room,
    siteId,
    capacityRules,
    todayYmd,
    canMutate,
    onAdopted,
    onSaveRoom,
}: {
    room: LocationHierarchyRow;
    siteId: string | null;
    capacityRules: readonly ChildcareCapacityRuleRow[];
    todayYmd: string;
    canMutate: boolean;
    /** Re-read canonical rules after a write. */
    onAdopted: () => Promise<void> | void;
    /** Persist a room metadata patch (used only by discard). */
    onSaveRoom: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
    const standing: RoomCapacityStanding = resolveRoomCapacityStanding(room, capacityRules);
    const [choosing, setChoosing] = useState(false);
    const [kind, setKind] = useState<CapacityKindName | "discard" | "">("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resolved, setResolved] = useState<ResolvedCapacity | null>(null);

    useEffect(() => {
        setChoosing(false);
        setKind("");
        setError(null);
    }, [room.id]);

    // Canonical figures come from the server resolver, never from the rules here.
    useEffect(() => {
        let cancelled = false;
        if (standing.canonicalRules.length === 0) {
            setResolved(null);
            return;
        }
        void (async () => {
            try {
                const res = await fetch(
                    `/api/admin/operational-config/resolved-capacity?room_location_id=${encodeURIComponent(room.id)}`,
                    { credentials: "include" },
                );
                const json = (await res.json()) as { resolution?: ResolvedCapacity };
                if (!cancelled && res.ok) setResolved(json.resolution ?? null);
            } catch {
                /* the section degrades to the unresolved state */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [room.id, standing.canonicalRules.length]);

    const legacy = standing.legacyValue;
    const manageHref = siteId ? locationWorkspaceHref(siteId, "operational-rules") : null;

    const commit = async () => {
        if (!kind || !legacy) return;
        setBusy(true);
        setError(null);
        try {
            if (kind === "discard") {
                await onSaveRoom(room.id, {
                    metadata: buildLegacyCapacityDiscardMetadata(
                        room.metadata,
                        LEGACY_CAPACITY_REVIEW_KEY,
                        LEGACY_CAPACITY_DISCARDED,
                    ),
                });
            } else {
                const body = buildLegacyCapacityAdoptionBody({
                    roomLocationId: room.id,
                    legacyValue: legacy,
                    capacityKind: kind,
                    effectiveStart: todayYmd,
                    retainLegacy: true,
                    adoptedAt: new Date().toISOString(),
                });
                if (!body) throw new Error("This capacity is not a whole number of seats and cannot be confirmed.");
                const res = await fetch("/api/admin/operational-config/capacity-rules", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? `Could not confirm capacity (${res.status})`);
            }
            await onAdopted();
            setChoosing(false);
            setKind("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not confirm capacity.");
        } finally {
            setBusy(false);
        }
    };

    const preview =
        kind && kind !== "discard" && legacy
            ? buildAdoptionPreview({
                  roomLabel: (room.label ?? "").trim() || "This room",
                  legacyValue: legacy,
                  capacityKind: kind,
                  kindLabel: CAPACITY_KIND_LABELS[kind],
                  effectiveStart: todayYmd,
                  retainLegacy: true,
              })
            : null;

    return (
        <ConfigEditorSection title="Capacity" testId="locations-room-capacity">
            {standing.canonicalRules.length > 0 ?
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="locations-room-capacity-canonical">
                    {resolved?.bindingCapacity != null ?
                        <Cell testId="binding" label="Binding" value={`${resolved.bindingCapacity} seats`} />
                    :   null}
                    {KINDS.map((k) => {
                        const field = k === "operational" ? "configuredCapacity" : (`${k}Capacity` as const);
                        const value = resolved?.[field as keyof ResolvedCapacity];
                        // A kind with no rule is absent, never zero.
                        return typeof value === "number" ?
                                <Cell key={k} testId={k} label={CAPACITY_KIND_LABELS[k]} value={String(value)} />
                            :   null;
                    })}
                    {resolved?.limitingFactor ?
                        <Cell
                            testId="limiting"
                            label="Limited by"
                            value={LIMITING_FACTOR_LABELS[resolved.limitingFactor] ?? resolved.limitingFactor}
                        />
                    :   null}
                    {resolved && resolved.status === "not_configured" ?
                        <p className="config-typo-sublabel" data-testid="locations-room-capacity-unresolved">
                            No capacity resolves for this room yet.
                        </p>
                    :   null}
                </div>
            :   null}

            {standing.needsConfirmation && legacy ?
                <div className="space-y-2" data-testid="locations-room-capacity-review">
                    <div className={CONFIG_OBJECT_CELL}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            {standing.canonicalRules.length > 0 ? "Earlier capacity" : "Capacity"}
                        </p>
                        <p className="mt-0.5 text-base font-semibold leading-tight text-alloy-midnight">
                            {legacy} seats
                        </p>
                        <p className="config-typo-sublabel mt-0.5" data-testid="locations-room-capacity-needs-review">
                            Needs review — recorded before capacity types were introduced, so we do not know
                            whether it means physical, licensed or operational seats.
                        </p>
                    </div>

                    {!choosing && canMutate ?
                        <ConfigurationSecondaryButton
                            className="config-primary-btn--sm"
                            onClick={() => setChoosing(true)}
                            data-testid="locations-room-capacity-confirm"
                        >
                            {standing.canonicalRules.length > 0 ? "Review legacy value" : "Confirm capacity"}
                        </ConfigurationSecondaryButton>
                    :   null}

                    {choosing ?
                        <div className="space-y-2" data-testid="locations-room-capacity-chooser">
                            <label className="block max-w-md space-y-1">
                                <span className="config-typo-field-label">This capacity means</span>
                                <select
                                    value={kind}
                                    onChange={(e) => setKind(e.target.value as CapacityKindName | "discard" | "")}
                                    className="config-runtime-select"
                                    data-testid="locations-room-capacity-kind"
                                >
                                    {/* Nothing is preselected. The operator makes the claim. */}
                                    <option value="">Choose…</option>
                                    {KINDS.map((k) => (
                                        <option key={k} value={k}>
                                            {CAPACITY_KIND_LABELS[k]} capacity
                                        </option>
                                    ))}
                                    <option value="discard">Discard this value</option>
                                </select>
                                {kind && kind !== "discard" ?
                                    <p className="config-typo-sublabel">{CAPACITY_KIND_HINTS[kind]}</p>
                                :   null}
                            </label>

                            {preview ?
                                <div className={CONFIG_OBJECT_CELL} data-testid="locations-room-capacity-preview">
                                    <p className="config-typo-sublabel">
                                        {preview.roomLabel} · {preview.currentValue} ({preview.currentQualifier})
                                    </p>
                                    <p className="mt-0.5 text-sm font-semibold text-alloy-midnight">
                                        {preview.resultLine}
                                    </p>
                                    <p className="config-typo-sublabel mt-0.5">{preview.effectiveLine}</p>
                                    <p className="config-typo-sublabel">Earlier value: {preview.legacyLine}</p>
                                </div>
                            :   null}

                            {kind === "discard" ?
                                <div className={CONFIG_OBJECT_CELL} data-testid="locations-room-capacity-discard-preview">
                                    <p className="text-sm font-semibold text-alloy-midnight">
                                        {legacy} seats will stop counting as this room&rsquo;s capacity.
                                    </p>
                                    <p className="config-typo-sublabel mt-0.5">
                                        The number is kept as a record of what was there. Set real capacity in
                                        Operational Rules when you are ready.
                                    </p>
                                </div>
                            :   null}

                            {error ?
                                <p className="text-sm text-red-800" role="alert">
                                    {error}
                                </p>
                            :   null}

                            <div className="flex flex-wrap gap-2">
                                <ConfigurationPrimaryButton
                                    className="config-primary-btn--sm"
                                    disabled={!kind || busy || (kind !== "discard" && adoptableCapacity(legacy) == null)}
                                    onClick={() => void commit()}
                                    data-testid="locations-room-capacity-commit"
                                >
                                    {busy ? "Saving…"
                                    : kind === "discard" ? "Discard value"
                                    : "Confirm capacity"}
                                </ConfigurationPrimaryButton>
                                <ConfigurationSecondaryButton
                                    onClick={() => {
                                        setChoosing(false);
                                        setKind("");
                                        setError(null);
                                    }}
                                    disabled={busy}
                                    data-testid="locations-room-capacity-cancel"
                                >
                                    Cancel
                                </ConfigurationSecondaryButton>
                            </div>
                        </div>
                    :   null}
                </div>
            :   null}

            {standing.state === "no_capacity" || standing.state === "legacy_discarded" ?
                <p className="config-typo-sublabel" data-testid="locations-room-capacity-empty">
                    No capacity configured for this room.
                </p>
            :   null}

            {manageHref ?
                <Link
                    href={manageHref}
                    className="config-typo-sublabel text-alloy-pine"
                    data-testid="locations-room-capacity-manage"
                >
                    Manage capacity rules →
                </Link>
            :   null}
        </ConfigEditorSection>
    );
}

function Cell({ testId, label, value }: { testId: string; label: string; value: string }) {
    return (
        <div className={CONFIG_OBJECT_CELL} data-testid={`locations-room-capacity-${testId}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">{label}</p>
            <p className="mt-0.5 text-base font-semibold leading-tight text-alloy-midnight">{value}</p>
        </div>
    );
}
