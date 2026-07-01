"use client";

import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & {
    children: ReactNode;
    onOpen?: () => void;
};

/** Visual wrapper for row content — row open is handled by content-level click delegation. */
export default function QueueRowOpenZone({ children, className, title, onOpen, ...rest }: Props) {
    return (
        <span
            className={[
                "queue-row-open-zone",
                onOpen ? "queue-row-open-zone--openable" : null,
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            title={title}
            {...rest}
        >
            {children}
        </span>
    );
}
