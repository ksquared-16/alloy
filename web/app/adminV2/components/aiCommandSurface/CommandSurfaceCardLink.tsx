"use client";

import { useState, type ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import {
    COMMAND_SURFACE_INTERACTIVE_CARD_CLASS,
    COMMAND_SURFACE_NAV_OPENING_LABEL,
    handleCommandSurfaceCardNavigate,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";

export function CommandSurfaceActionCardShell({
    children,
    className,
    ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={[COMMAND_SURFACE_INTERACTIVE_CARD_CLASS, className].filter(Boolean).join(" ")}
            {...rest}
        >
            {children}
        </div>
    );
}

export function CommandSurfaceCardLink({
    href,
    children,
    className,
    style,
    onNavigate,
    openingLabel = COMMAND_SURFACE_NAV_OPENING_LABEL,
    collapseCommandSurface = true,
    ...rest
}: {
    href: string;
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    /** Optional shell-level navigation (e.g. GlobalAssistant hook). */
    onNavigate?: (href: string) => void;
    openingLabel?: string;
    /** When true, collapse the command thread after navigation starts. */
    collapseCommandSurface?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick" | "children" | "className" | "style">) {
    const router = useRouter();
    const globalAssistant = useGlobalAssistantOptional();
    const [navigating, setNavigating] = useState(false);

    const onClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (navigating) return;
        handleCommandSurfaceCardNavigate(
            event,
            href,
            (target) => {
                if (onNavigate) {
                    onNavigate(target);
                    return;
                }
                void router.push(target);
            },
            {
                onNavigateStart: () => {
                    setNavigating(true);
                    if (collapseCommandSurface) {
                        globalAssistant?.collapseCommandSurfaceAfterNavigation();
                    }
                },
            }
        );
    };

    return (
        <button
            type="button"
            disabled={navigating || rest.disabled}
            aria-busy={navigating}
            className={[COMMAND_SURFACE_INTERACTIVE_CARD_CLASS, className].filter(Boolean).join(" ")}
            style={style}
            onClick={onClick}
            {...rest}
        >
            {navigating ? openingLabel : children}
        </button>
    );
}
