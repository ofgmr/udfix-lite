import * as React from "react"
import { cn } from "../../lib/utils"
import { type GlassCustomization, getGlassStyles } from "../../lib/glass-utils"
import { hoverEffects, type HoverEffect } from "../../lib/hover-effects"

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "default" | "outline" | "ghost"
  orientation?: "horizontal" | "vertical"
  effect?: HoverEffect
  glass?: GlassCustomization
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, variant = "default", orientation = "horizontal", effect, glass, style, ...props }, ref) => {
    const glassStyle = variant === 'glass' ? getGlassStyles(glass) : {};

    return (
      <div
        ref={ref}
        className={cn(
          "flex",
          orientation === "vertical" ? "flex-col" : "flex-row",
          "[&>:not(:first-child)]:rounded-l-none [&>:not(:last-child)]:rounded-r-none",
          orientation === "vertical" && "[&>:not(:first-child)]:rounded-t-none [&>:not(:last-child)]:rounded-b-none [&>:not(:first-child)]:rounded-l-md [&>:not(:last-child)]:rounded-r-md", // Fix for vertical
          // Glass styles
          variant === "glass" && "glass-bg rounded-md p-1",
          hoverEffects({ hover: effect }),
          className
        )}
        style={{ ...glassStyle, ...style }}
        {...props}
      />
    )
  }
)
ButtonGroup.displayName = "ButtonGroup"

export { ButtonGroup }

