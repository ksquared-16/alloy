"use client";

type Props = {
    message: string;
};

/** Holds queue body during operational subject resolution — no expanded/browse rows. */
export default function OperationalModeQueuePreparePanel({ message }: Props) {
    return (
        <li
            className="alloy-os-operational-mode-prepare"
            role="status"
            aria-live="polite"
            data-operational-mode-prepare="true"
        >
            <div className="alloy-os-operational-mode-prepare__panel">
                <p className="alloy-os-operational-mode-prepare__message">{message}</p>
            </div>
        </li>
    );
}
