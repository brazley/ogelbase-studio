import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import { verifyOrgAccess, requireRole } from 'lib/api/platform/org-access-control'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'PUT':
      return handlePut(req, res)
    case 'DELETE':
      return handleDelete(req, res)
    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

interface TaxId {
  id: string
  type: string
  value: string
  country: string
  created_at: string
}

// GET - List tax IDs (admin or owner only)
const handleGet = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // Verify user has access and admin role
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  if (!requireRole(membership, 'admin', res)) {
    return // Response already sent by requireRole
  }

  // If no DATABASE_URL is configured, return empty array
  if (!process.env.DATABASE_URL) {
    return res.status(200).json([])
  }

  // Try to query platform database for tax IDs
  const { data, error } = await queryPlatformDatabase<TaxId>({
    query: `
      SELECT t.* FROM platform.tax_ids t
      JOIN platform.organizations o ON o.id = t.organization_id
      WHERE o.slug = $1
      ORDER BY t.created_at DESC
    `,
    parameters: [slug],
  })

  if (error) {
    // Fall back to empty array if query fails
    return res.status(200).json([])
  }

  return res.status(200).json(data || [])
}

// PUT - Add tax ID (owner only)
const handlePut = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query
  const { type, value, country } = req.body

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  if (!type || !value) {
    return res.status(400).json({ error: { message: 'Tax ID type and value are required' } })
  }

  // Verify user has access and owner role
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  if (!requireRole(membership, 'owner', res)) {
    return // Response already sent by requireRole
  }

  // If no DATABASE_URL is configured, return mock response
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({
      id: 'tax_' + Date.now(),
      type,
      value,
      country: country || 'US',
      created_at: new Date().toISOString(),
    })
  }

  // Insert tax ID into database
  const { data, error } = await queryPlatformDatabase<TaxId>({
    query: `
      INSERT INTO platform.tax_ids (organization_id, type, value, country)
      SELECT o.id, $2, $3, $4 FROM platform.organizations o WHERE o.slug = $1
      RETURNING *
    `,
    parameters: [slug, type, value, country || 'US'],
  })

  if (error) {
    return res.status(500).json({ error: { message: 'Failed to add tax ID' } })
  }

  return res.status(200).json(data?.[0] || {})
}

// DELETE - Remove tax ID (owner only)
const handleDelete = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query
  const { tax_id } = req.body

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  if (!tax_id) {
    return res.status(400).json({ error: { message: 'tax_id is required' } })
  }

  // Verify user has access and owner role
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  if (!requireRole(membership, 'owner', res)) {
    return // Response already sent by requireRole
  }

  // If no DATABASE_URL is configured, return success
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ success: true })
  }

  // Delete tax ID
  const { error } = await queryPlatformDatabase({
    query: `
      DELETE FROM platform.tax_ids
      WHERE id = $2
      AND organization_id = (SELECT id FROM platform.organizations WHERE slug = $1)
    `,
    parameters: [slug, tax_id],
  })

  if (error) {
    return res.status(500).json({ error: { message: 'Failed to delete tax ID' } })
  }

  return res.status(200).json({ success: true })
}
