"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import {
    workspaceActionRailButtonClass,
    type WorkspaceActionRailTier,
} from "@/lib/adminV2/workspace/workspaceActionRailButton";

type SharedProps = {
    tier: WorkspaceActionRailTier;
    children: ReactNode;
    className?: string;
    emphasized?: boolean;
};

const EMPHASIZED_STYLE = { boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.5)" } as const;

function mergeClassName(tier: WorkspaceActionRailTier, className?: string): string {
    return workspaceActionRailButtonClass(tier, className);
}

type ButtonProps = SharedProps &
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
        as?: "button";
    };

type LinkProps = SharedProps & {
    as: "link";
    href: string;
    prefetch?: boolean;
};

export function WorkspaceActionRailButton(props: ButtonProps | LinkProps) {
    const { tier, children, className, emphasized } = props;
    const cls = mergeClassName(tier, className);
    const style = emphasized ? EMPHASIZED_STYLE : undefined;

    if (props.as === "link") {
        const { href, prefetch } = props;
        return (
            <Link href={href} prefetch={prefetch} className={cls} style={style}>
                {children}
            </Link>
        );
    }

    const { as: _as, ...buttonProps } = props;
    return (
        <button type="button" {...buttonProps} className={cls} style={style}>
            {children}
        </button>
    );
}
