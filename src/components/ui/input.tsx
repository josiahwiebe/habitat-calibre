import type * as React from 'react'
import { cn } from '~/lib/utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Shared text input with focused, high-contrast defaults.
 */
export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 text-sm text-stone-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] placeholder:text-stone-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40',
        className,
      )}
      {...props}
    />
  )
}
