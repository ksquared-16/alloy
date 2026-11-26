"use client";

import clsx from "clsx";

type Props = {
    label: string;
    onBack: () => void;
    className?: string;
    dataAction?: string;
};

export default function IdentityDisclosureBackAction({ label, onBack, className, dataAction = "back" }: Props) {
    return (
        <button
            type="button"
            className={clsx("alloy-os-ucard__action alloy-os-ucard__action--system5", className)}
            onClick={onBack}
            data-identity-disclosure-back={dataAction}
        >
            {label}
        </button>
    );
}
