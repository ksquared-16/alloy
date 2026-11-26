"use client";

import clsx from "clsx";
import type { IdentityEvidenceCollectionVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

type Props = {
    collections: IdentityEvidenceCollectionVM[];
    className?: string;
    onSelectCollection?: (key: string) => void;
};

/** Evidence layer — collection-oriented proof, not field lists. */
export default function IdentityEvidenceCollections({ collections, className, onSelectCollection }: Props) {
    const enabled = collections.filter((collection) => collection.enabled !== false);
    if (enabled.length === 0) return null;

    return (
        <div className={clsx("identity-evidence-collections", className)} data-identity-evidence-root="true">
            <p className="identity-evidence-collections__heading">Evidence</p>
            <ul className="identity-evidence-collections__list">
                {enabled.map((collection) => (
                    <li key={collection.key}>
                        {onSelectCollection ? (
                            <button
                                type="button"
                                className="identity-evidence-collections__item"
                                onClick={() => onSelectCollection(collection.key)}
                            >
                                <span>{collection.label}</span>
                                {collection.itemCount != null ? (
                                    <span className="identity-evidence-collections__count">{collection.itemCount}</span>
                                ) : null}
                            </button>
                        ) : (
                            <span className="identity-evidence-collections__item identity-evidence-collections__item--static">
                                {collection.label}
                                {collection.itemCount != null ? (
                                    <span className="identity-evidence-collections__count">{collection.itemCount}</span>
                                ) : null}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
