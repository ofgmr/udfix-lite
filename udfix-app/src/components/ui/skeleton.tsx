import * as React from "react"
import { cn } from "../../lib/utils"

function Skeleton({
  className,
  variant = "glass",
  shimmer = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "glass" | "default", shimmer?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted",
        variant === "glass" && "glass-bg bg-white/5",
        shimmer && "animate-pulse",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }

