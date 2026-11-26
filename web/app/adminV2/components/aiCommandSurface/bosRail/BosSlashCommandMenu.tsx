"use client";

import type { BosSlashCommandDescriptor } from "@/lib/bos/commandSession/types";

export function BosSlashCommandMenu(props: {
    items: BosSlashCommandDescriptor[];
    activeIndex: number;
    onHighlight: (index: number) => void;
    onSelect: (item: BosSlashCommandDescriptor) => void;
}) {
    if (props.items.length === 0) {
        return (
            <div
                className="mb-2 rounded-lg border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] text-alloy-midnight/60 shadow-sm"
                data-bos-slash-menu="true"
                data-bos-slash-empty="true"
                role="listbox"
                aria-label="Commands"
            >
                No matching commands.
            </div>
        );
    }
    return (
        <ul
            className="mb-2 max-h-48 overflow-y-auto rounded-lg border border-alloy-stone/30 bg-white py-1 shadow-sm"
            data-bos-slash-menu="true"
            role="listbox"
            aria-label="Commands"
        >
            {props.items.map((item, index) => {
                const active = index === props.activeIndex;
                return (
                    <li key={item.actionKey} role="option" aria-selected={active}>
                        <button
                            type="button"
                            className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[13px] ${
                                active ? "bg-alloy-bend-pine/10" : "hover:bg-alloy-stone/10"
                            } ${item.eligible ? "text-alloy-midnight" : "text-alloy-midnight/45"}`}
                            data-bos-slash-item={item.actionKey}
                            data-bos-slash-eligible={item.eligible ? "true" : "false"}
                            disabled={!item.eligible}
                            onMouseEnter={() => props.onHighlight(index)}
                            onClick={() => {
                                if (item.eligible) props.onSelect(item);
                            }}
                        >
                            <span className="font-semibold">{item.displayLabel}</span>
                            <span className="text-[11px] text-alloy-midnight/55">
                                /{item.token}
                                {item.ineligibleReason ? ` — ${item.ineligibleReason}` : ` — ${item.description}`}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
