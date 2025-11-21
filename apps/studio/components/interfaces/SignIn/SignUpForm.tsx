import HCaptcha from '@hcaptcha/react-hcaptcha'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/router'
import { parseAsString, useQueryStates } from 'nuqs'
import { useRef, useState, useEffect } from 'react'
import { SubmitHandler, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import z from 'zod'

import { useSignUpMutation } from 'data/misc/signup-mutation'
import { BASE_PATH } from 'lib/constants'
import { buildPathWithParams } from 'lib/gotrue'
import {
  AlertDescription_Shadcn_,
  AlertTitle_Shadcn_,
  Alert_Shadcn_,
  Button,
  FormControl_Shadcn_,
  FormField_Shadcn_,
  Form_Shadcn_,
  Input_Shadcn_,
  Checkbox_Shadcn_,
  cn,
} from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import PasswordStrengthIndicator from './PasswordStrengthIndicator'

const schema = z
  .object({
    email: z.string().min(1, 'Email is required').email('Must be a valid email'),
    password: z
      .string()
      .min(1, 'Password is required')
      .max(72, 'Password cannot exceed 72 characters')
      .refine((password) => password.length >= 8, 'Password must be at least 8 characters')
      .refine(
        (password) => /[A-Z]/.test(password),
        'Password must contain at least 1 uppercase character'
      )
      .refine(
        (password) => /[a-z]/.test(password),
        'Password must contain at least 1 lowercase character'
      )
      .refine((password) => /[0-9]/.test(password), 'Password must contain at least 1 number')
      .refine(
        (password) => /[!@#$%^&*()_+\-=\[\]{};`':"\\|,.<>\/?]/.test(password),
        'Password must contain at least 1 symbol'
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    firstName: z
      .string()
      .min(1, 'First name is required')
      .max(50, 'First name cannot exceed 50 characters'),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .max(50, 'Last name cannot exceed 50 characters'),
    username: z
      .string()
      .max(30, 'Username cannot exceed 30 characters')
      .optional()
      .refine(
        (username) => !username || /^[a-zA-Z0-9_-]+$/.test(username),
        'Username can only contain letters, numbers, hyphens, and underscores'
      ),
    acceptTerms: z.boolean().refine((val) => val === true, 'You must accept the terms and conditions'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

const formId = 'sign-up-form'

export const SignUpForm = () => {
  const captchaRef = useRef<HCaptcha>(null)
  const [showPasswordConditions, setShowPasswordConditions] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [passwordHidden, setPasswordHidden] = useState(true)
  const [confirmPasswordHidden, setConfirmPasswordHidden] = useState(true)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const router = useRouter()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      username: '',
      acceptTerms: false,
    },
    mode: 'onBlur', // Validate on blur for better UX
  })

  const [searchParams] = useQueryStates({
    auth_id: parseAsString.withDefault(''),
    token: parseAsString.withDefault(''),
  })

  const { mutate: signup, isLoading: isSigningUp } = useSignUpMutation({
    onSuccess: () => {
      toast.success('Signed up successfully!')
      setIsSubmitted(true)
      setApiError(null)

      // Redirect after 2 seconds
      setTimeout(() => {
        const isInsideOAuthFlow = !!searchParams.auth_id
        const redirectUrlBase = `${
          process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
            ? location.origin
            : process.env.NEXT_PUBLIC_SITE_URL
        }${BASE_PATH}`

        let redirectTo: string
        if (isInsideOAuthFlow) {
          redirectTo = `${redirectUrlBase}/authorize?auth_id=${searchParams.auth_id}${
            searchParams.token && `&token=${searchParams.token}`
          }`
        } else {
          const { returnTo } = router.query
          const basePath = returnTo || '/sign-in'
          const fullPath = buildPathWithParams(basePath as string)
          redirectTo = `${redirectUrlBase}${fullPath}`
        }

        router.push(redirectTo)
      }, 2000)
    },
    onError: (error) => {
      setCaptchaToken(null)
      captchaRef.current?.resetCaptcha()

      // Handle different error types
      const errorMessage = error.message || 'An unexpected error occurred'
      setApiError(errorMessage)

      // Map common error codes to user-friendly messages
      if (error.message?.includes('already exists') || error.message?.includes('409')) {
        setApiError('An account with this email already exists. Please sign in instead.')
        form.setError('email', { message: 'This email is already registered' })
      } else if (error.message?.includes('400')) {
        setApiError('Please check your information and try again.')
      } else if (error.message?.includes('500')) {
        setApiError('Server error. Please try again later.')
      }

      toast.error(`Failed to sign up: ${errorMessage}`)
    },
  })

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setApiError(null)

    // Get captcha token
    let token = captchaToken
    if (!token) {
      const captchaResponse = await captchaRef.current?.execute({ async: true })
      token = captchaResponse?.response ?? null
    }

    const isInsideOAuthFlow = !!searchParams.auth_id
    const redirectUrlBase = `${
      process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
        ? location.origin
        : process.env.NEXT_PUBLIC_SITE_URL
    }${BASE_PATH}`

    let redirectTo: string
    if (isInsideOAuthFlow) {
      redirectTo = `${redirectUrlBase}/authorize?auth_id=${searchParams.auth_id}${
        searchParams.token && `&token=${searchParams.token}`
      }`
    } else {
      const { returnTo } = router.query
      const basePath = returnTo || '/sign-in'
      const fullPath = buildPathWithParams(basePath as string)
      const fullRedirectUrl = `${redirectUrlBase}${fullPath}`
      redirectTo = fullRedirectUrl
    }

    signup({
      email: values.email,
      password: values.password,
      hcaptchaToken: token ?? null,
      redirectTo,
    })
  }

  const password = form.watch('password')
  const confirmPassword = form.watch('confirmPassword')
  const isSubmitting = form.formState.isSubmitting || isSigningUp

  // Real-time password matching validation
  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      form.setError('confirmPassword', { message: 'Passwords do not match' })
    } else if (confirmPassword && password === confirmPassword) {
      form.clearErrors('confirmPassword')
    }
  }, [password, confirmPassword, form])

  return (
    <div className="relative">
      {/* Success State */}
      {isSubmitted && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="absolute top-0 w-full z-10"
        >
          <Alert_Shadcn_ variant="default" className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle_Shadcn_ className="text-green-900 dark:text-green-100">
              Check your email to confirm
            </AlertTitle_Shadcn_>
            <AlertDescription_Shadcn_ className="text-xs text-green-800 dark:text-green-200">
              You've successfully signed up! Please check your email to confirm your account before
              signing in to the dashboard. The confirmation link expires in 10 minutes.
              <br />
              <span className="text-green-700 dark:text-green-300 font-medium mt-2 block">
                Redirecting to sign in...
              </span>
            </AlertDescription_Shadcn_>
          </Alert_Shadcn_>
        </motion.div>
      )}

      {/* Error State */}
      {apiError && !isSubmitted && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4"
        >
          <Alert_Shadcn_ variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle_Shadcn_>Error</AlertTitle_Shadcn_>
            <AlertDescription_Shadcn_ className="text-xs">
              {apiError}
            </AlertDescription_Shadcn_>
          </Alert_Shadcn_>
        </motion.div>
      )}

      {/* Form */}
      <div
        className={cn(
          'w-full transition-all duration-500',
          isSubmitted ? 'max-h-0 opacity-0 pointer-events-none overflow-hidden' : 'max-h-[2000px] opacity-100'
        )}
      >
        <Form_Shadcn_ {...form}>
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            {/* Email Field */}
            <FormField_Shadcn_
              name="email"
              control={form.control}
              render={({ field }) => (
                <FormItemLayout
                  name="email"
                  label="Email"
                  isReactForm
                  className="gap-1"
                >
                  <FormControl_Shadcn_>
                    <Input_Shadcn_
                      id="email"
                      type="email"
                      autoComplete="email"
                      disabled={isSubmitting}
                      placeholder="you@example.com"
                      aria-required="true"
                      aria-invalid={!!form.formState.errors.email}
                      aria-describedby={form.formState.errors.email ? 'email-error' : undefined}
                      {...field}
                    />
                  </FormControl_Shadcn_>
                </FormItemLayout>
              )}
            />

            {/* First Name & Last Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField_Shadcn_
                name="firstName"
                control={form.control}
                render={({ field }) => (
                  <FormItemLayout
                    name="firstName"
                    label="First Name"
                    isReactForm
                    className="gap-1"
                  >
                    <FormControl_Shadcn_>
                      <Input_Shadcn_
                        id="firstName"
                        autoComplete="given-name"
                        disabled={isSubmitting}
                        placeholder="John"
                        aria-required="true"
                        aria-invalid={!!form.formState.errors.firstName}
                        {...field}
                      />
                    </FormControl_Shadcn_>
                  </FormItemLayout>
                )}
              />

              <FormField_Shadcn_
                name="lastName"
                control={form.control}
                render={({ field }) => (
                  <FormItemLayout
                    name="lastName"
                    label="Last Name"
                    isReactForm
                    className="gap-1"
                  >
                    <FormControl_Shadcn_>
                      <Input_Shadcn_
                        id="lastName"
                        autoComplete="family-name"
                        disabled={isSubmitting}
                        placeholder="Doe"
                        aria-required="true"
                        aria-invalid={!!form.formState.errors.lastName}
                        {...field}
                      />
                    </FormControl_Shadcn_>
                  </FormItemLayout>
                )}
              />
            </div>

            {/* Username (Optional) */}
            <FormField_Shadcn_
              name="username"
              control={form.control}
              render={({ field }) => (
                <FormItemLayout
                  name="username"
                  label="Username (Optional)"
                  isReactForm
                  className="gap-1"
                >
                  <FormControl_Shadcn_>
                    <Input_Shadcn_
                      id="username"
                      autoComplete="username"
                      disabled={isSubmitting}
                      placeholder="johndoe"
                      aria-invalid={!!form.formState.errors.username}
                      {...field}
                    />
                  </FormControl_Shadcn_>
                </FormItemLayout>
              )}
            />

            {/* Password Field */}
            <FormField_Shadcn_
              name="password"
              control={form.control}
              render={({ field }) => (
                <FormItemLayout
                  name="password"
                  label="Password"
                  isReactForm
                  className="gap-1"
                >
                  <FormControl_Shadcn_>
                    <div className="relative">
                      <Input_Shadcn_
                        id="password"
                        type={passwordHidden ? 'password' : 'text'}
                        autoComplete="new-password"
                        placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                        disabled={isSubmitting}
                        aria-required="true"
                        aria-invalid={!!form.formState.errors.password}
                        aria-describedby="password-strength"
                        onFocus={() => setShowPasswordConditions(true)}
                        {...field}
                      />
                      <Button
                        type="default"
                        title={passwordHidden ? 'Show password' : 'Hide password'}
                        aria-label={passwordHidden ? 'Show password' : 'Hide password'}
                        className="absolute right-1 top-1 px-1.5"
                        icon={passwordHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        disabled={isSubmitting}
                        onClick={() => setPasswordHidden((prev) => !prev)}
                      />
                    </div>
                  </FormControl_Shadcn_>
                </FormItemLayout>
              )}
            />

            {/* Password Strength Indicator */}
            <div
              id="password-strength"
              className={cn(
                'transition-all duration-400 overflow-hidden',
                showPasswordConditions ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
              )}
              aria-live="polite"
            >
              <PasswordStrengthIndicator password={password} />
            </div>

            {/* Confirm Password Field */}
            <FormField_Shadcn_
              name="confirmPassword"
              control={form.control}
              render={({ field }) => (
                <FormItemLayout
                  name="confirmPassword"
                  label="Confirm Password"
                  isReactForm
                  className="gap-1"
                >
                  <FormControl_Shadcn_>
                    <div className="relative">
                      <Input_Shadcn_
                        id="confirmPassword"
                        type={confirmPasswordHidden ? 'password' : 'text'}
                        autoComplete="new-password"
                        placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                        disabled={isSubmitting}
                        aria-required="true"
                        aria-invalid={!!form.formState.errors.confirmPassword}
                        {...field}
                      />
                      <Button
                        type="default"
                        title={confirmPasswordHidden ? 'Show password' : 'Hide password'}
                        aria-label={confirmPasswordHidden ? 'Show password' : 'Hide password'}
                        className="absolute right-1 top-1 px-1.5"
                        icon={confirmPasswordHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        disabled={isSubmitting}
                        onClick={() => setConfirmPasswordHidden((prev) => !prev)}
                      />
                    </div>
                  </FormControl_Shadcn_>
                </FormItemLayout>
              )}
            />

            {/* Terms and Conditions */}
            <FormField_Shadcn_
              name="acceptTerms"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-start space-x-2">
                  <Checkbox_Shadcn_
                    id="acceptTerms"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isSubmitting}
                    aria-required="true"
                    aria-invalid={!!form.formState.errors.acceptTerms}
                  />
                  <label
                    htmlFor="acceptTerms"
                    className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I accept the{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:text-brand-700 underline font-medium"
                    >
                      Terms and Conditions
                    </a>{' '}
                    and{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:text-brand-700 underline font-medium"
                    >
                      Privacy Policy
                    </a>
                  </label>
                </div>
              )}
            />

            {/* HCaptcha */}
            <div className="self-center">
              <HCaptcha
                ref={captchaRef}
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
                size="invisible"
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
              />
            </div>

            {/* Submit Button */}
            <Button
              block
              form={formId}
              htmlType="submit"
              size="large"
              disabled={!form.formState.isValid || isSubmitting || !form.watch('acceptTerms')}
              loading={isSubmitting}
              className="mt-2"
            >
              {isSubmitting ? 'Creating Account...' : 'Sign Up'}
            </Button>

            {/* Sign In Link */}
            <div className="text-center text-sm text-foreground-lighter">
              Already have an account?{' '}
              <a
                href="/sign-in"
                className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                Sign In
              </a>
            </div>
          </form>
        </Form_Shadcn_>
      </div>
    </div>
  )
}
