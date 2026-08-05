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
    "bg-alloy-bend-pine text-white border border-alloy-bend-pine shadow-[0_8px_22px_rgba(39,63,82,0.10)] hover:bg-[#008f74] hover:border-[#008f74]",
  secondary:
    "bg-white text-alloy-blue border border-alloy-blue/70 hover:border-alloy-blue hover:bg-alloy-stone/60",
  ghost: "text-alloy-midnight-forge/80 hover:text-alloy-bend-pine hover:bg-alloy-stone/60 border border-transparent",
};

const baseClasses =
  "inline-flex min-h-12 items-center justify-center rounded-[10px] px-[22px] py-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
