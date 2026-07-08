"use client";

type Props = {
    active: boolean;
    onChange: (active: boolean) => void;
    disabled?: boolean;
};

/** Operator status — Active vs Hidden (maps to is_active; availability derives from platform). */
export default function ConfigurationStatusToggle({ active, onChange, disabled = false }: Props) {
    return (
        <fieldset className="space-y-1.5" data-testid="configuration-status-toggle">
            <legend className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                Status
            </legend>
            <div className="flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-alloy-midnight/75">
                    <input
                        type="radio"
                        name="field-status"
                        checked={active}
                        disabled={disabled}
                        onChange={() => onChange(true)}
                        data-testid="configuration-status-active"
                    />
                    <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-alloy-bend-pine" aria-hidden />
                        Active
                    </span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-alloy-midnight/75">
                    <input
                        type="radio"
                        name="field-status"
                        checked={!active}
                        disabled={disabled}
                        onChange={() => onChange(false)}
                        data-testid="configuration-status-hidden"
                    />
                    <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full border border-alloy-midnight/25 bg-transparent" aria-hidden />
                        Hidden
                    </span>
                </label>
            </div>
        </fieldset>
    );
}
