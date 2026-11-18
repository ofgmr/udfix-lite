import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import MaterialIcon from '../../components/ui/MaterialIcon'
import { cn } from "../../lib/utils"

export interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  glow?: boolean
  variant?: "glass" | "default"
}

/** Full-height row edge: thin glass fill and a soft primary glow. */
export const glassEdgeCheckboxClass =
  "glass-glow flex h-auto min-h-full w-8 shrink-0 cursor-pointer items-center justify-center self-stretch rounded-none p-0 text-primary data-[state=checked]:bg-transparent data-[state=checked]:text-primary focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, glow, variant = "glass", ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      glow && "shadow-[0_0_10px_color-mix(in_srgb,var(--primary)_32%,transparent)]",
      variant === "glass" && "transition-all duration-200",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <MaterialIcon icon="check" size={12} className="text-current" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }

