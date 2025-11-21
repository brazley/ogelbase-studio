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
    case 'POST':
      return handlePost(req, res)
    case 'PUT':
      return handlePut(req, res)
    case 'DELETE':
      return handleDelete(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

interface PaymentMethod {
  id: string
  type: 'card' | 'bank_account' | 'sepa_debit'
  brand?: string
  last4: string
  exp_month?: number
  exp_year?: number
  is_default: boolean
  created_at: string
}

const DEFAULT_PAYMENT_METHOD: PaymentMethod = {
  id: 'pm_default',
  type: 'card',
  brand: 'visa',
  last4: '4242',
  exp_month: 12,
  exp_year: 2025,
  is_default: true,
  created_at: new Date().toISOString(),
}

// GET - List payment methods (admin or owner only)
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

  // If no DATABASE_URL is configured, return empty array (or default payment method for testing)
  if (!process.env.DATABASE_URL) {
    return res.status(200).json([])
  }

  // Try to query platform database for payment methods
  const { data, error } = await queryPlatformDatabase<PaymentMethod>({
    query: `
      SELECT pm.* FROM platform.payment_methods pm
      JOIN platform.organizations o ON o.id = pm.organization_id
      WHERE o.slug = $1
      ORDER BY pm.is_default DESC, pm.created_at DESC
    `,
    parameters: [slug],
  })

  if (error) {
    // Fall back to empty array if query fails
    return res.status(200).json([])
  }

  return res.status(200).json(data || [])
}

// POST /setup-intent - Create Stripe setup intent for adding payment method (owner only)
const handlePost = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query
  const { action } = req.body

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // Verify user has access and owner role
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  if (!requireRole(membership, 'owner', res)) {
    return // Response already sent by requireRole
  }

  // Handle setup intent creation
  if (action === 'setup-intent' || req.url?.includes('setup-intent')) {
    // If no DATABASE_URL is configured, return mock setup intent
    if (!process.env.DATABASE_URL) {
      return res.status(200).json({
        client_secret: 'seti_mock_client_secret_' + Date.now(),
        id: 'seti_mock_' + Date.now(),
        status: 'requires_payment_method',
      })
    }

    // In a real implementation, this would create a Stripe SetupIntent
    // For now, return a mock response
    return res.status(200).json({
      client_secret: 'seti_mock_client_secret_' + Date.now(),
      id: 'seti_mock_' + Date.now(),
      status: 'requires_payment_method',
    })
  }

  // Handle adding a new payment method
  const { payment_method_id, set_as_default } = req.body

  if (!payment_method_id) {
    return res.status(400).json({ error: { message: 'payment_method_id is required' } })
  }

  // If no DATABASE_URL is configured, return success
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({
      id: payment_method_id,
      type: 'card',
      last4: '4242',
      is_default: set_as_default || false,
      created_at: new Date().toISOString(),
    })
  }

  // Insert payment method into database
  const { data, error } = await queryPlatformDatabase({
    query: `
      INSERT INTO platform.payment_methods (organization_id, payment_method_id, is_default)
      SELECT o.id, $2, $3 FROM platform.organizations o WHERE o.slug = $1
      RETURNING *
    `,
    parameters: [slug, payment_method_id, set_as_default || false],
  })

  if (error) {
    return res.status(500).json({ error: { message: 'Failed to add payment method' } })
  }

  return res.status(200).json(data?.[0] || {})
}

// PUT /default - Set default payment method (owner only)
const handlePut = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query
  const { payment_method_id } = req.body

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // Verify user has access and owner role
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  if (!requireRole(membership, 'owner', res)) {
    return // Response already sent by requireRole
  }

  if (!payment_method_id) {
    return res.status(400).json({ error: { message: 'payment_method_id is required' } })
  }

  // If no DATABASE_URL is configured, return success
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ success: true })
  }

  // Update default payment method
  const { error } = await queryPlatformDatabase({
    query: `
      WITH org AS (
        SELECT id FROM platform.organizations WHERE slug = $1
      )
      UPDATE platform.payment_methods
      SET is_default = CASE WHEN id = $2 THEN true ELSE false END
      WHERE organization_id = (SELECT id FROM org)
    `,
    parameters: [slug, payment_method_id],
  })

  if (error) {
    return res.status(500).json({ error: { message: 'Failed to set default payment method' } })
  }

  return res.status(200).json({ success: true })
}

// DELETE - Remove payment method (owner only)
const handleDelete = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query
  const { payment_method_id } = req.body

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // Verify user has access and owner role
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  if (!requireRole(membership, 'owner', res)) {
    return // Response already sent by requireRole
  }

  if (!payment_method_id) {
    return res.status(400).json({ error: { message: 'payment_method_id is required' } })
  }

  // If no DATABASE_URL is configured, return success
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ success: true })
  }

  // Delete payment method
  const { error } = await queryPlatformDatabase({
    query: `
      DELETE FROM platform.payment_methods
      WHERE id = $2
      AND organization_id = (SELECT id FROM platform.organizations WHERE slug = $1)
    `,
    parameters: [slug, payment_method_id],
  })

  if (error) {
    return res.status(500).json({ error: { message: 'Failed to delete payment method' } })
  }

  return res.status(200).json({ success: true })
}
