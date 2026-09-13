import * as React from "react"
import { cn } from "../../lib/utils"
import { type GlassCustomization, getGlassStyles } from "../../lib/glass-utils"
import { hoverEffects, type HoverEffect } from "../../lib/hover-effects"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "glass" | "default"
  icon?: React.ReactNode
  error?: boolean
  hover?: HoverEffect
  glass?: GlassCustomization
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", icon, error, hover, glass, style, ...props }, ref) => {
    const glassStyle = variant === 'glass' ? getGlassStyles(glass) : {};

    return (
      <div className="relative w-full">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-muted-foreground pointer-events-none">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            variant === "glass" && "glass-bg border-white/10 text-foreground placeholder:text-white/50 focus-visible:ring-white/20",
            icon && "pl-10",
            error && "border-destructive focus-visible:ring-destructive",
            hoverEffects({ hover }),
            className
          )}
          ref={ref}
          style={{ ...glassStyle, ...style }}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }

