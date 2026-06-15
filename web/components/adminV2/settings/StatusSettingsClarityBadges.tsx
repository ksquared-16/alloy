"use client";

import type { StatusDrawerSourceTag } from "@/lib/admin/statusSettingsClarity";
import { STATUS_DRAWER_SOURCE_TAG_LABELS } from "@/lib/admin/statusSettingsClarity";

const TAG_CLASS =
    "inline-flex rounded-md border border-alloy-stone/25 bg-alloy-stone/8 px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/75";

export function StatusDrawerSourceBadge({ tag }: { tag: StatusDrawerSourceTag }) {
    return (
        <span className={TAG_CLASS} data-status-drawer-source-tag={tag}>
            {STATUS_DRAWER_SOURCE_TAG_LABELS[tag]}
        </span>
    );
}

export function StatusDrawerSourceBadgeList({ tags }: { tags: readonly StatusDrawerSourceTag[] }) {
    if (!tags.length) return null;
    return (
        <span className="flex flex-wrap gap-1" data-status-drawer-source-badges="true">
            {tags.map((tag) => (
                <StatusDrawerSourceBadge key={tag} tag={tag} />
            ))}
        </span>
    );
}

export function PersonStatusPreviewNotes({ notes }: { notes: readonly string[] }) {
    if (!notes.length) return null;
    return (
        <ul
            className="mt-1 space-y-0.5 text-[10px] leading-snug text-[#59678b]"
            data-person-status-drawer-preview="true"
        >
            {notes.map((note) => (
                <li key={note}>{note}</li>
            ))}
        </ul>
    );
}
