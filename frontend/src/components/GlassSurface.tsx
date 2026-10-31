import type { ComponentPropsWithoutRef } from "react";

type GlassSurfaceProps = ComponentPropsWithoutRef<"section"> & {
  variant?: "subtle" | "medium" | "elevated";
};

export function GlassSurface({ variant = "medium", className = "", ...props }: GlassSurfaceProps) {
  return <section {...props} data-variant={variant} className={`glass-surface ${className}`} />;
}
