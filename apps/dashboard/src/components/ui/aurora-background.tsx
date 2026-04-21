import React, { type ReactNode } from "react";
import { cn } from "../../lib/utils";

interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

/**
 * Adapted from aceternity/nextlevelbuilder. No Next.js imports needed.
 * Colors toned down from the original indigo/violet explosion to match
 * Beacon's more restrained palette — still visible as an aurora, but
 * softer and warmer.
 */
export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div
      className={cn(
        "relative flex flex-col min-h-[100vh] items-center justify-center bg-bg-base text-fg-primary transition-colors overflow-hidden",
        className,
      )}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={cn(
            `
            [--white-gradient:repeating-linear-gradient(100deg,#ffffff_0%,#ffffff_7%,transparent_10%,transparent_12%,#ffffff_16%)]
            [--dark-gradient:repeating-linear-gradient(100deg,#000000_0%,#000000_7%,transparent_10%,transparent_12%,#000000_16%)]
            [--aurora:repeating-linear-gradient(100deg,#7c6aff_10%,#a78bfa_15%,#60a5fa_20%,#34d399_25%,#7c6aff_30%)]
            [background-image:var(--white-gradient),var(--aurora)]
            dark:[background-image:var(--dark-gradient),var(--aurora)]
            [background-size:300%,_200%]
            [background-position:50%_50%,50%_50%]
            filter blur-[10px] invert dark:invert-0
            after:content-[""] after:absolute after:inset-0
            after:[background-image:var(--white-gradient),var(--aurora)]
            after:dark:[background-image:var(--dark-gradient),var(--aurora)]
            after:[background-size:200%,_100%]
            after:animate-aurora after:[background-attachment:fixed] after:mix-blend-difference
            pointer-events-none
            absolute -inset-[10px] opacity-40 will-change-transform`,
            showRadialGradient &&
              `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]`,
          )}
        />
      </div>
      {children}
    </div>
  );
};
