"use client";

import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
    COMMAND_SURFACE_INTERACTIVE_CARD_CLASS,
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
    ...rest
}: {
    href: string;
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    /** Optional shell-level navigation (e.g. GlobalAssistant hook). */
    onNavigate?: (href: string) => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick" | "children" | "className" | "style">) {
    const router = useRouter();

    const onClick = (event: MouseEvent<HTMLButtonElement>) => {
        handleCommandSurfaceCardNavigate(event, href, (target) => {
            if (onNavigate) {
                onNavigate(target);
                return;
            }
            void router.push(target);
        });
    };

    return (
        <button
            type="button"
            className={[COMMAND_SURFACE_INTERACTIVE_CARD_CLASS, className].filter(Boolean).join(" ")}
            style={style}
            onClick={onClick}
            {...rest}
        >
            {children}
        </button>
    );
}
