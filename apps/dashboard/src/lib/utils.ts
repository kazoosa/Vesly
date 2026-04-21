import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Standard shadcn-style class-name merger. Combines clsx (conditional classes)
 * with tailwind-merge (which resolves conflicting Tailwind utilities — e.g.
 * `cn("p-4", isActive && "p-6")` ends up with only `p-6`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
