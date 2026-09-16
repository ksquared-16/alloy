import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps } from "react";
import { opActionLink, opActionLinkAccent } from "@/lib/operational/ui/operationalVisualTokens";

type Props = ComponentProps<typeof Link> & {
    className?: string;
    /**
     * Bend Pine instead of the default. A `className` cannot do this: the base token is appended
     * first and wins on source order, so the colour has to be CHOSEN rather than overridden.
     */
    accent?: boolean;
};

/** Contextual navigation link inside Forms module pages. */
export function FormsOperationalLink({ className, accent, children, ...props }: Props) {
    return (
        <Link className={clsx(accent ? opActionLinkAccent : opActionLink, className)} {...props}>
            {children}
        </Link>
    );
}
