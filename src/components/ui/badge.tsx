import type * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.02em]',
  {
    variants: {
      variant: {
        default: 'border-stone-300 bg-stone-100 text-stone-700',
        accent: 'border-teal-600/35 bg-teal-600/12 text-teal-900',
        subtle: 'border-stone-200 bg-stone-50 text-stone-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Small metadata badge used for tags and formats.
 */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
