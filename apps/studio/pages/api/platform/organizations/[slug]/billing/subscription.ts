import { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import { verifyOrgAccess } from 'lib/api/platform/org-access-control'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

type ResponseData =
  paths['/platform/organizations/{slug}/billing/subscription']['get']['responses']['200']['content']['application/json']

type SubscriptionRow = {
  billing_cycle_anchor: number
  current_period_end: number
  current_period_start: number
  next_invoice_at: number
  usage_billing_enabled: boolean
  plan_id: string
  plan_name: string
  payment_method_type: string
  billing_via_partner: boolean
  billing_partner: string
  customer_balance: number
  cached_egress_enabled: boolean
}

const handleGet = async (req: AuthenticatedRequest, res: NextApiResponse<ResponseData>) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } } as any)
  }

  // Verify user has access to this organization
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  const defaultResponse: ResponseData = {
    billing_cycle_anchor: 0,
    current_period_end: 0,
    current_period_start: 0,
    next_invoice_at: 0,
    usage_billing_enabled: false,
    plan: {
      id: 'enterprise',
      name: 'Enterprise',
    },
    addons: [],
    project_addons: [],
    payment_method_type: '',
    billing_via_partner: false,
    billing_partner: 'fly',
    scheduled_plan_change: null,
    customer_balance: 0,
    cached_egress_enabled: false,
  }

  // If no DATABASE_URL is configured, return default subscription for 'org-1'
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(defaultResponse)
  }

  // Import queryPlatformDatabase at runtime to avoid circular dependencies
  const { queryPlatformDatabase } = await import('lib/api/platform/database')

  // Try to query platform database for subscription
  const { data, error } = await queryPlatformDatabase<SubscriptionRow>({
    query: `
      SELECT
        s.billing_cycle_anchor,
        s.current_period_end,
        s.current_period_start,
        s.next_invoice_at,
        s.usage_billing_enabled,
        s.plan_id,
        s.plan_name,
        s.payment_method_type,
        s.billing_via_partner,
        s.billing_partner,
        s.customer_balance,
        s.cached_egress_enabled
      FROM platform.subscriptions s
      JOIN platform.organizations o ON o.id = s.organization_id
      WHERE o.slug = $1
    `,
    parameters: [slug],
  })

  if (error || !data || data.length === 0) {
    // Fall back to default subscription if query fails
    return res.status(200).json(defaultResponse)
  }

  const subscription = data[0]
  const response: ResponseData = {
    billing_cycle_anchor: subscription.billing_cycle_anchor || 0,
    current_period_end: subscription.current_period_end || 0,
    current_period_start: subscription.current_period_start || 0,
    next_invoice_at: subscription.next_invoice_at || 0,
    usage_billing_enabled: subscription.usage_billing_enabled || false,
    plan: {
      id: (subscription.plan_id || 'enterprise') as 'free' | 'pro' | 'team' | 'enterprise',
      name: subscription.plan_name || 'Enterprise',
    },
    addons: [],
    project_addons: [],
    payment_method_type: subscription.payment_method_type || '',
    billing_via_partner: subscription.billing_via_partner || false,
    billing_partner: (subscription.billing_partner || 'fly') as 'fly' | 'aws_marketplace' | 'vercel_marketplace',
    scheduled_plan_change: null,
    customer_balance: subscription.customer_balance || 0,
    cached_egress_enabled: subscription.cached_egress_enabled || false,
  }

  return res.status(200).json(response)
}
