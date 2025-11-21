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
      return handleListMembers(req, res)
    case 'POST':
      return handleInviteMember(req, res)
    case 'PUT':
      return handleUpdateMemberRole(req, res)
    case 'DELETE':
      return handleRemoveMember(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

interface OrganizationMember {
  id: string
  user_id: string
  organization_id: string
  role: 'owner' | 'admin' | 'developer' | 'read_only'
  invited_at: string
  accepted_at: string | null
  email: string
  first_name: string | null
  last_name: string | null
  username: string | null
}

// GET - List organization members (any member can view)
const handleListMembers = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // Verify user has access to this organization
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  const { data, error } = await queryPlatformDatabase<OrganizationMember>({
    query: `
      SELECT
        om.id,
        om.user_id,
        om.organization_id,
        om.role,
        om.invited_at,
        om.accepted_at,
        u.email,
        u.first_name,
        u.last_name,
        u.username
      FROM platform.organization_members om
      INNER JOIN platform.users u ON om.user_id = u.id
      WHERE om.organization_id = $1
      ORDER BY
        CASE om.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'developer' THEN 3
          WHEN 'read_only' THEN 4
        END,
        om.invited_at ASC
    `,
    parameters: [membership.org_id],
  })

  if (error) {
    console.error('Failed to fetch organization members:', error)
    return res.status(500).json({
      error: 'Failed to fetch members',
      message: 'Database query failed',
    })
  }

  return res.status(200).json(data || [])
}

// POST - Invite new member (admin or owner only)
const handleInviteMember = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query
  const { email, role = 'developer' } = req.body

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  if (!email) {
    return res.status(400).json({ error: { message: 'Email is required' } })
  }

  // Verify user has access and admin role
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  if (!requireRole(membership, 'admin', res)) {
    return // Response already sent by requireRole
  }

  // Validate role
  const validRoles = ['owner', 'admin', 'developer', 'read_only']
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      error: { message: 'Invalid role. Must be one of: owner, admin, developer, read_only' },
    })
  }

  // Only owners can invite other owners
  if (role === 'owner' && membership.role !== 'owner') {
    return res.status(403).json({
      error: { message: 'Only owners can invite other owners' },
    })
  }

  // Find user by email
  const { data: users, error: userError } = await queryPlatformDatabase<{ id: string }>({
    query: 'SELECT id FROM platform.users WHERE email = $1 AND deleted_at IS NULL',
    parameters: [email],
  })

  if (userError) {
    console.error('Failed to find user:', userError)
    return res.status(500).json({ error: { message: 'Database error' } })
  }

  if (!users || users.length === 0) {
    return res.status(404).json({
      error: { message: 'User not found. They must create an account first.' },
    })
  }

  const userId = users[0].id

  // Check if user is already a member
  const { data: existingMember } = await queryPlatformDatabase({
    query:
      'SELECT id FROM platform.organization_members WHERE organization_id = $1 AND user_id = $2',
    parameters: [membership.org_id, userId],
  })

  if (existingMember && existingMember.length > 0) {
    return res.status(400).json({
      error: { message: 'User is already a member of this organization' },
    })
  }

  // Add member
  const { data: newMember, error: insertError } = await queryPlatformDatabase<OrganizationMember>({
    query: `
      INSERT INTO platform.organization_members (organization_id, user_id, role, invited_at, accepted_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *
    `,
    parameters: [membership.org_id, userId, role],
  })

  if (insertError) {
    console.error('Failed to add member:', insertError)
    return res.status(500).json({ error: { message: 'Failed to add member' } })
  }

  console.log(
    `[Members] User ${req.user!.userId} invited ${email} (${userId}) to org ${slug} with role ${role}`
  )

  return res.status(201).json(newMember?.[0])
}

// PUT - Update member role (owner only for role changes, or admin for non-owner changes)
const handleUpdateMemberRole = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query
  const { member_id, role } = req.body

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  if (!member_id) {
    return res.status(400).json({ error: { message: 'member_id is required' } })
  }

  if (!role) {
    return res.status(400).json({ error: { message: 'role is required' } })
  }

  // Verify user has access
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  // Validate role
  const validRoles = ['owner', 'admin', 'developer', 'read_only']
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      error: { message: 'Invalid role. Must be one of: owner, admin, developer, read_only' },
    })
  }

  // Get current member details
  const { data: targetMembers } = await queryPlatformDatabase<{
    role: string
    user_id: string
  }>({
    query:
      'SELECT role, user_id FROM platform.organization_members WHERE id = $1 AND organization_id = $2',
    parameters: [member_id, membership.org_id],
  })

  if (!targetMembers || targetMembers.length === 0) {
    return res.status(404).json({ error: { message: 'Member not found' } })
  }

  const targetMember = targetMembers[0]

  // Only owners can change roles to/from owner
  if ((role === 'owner' || targetMember.role === 'owner') && membership.role !== 'owner') {
    return res.status(403).json({
      error: { message: 'Only owners can change owner roles' },
    })
  }

  // Admins can change non-owner roles
  if (!requireRole(membership, 'admin', res)) {
    return // Response already sent by requireRole
  }

  // Prevent users from changing their own role
  if (targetMember.user_id === req.user!.userId) {
    return res.status(400).json({
      error: { message: 'You cannot change your own role' },
    })
  }

  // Update role
  const { error: updateError } = await queryPlatformDatabase({
    query: 'UPDATE platform.organization_members SET role = $1 WHERE id = $2',
    parameters: [role, member_id],
  })

  if (updateError) {
    console.error('Failed to update member role:', updateError)
    return res.status(500).json({ error: { message: 'Failed to update role' } })
  }

  console.log(
    `[Members] User ${req.user!.userId} updated member ${member_id} role to ${role} in org ${slug}`
  )

  return res.status(200).json({ success: true, role })
}

// DELETE - Remove member (admin or owner only)
const handleRemoveMember = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query
  const { member_id } = req.body

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  if (!member_id) {
    return res.status(400).json({ error: { message: 'member_id is required' } })
  }

  // Verify user has access and admin role
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  if (!requireRole(membership, 'admin', res)) {
    return // Response already sent by requireRole
  }

  // Get member details to check role
  const { data: targetMembers } = await queryPlatformDatabase<{
    role: string
    user_id: string
  }>({
    query:
      'SELECT role, user_id FROM platform.organization_members WHERE id = $1 AND organization_id = $2',
    parameters: [member_id, membership.org_id],
  })

  if (!targetMembers || targetMembers.length === 0) {
    return res.status(404).json({ error: { message: 'Member not found' } })
  }

  const targetMember = targetMembers[0]

  // Only owners can remove owners
  if (targetMember.role === 'owner' && membership.role !== 'owner') {
    return res.status(403).json({
      error: { message: 'Only owners can remove other owners' },
    })
  }

  // Prevent users from removing themselves (they should use leave endpoint)
  if (targetMember.user_id === req.user!.userId) {
    return res.status(400).json({
      error: { message: 'You cannot remove yourself. Use the leave endpoint instead.' },
    })
  }

  // Remove member
  const { error: deleteError } = await queryPlatformDatabase({
    query: 'DELETE FROM platform.organization_members WHERE id = $1',
    parameters: [member_id],
  })

  if (deleteError) {
    console.error('Failed to remove member:', deleteError)
    return res.status(500).json({ error: { message: 'Failed to remove member' } })
  }

  console.log(`[Members] User ${req.user!.userId} removed member ${member_id} from org ${slug}`)

  return res.status(200).json({ success: true })
}
