/**
 * Test User Fixtures
 *
 * Provides consistent test user data for E2E and integration tests.
 * Uses timestamp-based emails to avoid collisions across test runs.
 */

export interface TestUser {
  email: string
  password: string
  first_name: string
  last_name: string
  username?: string
}

/**
 * Generate unique email with timestamp to avoid collisions
 */
export function generateUniqueEmail(base: string): string {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  return `${base}+${timestamp}${random}@test.example.com`
}

/**
 * Valid test user with strong password
 */
export function createValidTestUser(emailBase = 'testuser'): TestUser {
  return {
    email: generateUniqueEmail(emailBase),
    password: 'SecurePass123!',
    first_name: 'Test',
    last_name: 'User',
    username: `${emailBase}_${Date.now()}`,
  }
}

/**
 * Another valid user for multi-user testing
 */
export function createAnotherTestUser(emailBase = 'another'): TestUser {
  return {
    email: generateUniqueEmail(emailBase),
    password: 'AnotherPass456!',
    first_name: 'Another',
    last_name: 'User',
    username: `${emailBase}_${Date.now()}`,
  }
}

/**
 * User with weak password (for validation testing)
 */
export function createWeakPasswordUser(): TestUser {
  return {
    email: generateUniqueEmail('weak'),
    password: 'weak',  // Too short, no uppercase, no number, no symbol
    first_name: 'Weak',
    last_name: 'Password',
  }
}

/**
 * User with invalid email (for validation testing)
 */
export function createInvalidEmailUser(): TestUser {
  return {
    email: 'not-an-email',
    password: 'ValidPass123!',
    first_name: 'Invalid',
    last_name: 'Email',
  }
}

/**
 * Predefined users for specific test scenarios
 */
export const TEST_USERS = {
  // Valid user credentials (update after each test run if needed)
  existing: {
    email: 'existing@test.example.com',
    password: 'ExistingPass123!',
  },

  // User that should NOT exist
  nonexistent: {
    email: 'nonexistent@test.example.com',
    password: 'SomePassword123!',
  },

  // User with wrong password
  wrongPassword: {
    email: 'wrong@test.example.com',
    correctPassword: 'CorrectPass123!',
    wrongPassword: 'WrongPass456!',
  },
}
