import { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

const handleGet = async (req: NextApiRequest, res: NextApiResponse<ResponseData>) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } } as any)
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
  const { data, error } = await queryPlatformDatabase({
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
      id: subscription.plan_id || 'enterprise',
      name: subscription.plan_name || 'Enterprise',
    },
    addons: [],
    project_addons: [],
    payment_method_type: subscription.payment_method_type || '',
    billing_via_partner: subscription.billing_via_partner || false,
    billing_partner: subscription.billing_partner || 'fly',
    scheduled_plan_change: null,
    customer_balance: subscription.customer_balance || 0,
    cached_egress_enabled: subscription.cached_egress_enabled || false,
  }

  return res.status(200).json(response)
}
