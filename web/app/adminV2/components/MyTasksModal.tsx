"use client";

import { ListTodo, X } from "lucide-react";

import MyTasksPanel from "@/app/adminV2/components/MyTasksPanel";

export type MyTasksModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function MyTasksModal({ open, onClose }: MyTasksModalProps) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-alloy-midnight/45 px-2 py-6 backdrop-blur-[2px] sm:px-4 sm:py-10"
            data-adminv2-tasks-modal="true"
        >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close tasks" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="adminv2-tasks-modal-title"
                className="relative z-[1] flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-[#f7f6f3] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-2 border-b border-alloy-stone/15 bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                        <ListTodo className="h-4 w-4 text-alloy-midnight/70" aria-hidden strokeWidth={2} />
                        <h2 id="adminv2-tasks-modal-title" className="text-sm font-semibold text-alloy-midnight">
                            My tasks
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1 text-alloy-midnight/55 hover:bg-alloy-stone/10 hover:text-alloy-midnight"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-hidden px-4 py-3">
                    <MyTasksPanel compact onClose={onClose} />
                </div>
            </div>
        </div>
    );
}
