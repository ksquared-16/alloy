import clsx from "clsx";
import type { ReactNode } from "react";

type FieldProps = {
    label: string;
    children: ReactNode;
    className?: string;
    fullWidth?: boolean;
};

const MONO_VALUE = "break-all font-mono text-[11px] text-alloy-midnight/85";

/** Single label/value row inside a technical disclosure (secondary typography). */
export function TechnicalDetailField({ label, children, className, fullWidth }: FieldProps) {
    return (
        <div className={clsx(fullWidth && "sm:col-span-2", className)}>
            <dt className="text-[11px] text-alloy-midnight/55">{label}</dt>
            <dd className="mt-0.5 text-xs text-alloy-midnight/85">{children}</dd>
        </div>
    );
}

export function TechnicalDetailMonospaceValue({ children }: { children: ReactNode }) {
    return <span className={MONO_VALUE}>{children}</span>;
}

type ListProps = {
    children: ReactNode;
    className?: string;
};

/** Grid of technical fields inside a disclosure panel. */
export function TechnicalDetailFieldList({ children, className }: ListProps) {
    return (
        <dl className={clsx("grid gap-2 sm:grid-cols-2", className)}>{children}</dl>
    );
}
