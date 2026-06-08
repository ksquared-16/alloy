"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { registerDrawerOperatingEditSection } from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
import {
    isLayoutRuntimePersonContactRefKey,
    saveLayoutRuntimePersonContactEdits,
} from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type LayoutRuntimeDrawerEditContextValue = {
    getFieldValue: (refKey: string, fallback: string) => string;
    setFieldValue: (refKey: string, value: string) => void;
    isEditableRefKey: (refKey: string) => boolean;
};

const LayoutRuntimeDrawerEditContext = createContext<LayoutRuntimeDrawerEditContextValue | null>(null);

export function useLayoutRuntimeDrawerEdit(): LayoutRuntimeDrawerEditContextValue | null {
    return useContext(LayoutRuntimeDrawerEditContext);
}

function collectEditableBaseline(record: ProofRuntimeRecord): Record<string, string> {
    const baseline: Record<string, string> = {};
    for (const key of Object.keys(record)) {
        if (!isLayoutRuntimePersonContactRefKey(key)) continue;
        const v = record[key];
        baseline[key] = v == null ? "" : String(v);
    }
    return baseline;
}

type Props = {
    record: ProofRuntimeRecord;
    children: ReactNode;
    onSaved?: () => void;
};

export default function LayoutRuntimeDrawerEditProvider({ record, children, onSaved }: Props) {
    const baselineRef = useRef<Record<string, string>>(collectEditableBaseline(record));
    const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...baselineRef.current }));

    useEffect(() => {
        const nextBaseline = collectEditableBaseline(record);
        baselineRef.current = nextBaseline;
        setDraft({ ...nextBaseline });
    }, [record]);

    const isDirty = useCallback(() => {
        for (const refKey of Object.keys(baselineRef.current)) {
            if ((draft[refKey] ?? "") !== (baselineRef.current[refKey] ?? "")) return true;
        }
        return false;
    }, [draft]);

    const revert = useCallback(() => {
        setDraft({ ...baselineRef.current });
    }, []);

    const save = useCallback(async () => {
        const result = await saveLayoutRuntimePersonContactEdits({
            record: record as Record<string, unknown>,
            baseline: baselineRef.current,
            draft,
        });
        if (!result.ok) {
            throw new Error(result.error);
        }
        baselineRef.current = { ...draft };
        onSaved?.();
    }, [draft, onSaved, record]);

    useEffect(() => {
        registerDrawerOperatingEditSection("layout_runtime_person_contact", {
            isDirty,
            save,
            revert,
        });
        return () => registerDrawerOperatingEditSection("layout_runtime_person_contact", null);
    }, [isDirty, revert, save]);

    const value = useMemo(
        (): LayoutRuntimeDrawerEditContextValue => ({
            getFieldValue: (refKey, fallback) => draft[refKey] ?? fallback,
            setFieldValue: (refKey, value) => {
                if (!isLayoutRuntimePersonContactRefKey(refKey)) return;
                setDraft((prev) => ({ ...prev, [refKey]: value }));
            },
            isEditableRefKey: isLayoutRuntimePersonContactRefKey,
        }),
        [draft],
    );

    return (
        <LayoutRuntimeDrawerEditContext.Provider value={value}>
            {children}
        </LayoutRuntimeDrawerEditContext.Provider>
    );
}
