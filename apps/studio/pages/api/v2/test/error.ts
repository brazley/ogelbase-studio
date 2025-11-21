import type { NextApiResponse } from 'next'
import {
  publicApiV2,
  methodRouter,
  type ApiV2Request,
  BadRequestError,
  NotFoundError,
  UnprocessableEntityError,
  InternalServerError,
} from 'lib/api/v2'

/**
 * Test endpoint for RFC 9457 error responses
 *
 * GET /api/v2/test/error?type=400|404|422|500
 */
export default publicApiV2(
  methodRouter({
    GET: handleGet,
  })
)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  const { type } = req.query

  switch (type) {
    case '400':
      throw new BadRequestError('Invalid request parameters', [
        { field: 'email', message: 'Email is required' },
        { field: 'password', message: 'Password must be at least 8 characters' },
      ])

    case '404':
      throw new NotFoundError('project')

    case '422':
      throw new UnprocessableEntityError('Invalid data format', [
        { field: 'age', message: 'Age must be a positive integer' },
      ])

    case '500':
      throw new InternalServerError('Database connection failed')

    default:
      res.status(200).json({
        message: 'No error requested',
        availableTypes: ['400', '404', '422', '500'],
        example: '/api/v2/test/error?type=404',
      })
  }
}
