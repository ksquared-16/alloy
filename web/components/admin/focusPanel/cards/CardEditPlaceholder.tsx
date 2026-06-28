"use client";

/**
 * Edit-ready UI placeholder — represents the deepest in-panel depth layer
 * (Overview → Evidence → Focused → **Edit**) so we can validate how editing
 * *feels* before mutation wiring exists.
 *
 * SAFETY: this performs NO mutation. Inputs are disabled and the Save control is
 * inert; a clear notice states editing is not yet wired. When the owner card's
 * mutation path lands, this component is the seam to replace with live fields.
 */

export type CardEditField = {
    label: string;
    value: string | null;
};

type Props = {
    title: string;
    fields: CardEditField[];
};

export default function CardEditPlaceholder({ title, fields }: Props) {
    return (
        <div className="alloy-os-card-edit" data-card-edit-placeholder="true">
            <p className="alloy-os-card-edit__title">{title}</p>
            <div className="alloy-os-card-edit__fields">
                {fields.map((field) => (
                    <div key={field.label} className="alloy-os-card-edit__field" data-card-edit-field={field.label}>
                        <span className="alloy-os-card-edit__label">{field.label}</span>
                        <span
                            className={
                                field.value
                                    ? "alloy-os-card-edit__value"
                                    : "alloy-os-card-edit__value alloy-os-card-edit__value--empty"
                            }
                        >
                            {field.value ?? "Not set"}
                        </span>
                    </div>
                ))}
            </div>
            <p className="alloy-os-card-edit__notice" data-card-edit-notice="true">
                Preview only — editing isn’t wired yet
            </p>
        </div>
    );
}
