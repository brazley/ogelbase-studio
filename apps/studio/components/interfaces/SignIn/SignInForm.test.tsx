import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import { SignInForm } from './SignInForm'

// Mock dependencies
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@hcaptcha/react-hcaptcha', () => {
  return function HCaptcha() {
    return <div data-testid="hcaptcha" />
  }
})

// Mock fetch globally
global.fetch = jest.fn()

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

describe('SignInForm', () => {
  const mockPush = jest.fn()
  const mockFetch = global.fetch as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      query: {},
      push: mockPush,
    })

    // Setup localStorage and sessionStorage mocks
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    })

    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    })
  })

  describe('Rendering', () => {
    it('renders all required form fields', () => {
      render(<SignInForm />, { wrapper: createWrapper() })

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('renders password visibility toggle', () => {
      render(<SignInForm />, { wrapper: createWrapper() })

      const passwordToggle = screen.getByLabelText(/show password|hide password/i)
      expect(passwordToggle).toBeInTheDocument()
    })

    it('renders forgot password link', () => {
      render(<SignInForm />, { wrapper: createWrapper() })

      const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i })
      expect(forgotPasswordLink).toBeInTheDocument()
      expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password')
    })

    it('renders sign up link', () => {
      render(<SignInForm />, { wrapper: createWrapper() })

      const signUpLink = screen.getByRole('link', { name: /sign up/i })
      expect(signUpLink).toBeInTheDocument()
      expect(signUpLink).toHaveAttribute('href', '/sign-up')
    })

    it('renders remember me checkbox unchecked by default', () => {
      render(<SignInForm />, { wrapper: createWrapper() })

      const rememberMeCheckbox = screen.getByLabelText(/remember me/i)
      expect(rememberMeCheckbox).not.toBeChecked()
    })
  })

  describe('Email Validation', () => {
    it('shows error for invalid email format', async () => {
      const user = userEvent.setup()
      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, 'invalid-email')
      await user.tab() // Trigger onBlur validation

      await waitFor(() => {
        expect(screen.getByText(/must be a valid email/i)).toBeInTheDocument()
      })
    })

    it('shows error for empty email', async () => {
      const user = userEvent.setup()
      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      await user.click(emailInput)
      await user.tab() // Trigger onBlur validation

      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument()
      })
    })

    it('accepts valid email format', async () => {
      const user = userEvent.setup()
      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, 'test@example.com')
      await user.tab()

      await waitFor(() => {
        expect(screen.queryByText(/must be a valid email/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Password Validation', () => {
    it('shows error for empty password', async () => {
      const user = userEvent.setup()
      render(<SignInForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.click(passwordInput)
      await user.tab()

      await waitFor(() => {
        expect(screen.getByText(/password is required/i)).toBeInTheDocument()
      })
    })
  })

  describe('Password Visibility Toggle', () => {
    it('toggles password visibility when button is clicked', async () => {
      const user = userEvent.setup()
      render(<SignInForm />, { wrapper: createWrapper() })

      const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement
      const toggleButton = screen.getByLabelText(/show password/i)

      // Initially hidden
      expect(passwordInput.type).toBe('password')

      // Click to show
      await user.click(toggleButton)
      expect(passwordInput.type).toBe('text')

      // Click to hide again
      const hideButton = screen.getByLabelText(/hide password/i)
      await user.click(hideButton)
      expect(passwordInput.type).toBe('password')
    })
  })

  describe('Remember Me Checkbox', () => {
    it('toggles remember me checkbox', async () => {
      const user = userEvent.setup()
      render(<SignInForm />, { wrapper: createWrapper() })

      const rememberMeCheckbox = screen.getByLabelText(/remember me/i)
      expect(rememberMeCheckbox).not.toBeChecked()

      await user.click(rememberMeCheckbox)
      expect(rememberMeCheckbox).toBeChecked()

      await user.click(rememberMeCheckbox)
      expect(rememberMeCheckbox).not.toBeChecked()
    })
  })

  describe('Form Submission - Success', () => {
    it('submits form successfully and stores token in sessionStorage when remember me is unchecked', async () => {
      const user = userEvent.setup()
      const mockToken = 'mock-auth-token'
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
      }
      const mockExpiresAt = new Date().toISOString()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: mockToken,
          user: mockUser,
          expires_at: mockExpiresAt,
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/auth/signin',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'test@example.com',
              password: 'password123',
              rememberMe: false,
            }),
          })
        )
      })

      await waitFor(() => {
        expect(window.sessionStorage.setItem).toHaveBeenCalledWith('auth_token', mockToken)
        expect(window.sessionStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser))
        expect(window.sessionStorage.setItem).toHaveBeenCalledWith('token_expires_at', mockExpiresAt)
        expect(mockPush).toHaveBeenCalledWith('/organizations')
      })
    })

    it('submits form successfully and stores token in localStorage when remember me is checked', async () => {
      const user = userEvent.setup()
      const mockToken = 'mock-auth-token'
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
      }
      const mockExpiresAt = new Date().toISOString()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: mockToken,
          user: mockUser,
          expires_at: mockExpiresAt,
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const rememberMeCheckbox = screen.getByLabelText(/remember me/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(rememberMeCheckbox)
      await user.click(submitButton)

      await waitFor(() => {
        expect(window.localStorage.setItem).toHaveBeenCalledWith('auth_token', mockToken)
        expect(window.localStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser))
        expect(window.localStorage.setItem).toHaveBeenCalledWith('token_expires_at', mockExpiresAt)
      })
    })

    it('redirects to returnTo URL when provided', async () => {
      const user = userEvent.setup()
      ;(useRouter as jest.Mock).mockReturnValue({
        query: { returnTo: '/custom-path' },
        push: mockPush,
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'token',
          user: { id: '123', email: 'test@example.com' },
          expires_at: new Date().toISOString(),
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/custom-path')
      })
    })
  })

  describe('Form Submission - Invalid Credentials', () => {
    it('displays error for invalid credentials (401)', async () => {
      const user = userEvent.setup()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'wrongpassword')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument()
      })
    })

    it('displays error for deleted account', async () => {
      const user = userEvent.setup()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'This account has been deleted',
          code: 'ACCOUNT_DELETED',
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/this account has been deleted/i)).toBeInTheDocument()
      })
    })
  })

  describe('Form Submission - Rate Limiting', () => {
    it('displays rate limit error with countdown timer', async () => {
      const user = userEvent.setup()
      jest.useFakeTimers()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Too many sign-in attempts',
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/too many sign-in attempts/i)).toBeInTheDocument()
        expect(screen.getByText(/15 minutes/i)).toBeInTheDocument()
      })

      // Fast-forward 60 seconds
      jest.advanceTimersByTime(60000)

      await waitFor(() => {
        expect(screen.getByText(/14 minutes/i)).toBeInTheDocument()
      })

      jest.useRealTimers()
    })

    it('disables form when rate limited', async () => {
      const user = userEvent.setup()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Too many sign-in attempts',
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      await waitFor(() => {
        expect(emailInput).toBeDisabled()
        expect(passwordInput).toBeDisabled()
        expect(submitButton).toBeDisabled()
      })
    })
  })

  describe('Form Submission - Server Errors', () => {
    it('displays error for validation failure (400)', async () => {
      const user = userEvent.setup()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: {
            email: ['Invalid email format'],
          },
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'invalid')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/please check your information/i)).toBeInTheDocument()
      })
    })

    it('displays error for server error (500)', async () => {
      const user = userEvent.setup()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        }),
      })

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA labels on form fields', () => {
      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const rememberMeCheckbox = screen.getByLabelText(/remember me/i)

      expect(emailInput).toHaveAttribute('aria-required', 'true')
      expect(passwordInput).toHaveAttribute('aria-required', 'true')
      expect(rememberMeCheckbox).toHaveAttribute('aria-label')
    })

    it('marks invalid fields with aria-invalid', async () => {
      const user = userEvent.setup()
      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, 'invalid-email')
      await user.tab()

      await waitFor(() => {
        expect(emailInput).toHaveAttribute('aria-invalid', 'true')
      })
    })

    it('disables forgot password link when form is submitting', async () => {
      const user = userEvent.setup()

      // Mock a slow response to keep the form in submitting state
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    token: 'token',
                    user: { id: '123', email: 'test@example.com' },
                    expires_at: new Date().toISOString(),
                  }),
                }),
              100
            )
          )
      )

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i })
      expect(forgotPasswordLink).toHaveAttribute('tabIndex', '-1')
    })
  })

  describe('Loading States', () => {
    it('disables form fields while submitting', async () => {
      const user = userEvent.setup()

      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    token: 'token',
                    user: { id: '123', email: 'test@example.com' },
                    expires_at: new Date().toISOString(),
                  }),
                }),
              100
            )
          )
      )

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      // Check that fields are disabled during submission
      expect(emailInput).toBeDisabled()
      expect(passwordInput).toBeDisabled()
      expect(submitButton).toBeDisabled()
    })

    it('shows loading text on submit button', async () => {
      const user = userEvent.setup()

      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    token: 'token',
                    user: { id: '123', email: 'test@example.com' },
                    expires_at: new Date().toISOString(),
                  }),
                }),
              100
            )
          )
      )

      render(<SignInForm />, { wrapper: createWrapper() })

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/^password$/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument()
    })
  })
})
