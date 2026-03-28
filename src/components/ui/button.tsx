import type * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default:
          'bg-teal-700 text-white hover:bg-teal-800 active:bg-teal-900 shadow-[0_10px_28px_-18px_rgba(17,94,89,0.85)]',
        secondary:
          'bg-stone-200 text-stone-900 hover:bg-stone-300 active:bg-stone-400',
        subtle:
          'bg-transparent text-stone-700 hover:bg-stone-200/80 active:bg-stone-300/80',
        ghost: 'bg-transparent text-stone-700 hover:bg-stone-200/70',
        danger: 'bg-rose-700 text-white hover:bg-rose-800 active:bg-rose-900',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/**
 * Shared button primitive with house style variants.
 */
export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
