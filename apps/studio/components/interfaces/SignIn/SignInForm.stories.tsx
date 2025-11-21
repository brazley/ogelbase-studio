import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignInForm } from './SignInForm'

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    query: {},
    push: jest.fn(),
  }),
}))

// Mock fetch globally
global.fetch = jest.fn()

const meta = {
  title: 'Authentication/SignInForm',
  component: SignInForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A comprehensive sign-in form with validation, remember me functionality, rate limiting, and accessibility features.',
      },
    },
  },
  decorators: [
    (Story) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })

      return (
        <QueryClientProvider client={queryClient}>
          <div className="w-full max-w-md p-6">
            <Story />
          </div>
        </QueryClientProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof SignInForm>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default empty form state.
 * All fields are empty and ready for user input.
 */
export const Default: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
  },
}

/**
 * Form with all fields filled in correctly.
 * Demonstrates the form ready for submission.
 */
export const Filled: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Fill in all fields
    await userEvent.type(canvas.getByLabelText(/email/i), 'john.doe@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecurePassword123!')
  },
}

/**
 * Form with Remember Me checkbox checked.
 * Demonstrates the extended session option.
 */
export const WithRememberMe: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText(/email/i), 'john.doe@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecurePassword123!')
    await userEvent.click(canvas.getByLabelText(/remember me/i))
  },
}

/**
 * Form showing validation errors.
 * Demonstrates error states for invalid inputs.
 */
export const WithValidationErrors: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Enter invalid data and trigger validation
    await userEvent.type(canvas.getByLabelText(/email/i), 'invalid-email')
    await userEvent.tab() // Trigger onBlur validation
  },
}

/**
 * Form in loading state during submission.
 * Shows disabled fields and loading spinner.
 */
export const Loading: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  token: 'mock-token',
                  user: { id: '123', email: 'test@example.com' },
                  expires_at: new Date().toISOString(),
                }),
              }),
            10000
          )
        )
    )
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Fill and submit form to see loading state
    await userEvent.type(canvas.getByLabelText(/email/i), 'john.doe@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecurePassword123!')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
  },
}

/**
 * Form showing invalid credentials error.
 * Demonstrates error handling for wrong email/password.
 */
export const InvalidCredentials: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      }),
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Fill and submit form to trigger error
    await userEvent.type(canvas.getByLabelText(/email/i), 'wrong@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'WrongPassword123!')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
  },
}

/**
 * Form showing rate limit error with countdown.
 * Demonstrates rate limiting protection.
 */
export const RateLimited: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: 'Too many sign-in attempts',
        code: 'RATE_LIMIT_EXCEEDED',
      }),
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Fill and submit form to trigger rate limit
    await userEvent.type(canvas.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'Password123!')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
  },
}

/**
 * Form showing deleted account error.
 * Demonstrates handling of deleted accounts.
 */
export const DeletedAccount: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'This account has been deleted',
        code: 'ACCOUNT_DELETED',
      }),
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText(/email/i), 'deleted@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'Password123!')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
  },
}

/**
 * Form showing banned account error.
 * Demonstrates handling of banned accounts.
 */
export const BannedAccount: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'Account is banned until 2025-12-31T23:59:59Z',
        code: 'ACCOUNT_BANNED',
      }),
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText(/email/i), 'banned@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'Password123!')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
  },
}

/**
 * Form showing server error.
 * Demonstrates handling of 500 errors.
 */
export const ServerError: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      }),
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'Password123!')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
  },
}

/**
 * Form showing successful submission.
 * Demonstrates successful login flow.
 */
export const Success: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'mock-auth-token',
        user: {
          id: '123',
          email: 'john.doe@example.com',
          first_name: 'John',
          last_name: 'Doe',
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText(/email/i), 'john.doe@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecurePassword123!')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
  },
}

/**
 * Form with password visibility toggled.
 * Demonstrates password show/hide functionality.
 */
export const PasswordVisible: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecurePassword123!')
    await userEvent.click(canvas.getByLabelText(/show password/i))
  },
}

/**
 * Form with dark mode theme.
 * Demonstrates dark theme styling.
 */
export const DarkMode: Story = {
  parameters: {
    theme: 'dark',
    backgrounds: {
      default: 'dark',
    },
  },
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
  },
}

/**
 * Form showing responsive layout on mobile.
 */
export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
  },
}

/**
 * Form with returnTo URL in query parameters.
 * Demonstrates redirect after login.
 */
export const WithReturnTo: Story = {
  beforeEach: () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'mock-auth-token',
        user: {
          id: '123',
          email: 'john.doe@example.com',
          first_name: 'John',
          last_name: 'Doe',
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    })

    // Mock router with returnTo query param
    jest.resetModules()
    jest.mock('next/router', () => ({
      useRouter: () => ({
        query: { returnTo: '/dashboard' },
        push: jest.fn(),
      }),
    }))
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText(/email/i), 'john.doe@example.com')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecurePassword123!')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
  },
}
