import { Check, ChevronDown } from 'lucide-react'
import { Select } from '@base-ui/react/select'
import type { LibrarySort } from '~/lib/calibre/types'

const SORT_OPTIONS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest published' },
  { value: 'oldest', label: 'Oldest published' },
  { value: 'title-asc', label: 'Title A-Z' },
  { value: 'title-desc', label: 'Title Z-A' },
]

export interface SortSelectProps {
  value: LibrarySort
  onChange: (next: LibrarySort) => void
}

/**
 * Base UI powered sort selector with fully custom styling.
 */
export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <Select.Root
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as LibrarySort)}
      items={SORT_OPTIONS}
    >
      <Select.Trigger className="inline-flex h-10 min-w-44 items-center justify-between gap-2 rounded-xl border border-stone-300 bg-stone-100 px-3 text-sm text-stone-800 transition hover:bg-stone-200 data-[popup-open]:border-stone-400 data-[popup-open]:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30">
        <Select.Value />
        <ChevronDown className="size-4 text-stone-500" aria-hidden="true" />
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner sideOffset={10} className="outline-none">
          <Select.Popup className="origin-[var(--transform-origin)] rounded-xl border border-stone-300 bg-stone-50 p-1 shadow-[0_30px_60px_-48px_rgba(15,23,42,0.85)] transition data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Select.List className="flex flex-col gap-0.5">
              {SORT_OPTIONS.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="grid cursor-default grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-700 outline-none transition data-[highlighted]:bg-stone-200 data-[highlighted]:text-stone-900"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check className="size-4 text-teal-800" aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
