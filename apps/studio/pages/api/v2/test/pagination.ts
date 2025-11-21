import type { NextApiResponse } from 'next'
import { publicApiV2, methodRouter, type ApiV2Request, paginateArray } from 'lib/api/v2'

/**
 * Test endpoint for cursor-based pagination
 *
 * GET /api/v2/test/pagination?cursor=<cursor>&limit=<limit>
 */
export default publicApiV2(
  methodRouter({
    GET: handleGet,
  })
)

// Sample data
const items = Array.from({ length: 250 }, (_, i) => ({
  id: String(i + 1),
  name: `Item ${i + 1}`,
  description: `This is item number ${i + 1}`,
  createdAt: new Date(Date.now() - i * 1000000).toISOString(),
}))

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  const { cursor, limit } = req.query

  const result = paginateArray(
    items,
    typeof cursor === 'string' ? cursor : undefined,
    typeof limit === 'string' ? parseInt(limit, 10) : undefined
  )

  res.status(200).json(result)
}
