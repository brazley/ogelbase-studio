import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignUpForm } from './SignUpForm'
import { useSignUpMutation } from 'data/misc/signup-mutation'

// Mock the signup mutation
jest.mock('data/misc/signup-mutation')
jest.mock('next/router', () => ({
  useRouter: () => ({
    query: {},
    push: jest.fn(),
  }),
}))

jest.mock('nuqs', () => ({
  parseAsString: {
    withDefault: (defaultValue: string) => ({
      parse: () => defaultValue,
    }),
  },
  useQueryStates: () => [{ auth_id: '', token: '' }],
}))

const meta = {
  title: 'Authentication/SignUpForm',
  component: SignUpForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A comprehensive sign-up form with validation, password strength indicator, and accessibility features.',
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
} satisfies Meta<typeof SignUpForm>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default empty form state.
 * All fields are empty and ready for user input.
 */
export const Default: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
  },
}

/**
 * Form with all fields filled in correctly.
 * Demonstrates the form ready for submission.
 */
export const Filled: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Fill in all fields
    await userEvent.type(canvas.getByLabelText(/email/i), 'john.doe@example.com')
    await userEvent.type(canvas.getByLabelText(/first name/i), 'John')
    await userEvent.type(canvas.getByLabelText(/last name/i), 'Doe')
    await userEvent.type(canvas.getByLabelText(/username/i), 'johndoe')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecureP@ss123!')
    await userEvent.type(canvas.getByLabelText(/confirm password/i), 'MySecureP@ss123!')
    await userEvent.click(canvas.getByLabelText(/terms and conditions/i))
  },
}

/**
 * Form showing validation errors.
 * Demonstrates error states for invalid inputs.
 */
export const WithValidationErrors: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Enter invalid data and trigger validation
    await userEvent.type(canvas.getByLabelText(/email/i), 'invalid-email')
    await userEvent.type(canvas.getByLabelText(/first name/i), 'J') // Too short
    await userEvent.type(canvas.getByLabelText(/username/i), 'invalid user!') // Invalid characters
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'weak')
    await userEvent.type(canvas.getByLabelText(/confirm password/i), 'different')

    // Blur to trigger validation
    await userEvent.tab()
  },
}

/**
 * Form in loading state during submission.
 * Shows disabled fields and loading spinner.
 */
export const Loading: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: true,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Fill in form to see loading state
    await userEvent.type(canvas.getByLabelText(/email/i), 'john.doe@example.com')
    await userEvent.type(canvas.getByLabelText(/first name/i), 'John')
    await userEvent.type(canvas.getByLabelText(/last name/i), 'Doe')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecureP@ss123!')
    await userEvent.type(canvas.getByLabelText(/confirm password/i), 'MySecureP@ss123!')
    await userEvent.click(canvas.getByLabelText(/terms and conditions/i))
  },
}

/**
 * Form showing API error state.
 * Demonstrates error handling for server-side errors.
 */
export const WithAPIError: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn((data, options) => {
        setTimeout(() => {
          options.onError?.({
            message: 'An account with this email already exists. Please sign in instead.',
          })
        }, 0)
      }),
      isLoading: false,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Fill and submit form to trigger error
    await userEvent.type(canvas.getByLabelText(/email/i), 'existing@example.com')
    await userEvent.type(canvas.getByLabelText(/first name/i), 'John')
    await userEvent.type(canvas.getByLabelText(/last name/i), 'Doe')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecureP@ss123!')
    await userEvent.type(canvas.getByLabelText(/confirm password/i), 'MySecureP@ss123!')
    await userEvent.click(canvas.getByLabelText(/terms and conditions/i))
    await userEvent.click(canvas.getByRole('button', { name: /sign up/i }))
  },
}

/**
 * Form showing successful submission state.
 * Displays success message with redirect notification.
 */
export const Success: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn((data, options) => {
        setTimeout(() => {
          options.onSuccess?.()
        }, 0)
      }),
      isLoading: false,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    // Fill and submit form
    await userEvent.type(canvas.getByLabelText(/email/i), 'john.doe@example.com')
    await userEvent.type(canvas.getByLabelText(/first name/i), 'John')
    await userEvent.type(canvas.getByLabelText(/last name/i), 'Doe')
    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecureP@ss123!')
    await userEvent.type(canvas.getByLabelText(/confirm password/i), 'MySecureP@ss123!')
    await userEvent.click(canvas.getByLabelText(/terms and conditions/i))
    await userEvent.click(canvas.getByRole('button', { name: /sign up/i }))
  },
}

/**
 * Form showing password strength indicator.
 * Demonstrates weak password state.
 */
export const WeakPassword: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    const passwordInput = canvas.getByLabelText(/^password$/i)
    await userEvent.click(passwordInput)
    await userEvent.type(passwordInput, 'weak')
  },
}

/**
 * Form showing password strength indicator.
 * Demonstrates medium password strength.
 */
export const MediumPassword: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    const passwordInput = canvas.getByLabelText(/^password$/i)
    await userEvent.click(passwordInput)
    await userEvent.type(passwordInput, 'Password123')
  },
}

/**
 * Form showing password strength indicator.
 * Demonstrates strong password state.
 */
export const StrongPassword: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    const passwordInput = canvas.getByLabelText(/^password$/i)
    await userEvent.click(passwordInput)
    await userEvent.type(passwordInput, 'MySecureP@ss123!')
  },
}

/**
 * Form showing password mismatch error.
 * Demonstrates confirm password validation.
 */
export const PasswordMismatch: Story = {
  beforeEach: () => {
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
  },
  play: async ({ canvasElement }) => {
    const { userEvent, within } = await import('@storybook/testing-library')
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText(/^password$/i), 'MySecureP@ss123!')
    await userEvent.type(canvas.getByLabelText(/confirm password/i), 'DifferentP@ss123!')
    await userEvent.tab()
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
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
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
    const mockUseSignUpMutation = useSignUpMutation as jest.Mock
    mockUseSignUpMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
    })
  },
}
