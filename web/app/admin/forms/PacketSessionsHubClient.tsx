"use client";

import clsx from "clsx";
import Link from "next/link";
import { FormsOperationalLink, FormsWorkspaceShell } from "@/components/forms/workspace";
import { formsWorkspaceBreadcrumbs, FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import { opGroupedSurface, opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

export type PacketSessionListRow = {
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    packet_definition_id: string;
    packet_name: string | null;
};

type Props = {
    sessions: PacketSessionListRow[];
    errorMessage?: string | null;
};

export default function PacketSessionsHubClient({ sessions, errorMessage }: Props) {
    return (
        <FormsWorkspaceShell
            title="Packet sessions"
            subtitle="Enrollment and multi-step intake runs — open a session for case-file review and decisions."
            breadcrumbs={formsWorkspaceBreadcrumbs([{ label: "Sessions" }])}
            actions={
                <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetDefinitions}>
                    Packet definitions
                </FormsOperationalLink>
            }
        >
            {errorMessage ?
                <p className="text-sm text-alloy-ember">{errorMessage}</p>
            : sessions.length === 0 ?
                <p className={opMetadata}>
                    No packet sessions yet. Configure a packet under{" "}
                    <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetDefinitions}>
                        Packets
                    </FormsOperationalLink>
                    , then mint a packet public link to start intake.
                </p>
            :   <ul className={opGroupedSurface} data-testid="packet-sessions-hub-list">
                    {sessions.map((s) => (
                        <li key={s.id}>
                            <Link
                                href={`${FORMS_MODULE_ROUTES.packetSessions}/${s.id}`}
                                className="block px-4 py-3 transition-colors hover:bg-alloy-stone/15"
                            >
                                <span className="text-sm font-medium text-alloy-midnight">
                                    {s.packet_name ?? "Packet session"}
                                </span>
                                <span className={clsx("mt-1 block", opMetadata)}>
                                    {s.status}
                                    {" · "}
                                    {new Date(s.created_at).toLocaleString()}
                                    {s.completed_at ?
                                        ` · completed ${new Date(s.completed_at).toLocaleString()}`
                                    :   ""}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            }
        </FormsWorkspaceShell>
    );
}
