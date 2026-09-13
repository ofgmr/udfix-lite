import * as React from "react"
import { cn } from "../../lib/utils"
import { type GlassCustomization, getGlassStyles } from "../../lib/glass-utils"
import { hoverEffects, type HoverEffect } from "../../lib/hover-effects"

export interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "default"
  effect?: HoverEffect
  glass?: GlassCustomization
}

const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, variant = "default", effect, glass, style, children, ...props }, ref) => {
    const glassStyle = variant === 'glass' ? getGlassStyles(glass) : {};

    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full items-center",
          "[&>:not(:first-child)]:rounded-l-none [&>:not(:last-child)]:rounded-r-none",
          "[&>:not(:first-child)]:border-l-0",
          variant === "glass" && "glass-bg rounded-md p-1",
          hoverEffects({ hover: effect }),
          className
        )}
        style={{ ...glassStyle, ...style }}
        {...props}
      >
        {children}
      </div>
    )
  }
)
InputGroup.displayName = "InputGroup"

export { InputGroup }

