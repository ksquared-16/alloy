"use client";

import { useQuoteModal } from "@/lib/quoteModal";
import PrimaryButton from "./PrimaryButton";
import { ReactNode } from "react";

interface GetQuoteButtonProps {
  children?: ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
  defaultService?: "cleaning" | "gutters";
}

/**
 * Unified "Get a Quote" button component that opens the QuoteModal.
 * Use this component everywhere instead of custom implementations.
 */
export default function GetQuoteButton({ 
  children, 
  className,
  variant = "primary",
  defaultService
}: GetQuoteButtonProps) {
  const { openModal } = useQuoteModal();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openModal({ defaultService });
  };

  if (variant === "secondary") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={className}
      >
        {children || "Get a Quote"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full sm:w-auto"
    >
      <PrimaryButton className={className}>
        {children || "Get a Quote"}
      </PrimaryButton>
    </button>
  );
}

