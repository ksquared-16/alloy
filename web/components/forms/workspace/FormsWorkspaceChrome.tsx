"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { FormsModuleNav } from "@/components/forms/workspace/FormsModuleNav";
import { opLabelCaps } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    children: ReactNode;
    className?: string;
};

/**
 * Lightweight operational module shell for /adminV2/forms/** — nav + width rhythm only.
 */
export function FormsWorkspaceChrome({ children, className }: Props) {
    return (
        <div
            className={clsx("min-h-full bg-admin-page text-alloy-midnight", className)}
            data-testid="forms-workspace-chrome"
        >
            <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-5 sm:px-6">
                <p className={opLabelCaps}>Intake operations</p>
                <FormsModuleNav className="mt-3" />
                <div className="mt-6">{children}</div>
            </div>
        </div>
    );
}
