"use client";

import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & {
    children: ReactNode;
    onOpen?: () => void;
};

/** Visual wrapper for row content — row open is handled by content-level click delegation. */
export default function QueueRowOpenZone({ children, className, title, onOpen: _onOpen, ...rest }: Props) {
    return (
        <span className={["queue-row-open-zone", className].filter(Boolean).join(" ")} title={title} {...rest}>
            {children}
        </span>
    );
}
