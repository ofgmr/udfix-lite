import * as React from "react"
import { cn } from "../../lib/utils"
import { type GlassCustomization, getGlassStyles } from "../../lib/glass-utils"
import { hoverEffects, type HoverEffect } from "../../lib/hover-effects"

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "default" | "outline" | "ghost"
  gradient?: boolean
  animated?: boolean
  hover?: HoverEffect
  glass?: GlassCustomization
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", gradient = false, animated = false, hover, glass, style, ...props }, ref) => {
    const glassStyle = variant === 'glass' ? getGlassStyles(glass) : {};

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border bg-card text-card-foreground shadow-sm",
          variant === "glass" && "glass-bg border-border text-foreground",
          gradient && "bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-pink-500/10",
          animated && "transition-all duration-300 hover:scale-[1.02] hover:shadow-lg",
          hoverEffects({ hover }),
          className
        )}
        style={{ ...glassStyle, ...style }}
        {...props}
      />
    )
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

