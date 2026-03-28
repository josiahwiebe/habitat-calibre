import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseLibrarySearch } from '~/lib/calibre/search-schema'

export const Route = createFileRoute('/series/$seriesSlug')({
  beforeLoad: ({ context, params, search, location }) => {
    if (!context.user) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }

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
