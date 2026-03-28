import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseLibrarySearch } from '~/lib/calibre/search-schema'

export const Route = createFileRoute('/authors/$authorSlug')({
  beforeLoad: ({ params, search }) => {
    const nextSearch = parseLibrarySearch({
      ...search,
      author: params.authorSlug,
      page: 1,
    })

    throw redirect({
      to: '/',
      search: nextSearch,
    })
  },
})
