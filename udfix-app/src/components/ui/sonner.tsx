import type React from 'react'
import { Toaster as Sonner } from 'sonner'
import { useThemeStore } from '../../stores/useThemeStore'

type ToasterProps = React.ComponentProps<typeof Sonner>

function resolveSonnerTheme(mode: ReturnType<typeof useThemeStore.getState>['mode']): 'light' | 'dark' {
    if (mode === 'dark') return 'dark'
    if (mode === 'light') return 'light'
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark'
    }
    return 'light'
}

const Toaster = ({ ...props }: ToasterProps) => {
    const mode = useThemeStore((state) => state.mode)
    const theme = resolveSonnerTheme(mode)

    return (
        <Sonner
            theme={theme}
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast:
                        'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg glass',
                    description: 'group-[.toast]:text-muted-foreground',
                    actionButton:
                        'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
                    cancelButton:
                        'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
                },
            }}
            {...props}
        />
    )
}

export { Toaster }
