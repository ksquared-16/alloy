"use client";

/** Canonical docked action bar — white/near-white, subtle top border. */

import type { ReactNode } from "react";

export default function WorkspaceActionBar({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) {
    return (
        <div className="shrink-0 border-t border-alloy-stone/12 bg-white px-3 py-2.5">
            {eyebrow ? (
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-alloy-juniper/80">{eyebrow}</div>
            ) : null}
            {children}
        </div>
    );
}
