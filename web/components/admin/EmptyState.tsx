"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
    title?: string;
    description?: string;
    action?: ReactNode;
}

export default function EmptyState({ title = "No data yet", description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#e6e8ec] bg-[#F4F6F9]/50 py-12 px-6 text-center">
            <p className="text-sm font-medium text-[#59678b]">{title}</p>
            {description && <p className="mt-1 text-xs text-[#59678b]/80">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
