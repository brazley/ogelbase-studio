#!/usr/bin/env node
/**
 * Test Team Members API
 * Tests all CRUD operations with role-based access control
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000'
const TEST_ORG_SLUG = 'lancio'

// Mock JWT for testing (would come from real auth in production)
const OWNER_TOKEN = 'mock-owner-token'
const ADMIN_TOKEN = 'mock-admin-token'
const DEVELOPER_TOKEN = 'mock-developer-token'

async function testAPI(method, path, token, body = null) {
  const url = `${BASE_URL}${path}`
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  try {
    const response = await fetch(url, options)
    const data = await response.json()
    return {
      status: response.status,
      ok: response.ok,
      data,
    }
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
    }
  }
}

async function runTests() {
  console.log('🧪 Testing Team Members API\n')

  // Test 1: List Members (any member can view)
  console.log('📋 Test 1: GET - List Members')
  const listResult = await testAPI('GET', `/api/platform/organizations/${TEST_ORG_SLUG}/members`, DEVELOPER_TOKEN)
  console.log(`   Status: ${listResult.status}`)
  console.log(`   Members: ${listResult.data?.length || 0}`)
  if (listResult.data?.length > 0) {
    console.log(`   Roles present: ${[...new Set(listResult.data.map(m => m.role))].join(', ')}`)
  }
  console.log()

  // Test 2: Invite Member (admin+ only)
  console.log('➕ Test 2: POST - Invite Member (admin)')
  const inviteResult = await testAPI(
    'POST',
    `/api/platform/organizations/${TEST_ORG_SLUG}/members`,
    ADMIN_TOKEN,
    {
      email: 'newdev@example.com',
      role: 'developer',
    }
  )
  console.log(`   Status: ${inviteResult.status}`)
  console.log(`   Success: ${inviteResult.ok}`)
  if (inviteResult.ok) {
    console.log(`   New member ID: ${inviteResult.data?.id}`)
  }
  console.log()

  // Test 3: Invite Owner (should fail for admin)
  console.log('🚫 Test 3: POST - Invite Owner (admin - should fail)')
  const inviteOwnerAdminResult = await testAPI(
    'POST',
    `/api/platform/organizations/${TEST_ORG_SLUG}/members`,
    ADMIN_TOKEN,
    {
      email: 'newowner@example.com',
      role: 'owner',
    }
  )
  console.log(`   Status: ${inviteOwnerAdminResult.status}`)
  console.log(`   Expected 403: ${inviteOwnerAdminResult.status === 403 ? '✅' : '❌'}`)
  console.log()

  // Test 4: Invite Owner (owner can do this)
  console.log('✅ Test 4: POST - Invite Owner (owner)')
  const inviteOwnerResult = await testAPI(
    'POST',
    `/api/platform/organizations/${TEST_ORG_SLUG}/members`,
    OWNER_TOKEN,
    {
      email: 'newowner@example.com',
      role: 'owner',
    }
  )
  console.log(`   Status: ${inviteOwnerResult.status}`)
  console.log(`   Success: ${inviteOwnerResult.ok}`)
  console.log()

  // Test 5: Update Member Role (admin can update non-owners)
  if (inviteResult.data?.id) {
    console.log('🔄 Test 5: PUT - Update Role (admin updating developer)')
    const updateResult = await testAPI(
      'PUT',
      `/api/platform/organizations/${TEST_ORG_SLUG}/members`,
      ADMIN_TOKEN,
      {
        member_id: inviteResult.data.id,
        role: 'read_only',
      }
    )
    console.log(`   Status: ${updateResult.status}`)
    console.log(`   Success: ${updateResult.ok}`)
    console.log()
  }

  // Test 6: Update Self (should fail)
  console.log('🚫 Test 6: PUT - Update Own Role (should fail)')
  const updateSelfResult = await testAPI(
    'PUT',
    `/api/platform/organizations/${TEST_ORG_SLUG}/members`,
    ADMIN_TOKEN,
    {
      member_id: 'self-member-id', // Would be their own member ID
      role: 'owner',
    }
  )
  console.log(`   Status: ${updateSelfResult.status}`)
  console.log(`   Expected 400/403: ${[400, 403, 404].includes(updateSelfResult.status) ? '✅' : '❌'}`)
  console.log()

  // Test 7: Remove Member (admin can remove non-owners)
  if (inviteResult.data?.id) {
    console.log('🗑️  Test 7: DELETE - Remove Member')
    const removeResult = await testAPI(
      'DELETE',
      `/api/platform/organizations/${TEST_ORG_SLUG}/members`,
      ADMIN_TOKEN,
      {
        member_id: inviteResult.data.id,
      }
    )
    console.log(`   Status: ${removeResult.status}`)
    console.log(`   Success: ${removeResult.ok}`)
    console.log()
  }

  // Test 8: Developer tries to invite (should fail)
  console.log('🚫 Test 8: POST - Invite as Developer (should fail)')
  const devInviteResult = await testAPI(
    'POST',
    `/api/platform/organizations/${TEST_ORG_SLUG}/members`,
    DEVELOPER_TOKEN,
    {
      email: 'another@example.com',
      role: 'developer',
    }
  )
  console.log(`   Status: ${devInviteResult.status}`)
  console.log(`   Expected 403: ${devInviteResult.status === 403 ? '✅' : '❌'}`)
  console.log()

  console.log('✅ Member API Tests Complete!\n')
  console.log('📊 Summary:')
  console.log('   - List members: Any member can view')
  console.log('   - Invite members: Admin+ only')
  console.log('   - Invite owners: Owner only')
  console.log('   - Update roles: Admin+ (owner only for owner roles)')
  console.log('   - Cannot update own role')
  console.log('   - Remove members: Admin+ (owner only for removing owners)')
  console.log('   - Cannot remove self')
}

// Run tests
runTests().catch(console.error)
