"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormsOperationalLink } from "@/components/forms/workspace/FormsOperationalLink";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import {
    buildPacketContextOperatorCopy,
    resolveFormPacketMemberships,
    type FormPacketMembership,
    type PacketDefinitionItemRow,
    type PacketDefinitionSummary,
} from "@/lib/forms/formPacketMembershipPresentation";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    formId: string;
    formName: string;
    hasPublished: boolean;
};

const MAX_PACKETS_TO_SCAN = 15;

export function FormPacketContextPanel({ formId, formName, hasPublished }: Props) {
    const [memberships, setMemberships] = useState<FormPacketMembership[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const loadMemberships = useCallback(async () => {
        setLoading(true);
        setLoadErr(null);
        try {
            const listRes = await fetch("/api/admin/forms/packet-definitions", { credentials: "include" });
            const listJson = await listRes.json().catch(() => ({}));
            if (!listRes.ok) {
                setLoadErr("Could not load packet definitions.");
                setMemberships([]);
                return;
            }

            const definitions = ((listJson as { data?: PacketDefinitionSummary[] }).data ?? []).filter(
                (d) => d.is_active
            );
            const scan = definitions.slice(0, MAX_PACKETS_TO_SCAN);

            const detailResults = await Promise.all(
                scan.map(async (def) => {
                    const res = await fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(def.id)}`, {
                        credentials: "include",
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) return { def, items: [] as PacketDefinitionItemRow[] };
                    const items = (json as { data?: { items?: PacketDefinitionItemRow[] } }).data?.items ?? [];
                    return { def, items };
                })
            );

            const itemsByDefinitionId: Record<string, PacketDefinitionItemRow[]> = {};
            for (const row of detailResults) {
                itemsByDefinitionId[row.def.id] = row.items;
            }

            setMemberships(
                resolveFormPacketMemberships({
                    formId,
                    definitions: scan,
                    itemsByDefinitionId,
                })
            );
        } catch {
            setLoadErr("Could not load packet definitions.");
            setMemberships([]);
        } finally {
            setLoading(false);
        }
    }, [formId]);

    useEffect(() => {
        void loadMemberships();
    }, [loadMemberships]);

    const copy = useMemo(
        () => buildPacketContextOperatorCopy({ memberships, formName }),
        [memberships, formName]
    );

    const addToPacketHref = `${FORMS_MODULE_ROUTES.packetDefinitions}?addForm=${encodeURIComponent(formId)}`;

    return (
        <div
            className="rounded-xl bg-white/95 px-4 py-3.5 ring-1 ring-alloy-midnight/[0.08]"
            data-testid="form-packet-context-panel"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className={opSectionTitle}>Use in an enrollment packet</h2>
                    <p className={clsx("mt-0.5", opMutedMeta)}>{copy.lead}</p>
                </div>
            </div>

            <ul className={clsx("mt-2 space-y-0.5", opMetadata)}>
                {copy.bullets.map((line) => (
                    <li key={line}>· {line}</li>
                ))}
            </ul>

            {loading ?
                <p className={clsx("mt-2", opMutedMeta)}>Checking packet membership…</p>
            : loadErr ?
                <p className={clsx("mt-2 text-sm text-amber-900")}>{loadErr}</p>
            : memberships.length > 0 ?
                <ul className={clsx(opGroupedSurface, "mt-3")} data-testid="form-packet-membership-list">
                    {memberships.map((m) => (
                        <li key={m.packetDefinitionId} className={opGroupedRowInner}>
                            <p className="text-sm font-medium text-alloy-midnight">{m.packetName}</p>
                            <p className={clsx("mt-0.5", opMutedMeta)}>
                                Step {m.stepNumber} of {m.totalSteps}
                                {m.stepFormName ? ` · ${m.stepFormName}` : ""}
                            </p>
                            <Link
                                href={`${ADMIN_FORMS_UI_BASE}/packet-definitions/${encodeURIComponent(m.packetDefinitionId)}`}
                                className="mt-1 inline-block text-xs font-semibold text-alloy-blue hover:underline"
                                data-testid={`form-packet-open-${m.packetDefinitionId}`}
                            >
                                Open packet setup
                            </Link>
                        </li>
                    ))}
                </ul>
            :   null}

            <p className={clsx("mt-3", opMetadata)}>
                {hasPublished ?
                    <>
                        <FormsOperationalLink href={addToPacketHref}>Add this form to a packet flow</FormsOperationalLink>
                        {" · "}
                    </>
                :   "Publish this form before adding it to a packet. "}
                <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetDefinitions}>Browse packets</FormsOperationalLink>
                {" · "}
                Send packets from an enrollment inquiry drawer.
            </p>
        </div>
    );
}
