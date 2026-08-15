"use client";

/**
 * THE CONFIGURED CONTEXTUAL CARD, rendered on a durable host.
 *
 * It resolves the tenant's published Focus Panel composition for the SELECTED context's addressing
 * tuple — the same `entity_layouts` row, through the same endpoint and the same
 * `resolveSurfaceVariant`, that the native operational Focus Panel resolves — and renders the Child
 * card's configured fields from it.
 *
 * Flatter than the native card, and deliberately so: a record host is a denser surface than a work
 * surface. What it may NOT do is change which fields exist, what they are called, what order they
 * are in, or which may be edited — none of which is decided here. `resolveContextualChildCard`
 * decides, from configuration, for both hosts.
 *
 * ── WHY THE DOC ID AND VERSION ARE IN THE DOM ──
 *
 * The invariant is an equality between two hosts, and equality claims that cannot be observed tend
 * to become aspirations. The resolved layout id, its version and a fingerprint of the effective
 * configuration are published as data attributes so a browser certification can assert the SAME
 * values it reads on the native panel — rather than asserting that both surfaces "show child
 * information", which is exactly the proof the architecture brief refuses.
 *
 * ── AN UNCONFIGURABLE CONTEXT SAYS SO ──
 *
 * Assignment and Employment have no business process, so there is no published composition to
 * resolve for them. The card states that plainly instead of approximating one. Inventing a card for
 * a context that has none is the failure mode this whole slice exists to avoid.
 */

import { useEffect, useState } from "react";

import type { DurableRecordContextOption } from "@/lib/context/durableRecordContextOptions";
import {
    contextualCardConfigurationFingerprint,
    resolveContextualChildCard,
} from "@/lib/adminV2/runtime/focusPanel/contextualCard/resolveContextualChildCard";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

type Resolved = {
    doc: LayoutDoc | null;
    layoutId: string | null;
    version: number | null;
};

/** The published composition for one addressing tuple. Null doc = nothing published applies. */
async function fetchPublishedComposition(option: DurableRecordContextOption): Promise<Resolved> {
    const params = new URLSearchParams();
    if (option.businessProcessKey) params.set("businessProcessKey", option.businessProcessKey);
    if (option.workViewId) params.set("workViewId", option.workViewId);
    if (option.stageKey) params.set("stageKey", option.stageKey);
    if (option.statusKey) params.set("statusKey", option.statusKey);
    const qs = params.toString();

    try {
        const res = await fetch(
            `/api/admin/entity-layouts/focus-panel-summary${qs ? `?${qs}` : ""}`,
            { credentials: "include" },
        );
        if (!res.ok) return { doc: null, layoutId: null, version: null };
        const json = (await res.json().catch(() => null)) as
            | { published?: { id?: string; version?: number; doc?: LayoutDoc } | null }
            | null;
        const published = json?.published ?? null;
        return {
            doc: published?.doc ?? null,
            layoutId: published?.id ?? null,
            version: published?.version ?? null,
        };
    } catch {
        // A failed publication read must not cost the operator the card: the platform default is a
        // correct composition, and `fromPublishedDoc` below reports which one is in force.
        return { doc: null, layoutId: null, version: null };
    }
}

export default function DurableRecordContextualCard({
    option,
    subject,
}: {
    option: DurableRecordContextOption;
    subject: DurableChildSubject;
}) {
    const [resolved, setResolved] = useState<Resolved | null>(null);

    useEffect(() => {
        if (!option.resolvesConfiguredSurface) {
            setResolved({ doc: null, layoutId: null, version: null });
            return;
        }
        let alive = true;
        setResolved(null);
        void fetchPublishedComposition(option).then((next) => {
            if (alive) setResolved(next);
        });
        return () => {
            alive = false;
        };
        // The ADDRESSING TUPLE is the dependency, not the option object — re-selecting a context
        // that addresses the same composition must not re-fetch it.
    }, [
        option,
        option.businessProcessKey,
        option.workViewId,
        option.stageKey,
        option.statusKey,
        option.resolvesConfiguredSurface,
    ]);

    if (!option.resolvesConfiguredSurface) {
        return (
            <div
                className="rounded-lg border border-alloy-stone/22 bg-white p-3"
                data-contextual-card="unconfigured"
                data-contextual-card-context={option.key}
            >
                <p className="text-[12.5px] font-medium text-alloy-midnight/75">{option.label}</p>
                <p className="mt-1 max-w-[60ch] text-[12px] text-alloy-midnight/55">
                    {option.detail ?? "No detail recorded."}
                </p>
                <p className="mt-2 max-w-[60ch] text-[11.5px] text-alloy-midnight/45">
                    This context has no configured card. It is not part of a business process, so
                    there is no published composition to show — the record&rsquo;s own information is
                    above.
                </p>
            </div>
        );
    }

    if (!resolved) {
        return (
            <div
                className="rounded-lg border border-alloy-stone/22 bg-white p-3 text-[12px] text-alloy-midnight/50"
                data-contextual-card="loading"
            >
                Resolving configured card…
            </div>
        );
    }

    const card = resolveContextualChildCard(resolved.doc, subject, {
        fromPublishedDoc: resolved.doc != null,
    });
    const fingerprint = contextualCardConfigurationFingerprint(card.rows);

    return (
        <div
            className="rounded-lg border border-alloy-stone/22 bg-white"
            data-contextual-card="child"
            data-contextual-card-context={option.key}
            // ── THE EQUALITY EVIDENCE ──
            data-contextual-card-layout-id={resolved.layoutId ?? ""}
            data-contextual-card-layout-version={resolved.version ?? ""}
            data-contextual-card-nested-surface={card.nestedSurfaceId}
            data-contextual-card-from-published={card.fromPublishedDoc ? "true" : "false"}
            data-contextual-card-fingerprint={fingerprint}
            data-contextual-card-business-process={option.businessProcessKey ?? ""}
            data-contextual-card-stage={option.stageKey ?? ""}
            data-contextual-card-work-view={option.workViewId ?? ""}
        >
            <div className="flex items-baseline justify-between gap-2 border-b border-alloy-stone/15 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-alloy-bend-pine">
                    Child
                </span>
                <span className="text-[11px] text-alloy-midnight/45">{option.label}</span>
            </div>

            {card.rows.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-alloy-midnight/50">
                    No fields are configured on the Child card for this context.
                </p>
            ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-3">
                    {card.rows.map((row) => (
                        <div
                            key={row.fieldKey}
                            className={row.layoutWidth === "full" ? "col-span-2" : undefined}
                            data-contextual-card-field={row.fieldKey}
                            data-contextual-card-field-editable={row.editable ? "true" : "false"}
                        >
                            <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                {row.label}
                            </dt>
                            <dd className="text-[12.5px] text-alloy-midnight">
                                {row.value ?? (
                                    <span className="text-alloy-midnight/35">Not set</span>
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}
