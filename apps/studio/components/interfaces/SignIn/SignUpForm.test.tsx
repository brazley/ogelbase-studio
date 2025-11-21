import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import { SignUpForm } from './SignUpForm'

// Mock dependencies
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}))

jest.mock('data/misc/signup-mutation', () => ({
  useSignUpMutation: jest.fn((options) => ({
    mutate: jest.fn((data) => {
      // Simulate successful signup
      setTimeout(() => options?.onSuccess?.(), 0)
    }),
    isLoading: false,
  })),
}))

jest.mock('@hcaptcha/react-hcaptcha', () => {
  return function HCaptcha() {
    return <div data-testid="hcaptcha" />
  }
})

jest.mock('nuqs', () => ({
  parseAsString: {
    withDefault: jest.fn((defaultValue) => ({
      parse: jest.fn(() => defaultValue),
    })),
  },
  useQueryStates: jest.fn(() => [{ auth_id: '', token: '' }]),
}))

// Test utilities
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('SignUpForm', () => {
  beforeEach(() => {
    ;(useRouter as jest.Mock).mockReturnValue({
      query: {},
      push: jest.fn(),
    })
  })

  describe('Rendering', () => {
    it('renders all required form fields', () => {
      render(<SignUpForm />, { wrapper: createWrapper() })

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/terms and conditions/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()
    })

    it('renders password visibility toggles', () => {
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordToggles = screen.getAllByLabelText(/show password|hide password/i)
      expect(passwordToggles).toHaveLength(2) // One for password, one for confirm password
    })

    it('renders sign in link', () => {
      render(<SignUpForm />, { wrapper: createWrapper() })

      const signInLink = screen.getByRole('link', { name: /sign in/i })
      expect(signInLink).toBeInTheDocument()
      expect(signInLink).toHaveAttribute('href', '/sign-in')
    })
  })

  describe('Email Validation', () => {
    it('shows error for invalid email format', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, 'invalid-email')
      await user.tab() // Trigger onBlur validation

      await waitFor(() => {
        expect(screen.getByText(/must be a valid email/i)).toBeInTheDocument()
      })
    })

    it('accepts valid email format', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, 'test@example.com')
      await user.tab()

      await waitFor(() => {
        expect(screen.queryByText(/must be a valid email/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Password Strength Indicator', () => {
    it('shows password strength indicator when password field is focused', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.click(passwordInput)

      await waitFor(() => {
        expect(screen.getByText(/password strength/i)).toBeInTheDocument()
      })
    })

    it('displays weak strength for short passwords', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.type(passwordInput, 'short')

      await waitFor(() => {
        expect(screen.getByText(/weak/i)).toBeInTheDocument()
      })
    })

    it('displays strong strength for complex passwords', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.click(passwordInput)
      await user.type(passwordInput, 'MyP@ssw0rd123!')

      await waitFor(() => {
        expect(screen.getByText(/strong/i)).toBeInTheDocument()
      })
    })

    it('shows all password requirements', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.click(passwordInput)

      await waitFor(() => {
        expect(screen.getByText(/8 characters or more/i)).toBeInTheDocument()
        expect(screen.getByText(/uppercase letter/i)).toBeInTheDocument()
        expect(screen.getByText(/lowercase letter/i)).toBeInTheDocument()
        expect(screen.getByText(/number/i)).toBeInTheDocument()
        expect(screen.getByText(/special character/i)).toBeInTheDocument()
      })
    })
  })

  describe('Password Confirmation', () => {
    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      await user.type(passwordInput, 'MyP@ssw0rd123!')
      await user.type(confirmPasswordInput, 'DifferentP@ssw0rd!')

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
      })
    })

    it('clears error when passwords match', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      await user.type(passwordInput, 'MyP@ssw0rd123!')
      await user.type(confirmPasswordInput, 'MyP@ssw0rd123!')

      await waitFor(() => {
        expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Form Validation', () => {
    it('requires all mandatory fields', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const submitButton = screen.getByRole('button', { name: /sign up/i })

      // Submit button should be disabled initially
      expect(submitButton).toBeDisabled()
    })

    it('validates first name length', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const firstNameInput = screen.getByLabelText(/first name/i)
      await user.type(firstNameInput, 'A'.repeat(51)) // Exceeds max length
      await user.tab()

      await waitFor(() => {
        expect(screen.getByText(/cannot exceed 50 characters/i)).toBeInTheDocument()
      })
    })

    it('validates username format', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const usernameInput = screen.getByLabelText(/username/i)
      await user.type(usernameInput, 'invalid username!') // Contains invalid characters
      await user.tab()

      await waitFor(() => {
        expect(screen.getByText(/can only contain letters, numbers/i)).toBeInTheDocument()
      })
    })
  })

  describe('Terms and Conditions', () => {
    it('requires acceptance of terms', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const termsCheckbox = screen.getByLabelText(/terms and conditions/i)

      // Fill in all fields but don't check terms
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/^password$/i), 'MyP@ssw0rd123!')
      await user.type(screen.getByLabelText(/confirm password/i), 'MyP@ssw0rd123!')

      const submitButton = screen.getByRole('button', { name: /sign up/i })
      expect(submitButton).toBeDisabled()

      // Check terms
      await user.click(termsCheckbox)

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled()
      })
    })

    it('renders links to terms and privacy policy', () => {
      render(<SignUpForm />, { wrapper: createWrapper() })

      const termsLink = screen.getByRole('link', { name: /terms and conditions/i })
      const privacyLink = screen.getByRole('link', { name: /privacy policy/i })

      expect(termsLink).toHaveAttribute('href', '/terms')
      expect(privacyLink).toHaveAttribute('href', '/privacy')
    })
  })

  describe('Form Submission', () => {
    it('displays loading state during submission', async () => {
      const user = userEvent.setup()
      const mockMutate = jest.fn()

      const { useSignUpMutation } = require('data/misc/signup-mutation')
      useSignUpMutation.mockReturnValue({
        mutate: mockMutate,
        isLoading: true,
      })

      render(<SignUpForm />, { wrapper: createWrapper() })

      const submitButton = screen.getByRole('button', { name: /creating account/i })
      expect(submitButton).toBeDisabled()
    })

    it('displays success message after successful signup', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      // Fill in all fields
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/^password$/i), 'MyP@ssw0rd123!')
      await user.type(screen.getByLabelText(/confirm password/i), 'MyP@ssw0rd123!')
      await user.click(screen.getByLabelText(/terms and conditions/i))

      const submitButton = screen.getByRole('button', { name: /sign up/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/check your email to confirm/i)).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA labels for all inputs', () => {
      render(<SignUpForm />, { wrapper: createWrapper() })

      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-required', 'true')
      expect(screen.getByLabelText(/first name/i)).toHaveAttribute('aria-required', 'true')
      expect(screen.getByLabelText(/last name/i)).toHaveAttribute('aria-required', 'true')
      expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('aria-required', 'true')
      expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('aria-required', 'true')
    })

    it('sets aria-invalid on fields with errors', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, 'invalid')
      await user.tab()

      await waitFor(() => {
        expect(emailInput).toHaveAttribute('aria-invalid', 'true')
      })
    })

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      // Tab through all form fields
      await user.tab() // Email
      expect(screen.getByLabelText(/email/i)).toHaveFocus()

      await user.tab() // First Name
      expect(screen.getByLabelText(/first name/i)).toHaveFocus()

      await user.tab() // Last Name
      expect(screen.getByLabelText(/last name/i)).toHaveFocus()
    })

    it('announces password strength changes to screen readers', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.click(passwordInput)

      const strengthIndicator = screen.getByRole('status')
      expect(strengthIndicator).toHaveAttribute('aria-live', 'polite')
      expect(strengthIndicator).toHaveAttribute('aria-atomic', 'true')
    })
  })

  describe('Password Visibility Toggle', () => {
    it('toggles password visibility', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement
      const toggleButton = screen.getAllByLabelText(/show password/i)[0]

      // Initially hidden
      expect(passwordInput.type).toBe('password')

      // Click to show
      await user.click(toggleButton)
      expect(passwordInput.type).toBe('text')

      // Click to hide
      await user.click(screen.getAllByLabelText(/hide password/i)[0])
      expect(passwordInput.type).toBe('password')
    })

    it('toggles confirm password visibility independently', async () => {
      const user = userEvent.setup()
      render(<SignUpForm />, { wrapper: createWrapper() })

      const confirmPasswordInput = screen.getByLabelText(/confirm password/i) as HTMLInputElement
      const toggleButton = screen.getAllByLabelText(/show password/i)[1]

      expect(confirmPasswordInput.type).toBe('password')

      await user.click(toggleButton)
      expect(confirmPasswordInput.type).toBe('text')
    })
  })
})
