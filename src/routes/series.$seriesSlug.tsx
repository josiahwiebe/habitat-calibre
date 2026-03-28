import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseLibrarySearch } from '~/lib/calibre/search-schema'

export const Route = createFileRoute('/series/$seriesSlug')({
  beforeLoad: ({ params, search }) => {
    const nextSearch = parseLibrarySearch({
      ...search,
      series: params.seriesSlug,
      page: 1,
    })

    throw redirect({
      to: '/',
      search: nextSearch,
    })
  },
})
