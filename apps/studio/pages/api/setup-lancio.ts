import type { NextApiRequest, NextApiResponse } from 'next'
import { queryPlatformDatabase } from 'lib/api/platform/database'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Create organization
    const { data: orgData, error: orgError } = await queryPlatformDatabase({
      query: `
        INSERT INTO platform.organizations (name, slug, billing_email, created_at, updated_at)
        VALUES ('Lancio', 'lancio', 'nik@lancio.ai', NOW(), NOW())
        ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name, billing_email = EXCLUDED.billing_email, updated_at = NOW()
        RETURNING id, name, slug
      `,
      parameters: [],
    })

    if (orgError) {
      return res.status(500).json({ error: 'Failed to create organization', details: orgError.message })
    }

    const orgId = orgData[0].id
    console.log('Organization created:', orgData[0])

    // Create project
    const { data: projectData, error: projectError } = await queryPlatformDatabase({
      query: `
        INSERT INTO platform.projects (
          name,
          organization_id,
          region,
          database_url,
          created_at,
          updated_at
        )
        VALUES (
          'BlackWhale',
          $1,
          'us-east-1',
          'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres',
          NOW(),
          NOW()
        )
        ON CONFLICT (name, organization_id) DO NOTHING
        RETURNING id, name, organization_id
      `,
      parameters: [orgId],
    })

    if (projectError) {
      return res.status(500).json({ error: 'Failed to create project', details: projectError.message })
    }

    console.log('Project created:', projectData[0])

    // Link user to organization
    const userId = 'a8bb09f6-3432-470e-a117-2600515d4f26'
    const { error: memberError } = await queryPlatformDatabase({
      query: `
        INSERT INTO platform.organization_members (organization_id, user_id, role, created_at)
        VALUES ($1, $2, 'owner', NOW())
        ON CONFLICT (organization_id, user_id) DO NOTHING
      `,
      parameters: [orgId, userId],
    })

    if (memberError) {
      return res.status(500).json({ error: 'Failed to link user', details: memberError.message })
    }

    return res.status(200).json({
      success: true,
      organization: orgData[0],
      project: projectData[0],
      message: 'Lancio organization and BlackWhale project created successfully'
    })

  } catch (error: any) {
    console.error('Setup error:', error)
    return res.status(500).json({ error: 'Setup failed', details: error.message })
  }
}
