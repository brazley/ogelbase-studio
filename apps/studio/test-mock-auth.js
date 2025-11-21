#!/usr/bin/env node

/**
 * Test Mock Authentication Implementation
 *
 * This script verifies that the mock auth environment variables are set correctly
 * and provides guidance on testing the implementation.
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 Mock Authentication Implementation Test\n')

// Check .env.local file
const envPath = path.join(__dirname, '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found')
  process.exit(1)
}

const envContent = fs.readFileSync(envPath, 'utf-8')

// Check for required environment variables
const checks = [
  {
    name: 'NEXT_PUBLIC_IS_PLATFORM',
    pattern: /NEXT_PUBLIC_IS_PLATFORM=true/,
    required: true,
  },
  {
    name: 'NEXT_PUBLIC_ENABLE_MOCK_AUTH',
    pattern: /NEXT_PUBLIC_ENABLE_MOCK_AUTH=true/,
    required: true,
  },
]

let allPassed = true

checks.forEach((check) => {
  const found = check.pattern.test(envContent)
  const status = found ? '✅' : '❌'
  console.log(`${status} ${check.name}: ${found ? 'Set' : 'Missing'}`)
  if (check.required && !found) {
    allPassed = false
  }
})

console.log('\n📋 Implementation Summary:\n')
console.log('Files Modified:')
console.log('  1. /apps/studio/lib/auth.tsx')
console.log('     - Added environment variable check for NEXT_PUBLIC_ENABLE_MOCK_AUTH')
console.log('     - Passes alwaysLoggedIn=true when mock auth is enabled')
console.log('')
console.log('  2. /packages/common/auth.tsx')
console.log('     - Updated DEFAULT_SESSION with proper mock values')
console.log('     - Includes email: admin@ogelbase.com')
console.log('     - Includes valid access_token and user data')
console.log('')
console.log('  3. /apps/studio/.env.local')
console.log('     - Added NEXT_PUBLIC_ENABLE_MOCK_AUTH=true')
console.log('')

if (allPassed) {
  console.log('✅ All checks passed!\n')
  console.log('Next Steps:')
  console.log('  1. Restart the dev server: pnpm --filter studio dev')
  console.log('  2. Open http://localhost:3000')
  console.log('  3. Check browser Network tab for:')
  console.log('     - /api/profile request')
  console.log('     - /api/organizations request')
  console.log('     - /api/projects request')
  console.log('  4. Verify UI renders platform features')
  console.log('')
  console.log('Expected Behavior:')
  console.log('  - No auth redirect')
  console.log('  - Mock user: admin@ogelbase.com')
  console.log('  - Access token: mock-access-token')
  console.log('  - Platform UI visible')
} else {
  console.log('❌ Some checks failed. Please verify environment configuration.\n')
  process.exit(1)
}
