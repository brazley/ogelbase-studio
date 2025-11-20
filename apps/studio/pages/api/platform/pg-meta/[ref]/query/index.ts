import { constructHeaders } from 'lib/api/apiHelpers'
import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformProject } from 'lib/api/platform/database'
import { PgMetaDatabaseError } from 'lib/api/self-hosted/types'
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  // Look up the project to get its postgres_meta_url
  const { data: projects, error: projectError } = await queryPlatformDatabase<PlatformProject>({
    query: 'SELECT postgres_meta_url FROM platform.projects WHERE ref = $1',
    parameters: [ref],
  })

  if (projectError) {
    if (projectError instanceof PgMetaDatabaseError) {
      const { statusCode, message, formattedError } = projectError
      return res.status(statusCode).json({ error: { message, formattedError } })
    }
    const { message } = projectError
    return res.status(500).json({ error: { message, formattedError: message } })
  }

  if (!projects || projects.length === 0) {
    return res.status(404).json({ error: { message: `Project with ref '${ref}' not found` } })
  }

  const { postgres_meta_url } = projects[0]

  if (!postgres_meta_url) {
    return res
      .status(500)
      .json({ error: { message: 'Project does not have a postgres_meta_url configured' } })
  }

  // Proxy the request to the project's Postgres Meta URL
  try {
    const headers = constructHeaders(req.headers)
    const response = await fetch(`${postgres_meta_url}/query`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    })

    const result = await response.json()

    if (!response.ok) {
      return res.status(response.status).json(result)
    }

    return res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to proxy request to Postgres Meta'
    return res.status(500).json({ error: { message } })
  }
}
