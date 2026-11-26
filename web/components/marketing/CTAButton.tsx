import Link from "next/link";
import type { ReactNode } from "react";

type CTAButtonVariant = "primary" | "secondary" | "ghost";

interface CTAButtonProps {
  children: ReactNode;
  href?: string;
  variant?: CTAButtonVariant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}

const variantClasses: Record<CTAButtonVariant, string> = {
  primary:
    "bg-alloy-bend-pine text-white border border-alloy-bend-pine shadow-[0_6px_18px_rgba(39,63,82,0.08)] hover:bg-[#008f74] hover:border-[#008f74] hover:shadow-[0_8px_22px_rgba(39,63,82,0.12)]",
  secondary:
    "bg-white text-alloy-blue border border-alloy-blue/55 hover:border-alloy-blue/90 hover:bg-alloy-stone/40",
  ghost:
    "text-alloy-midnight-forge/70 hover:text-alloy-midnight-forge hover:bg-alloy-stone/50 border border-transparent font-medium",
};

const baseClasses =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-6 py-2.5 text-[0.9375rem] font-medium tracking-[-0.01em] transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function CTAButton({
  children,
  href,
  variant = "primary",
  className = "",
  type = "button",
  disabled,
  onClick,
}: CTAButtonProps) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
