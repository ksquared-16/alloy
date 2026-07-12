"use client";

import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";

type Props = {
    children: ChildrenEvidenceChild[];
    selectedId?: string | null;
    onSelect: (childId: string) => void;
    hint?: string;
};

export default function IdentityComposeChildPicker({
    children,
    selectedId,
    onSelect,
    hint = "Select a child to configure Detail Fields",
}: Props) {
    if (children.length === 0) return null;
    return (
        <div className="identity-compose-child-picker space-y-2" data-identity-compose-child-picker="true">
            <p className="config-typo-sublabel">{hint}</p>
            <ul className="space-y-1">
                {children.map((child) => (
                    <li key={child.id}>
                        <button
                            type="button"
                            className="w-full rounded-md border border-alloy-stone/15 px-3 py-2 text-left text-[12px] hover:border-alloy-pine/30 hover:bg-alloy-pine/5"
                            data-identity-compose-child={child.id}
                            aria-current={selectedId === child.id ? "true" : undefined}
                            onClick={() => onSelect(child.id)}
                        >
                            {child.name}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
