import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase } from 'lib/api/platform/database'

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

interface BillingPlan {
  id: string
  name: string
  price: number
  interval: 'month' | 'year'
  features: string[]
  max_projects?: number
  max_members?: number
}

const DEFAULT_PLANS: BillingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    features: [
      'Up to 2 projects',
      '500MB database',
      '1GB file storage',
      '2GB bandwidth',
      'Community support',
    ],
    max_projects: 2,
    max_members: 5,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 25,
    interval: 'month',
    features: [
      'Unlimited projects',
      '8GB database included',
      '100GB file storage included',
      '250GB bandwidth included',
      'Email support',
      'Daily backups (7 days retention)',
      'Custom domain',
    ],
    max_projects: null,
    max_members: null,
  },
  {
    id: 'team',
    name: 'Team',
    price: 599,
    interval: 'month',
    features: [
      'Everything in Pro',
      '10 team members included',
      'Priority email & chat support',
      'Read-only & custom roles',
      'SOC2',
      'Project transfers',
      'Point-in-time recovery',
    ],
    max_projects: null,
    max_members: null,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0,
    interval: 'month',
    features: [
      'Everything in Team',
      'Unlimited team members',
      'Custom contracts & invoicing',
      'Dedicated support',
      'Custom SLAs',
      'On-premise deployment',
      '24/7 Enterprise SLA & support',
      'Security questionnaire & review',
      'Custom security policies',
    ],
    max_projects: null,
    max_members: null,
  },
]

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // If no DATABASE_URL is configured, return default plans
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(DEFAULT_PLANS)
  }

  // Try to query platform database for custom plans
  const { data, error } = await queryPlatformDatabase<BillingPlan>({
    query: 'SELECT * FROM platform.billing_plans WHERE active = true ORDER BY price ASC',
    parameters: [],
  })

  if (error) {
    // Fall back to default plans if query fails
    return res.status(200).json(DEFAULT_PLANS)
  }

  // Return custom plans if available, otherwise default plans
  return res.status(200).json(data && data.length > 0 ? data : DEFAULT_PLANS)
}
