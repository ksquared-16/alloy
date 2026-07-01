import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps } from "react";
import { opActionLink } from "@/lib/operational/ui/operationalVisualTokens";

type Props = ComponentProps<typeof Link> & {
    className?: string;
};

/** Contextual navigation link inside Forms module pages. */
export function FormsOperationalLink({ className, children, ...props }: Props) {
    return (
        <Link className={clsx(opActionLink, className)} {...props}>
            {children}
        </Link>
    );
}
