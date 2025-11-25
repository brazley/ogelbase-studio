import HCaptcha from '@hcaptcha/react-hcaptcha'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { type SubmitHandler, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import z from 'zod'

import {
  AlertDescription_Shadcn_,
  AlertTitle_Shadcn_,
  Alert_Shadcn_,
  Button,
  Checkbox_Shadcn_,
  Form_Shadcn_,
  FormControl_Shadcn_,
  FormField_Shadcn_,
  Input_Shadcn_,
  cn,
} from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import { gotrueClient } from 'common'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Must be a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
})

type FormValues = z.infer<typeof schema>

const formId = 'sign-in-form'

export const SignInForm = () => {
  const router = useRouter()
  const captchaRef = useRef<HCaptcha>(null)

  const [passwordHidden, setPasswordHidden] = useState(true)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
    mode: 'onBlur',
  })

  const isSubmitting = form.formState.isSubmitting

  // Rate limit countdown timer
  useEffect(() => {
    if (rateLimitSeconds && rateLimitSeconds > 0) {
      const interval = setInterval(() => {
        setRateLimitSeconds((prev) => {
          if (prev === null || prev <= 1) {
            setApiError(null)
            return null
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [rateLimitSeconds])

  const onSubmit: SubmitHandler<FormValues> = async ({ email, password, rememberMe }) => {
    setApiError(null)
    setRateLimitSeconds(null)

    // Get captcha token
    let token = captchaToken
    if (!token) {
      const captchaResponse = await captchaRef.current?.execute({ async: true })
      token = captchaResponse?.response ?? null
    }

    try {
      // Use GoTrue client for authentication
      const { data, error } = await gotrueClient.signInWithPassword({
        email,
        password,
      })

      if (error) {
        // Reset captcha on error
        setCaptchaToken(null)
        captchaRef.current?.resetCaptcha()

        // Map GoTrue errors to UI
        const errorMessage = error.message.toLowerCase()

        // Handle rate limiting
        if (error.status === 429 || errorMessage.includes('too many')) {
          const retryAfterMinutes = 15
          setRateLimitSeconds(retryAfterMinutes * 60)
          setApiError(`Too many sign-in attempts. Please try again in ${retryAfterMinutes} minutes.`)
          form.setError('email', { message: 'Too many attempts' })
          toast.error('Too many sign-in attempts. Please try again later.')
          return
        }

        // Handle invalid credentials
        if (error.status === 400 || errorMessage.includes('invalid') || errorMessage.includes('credentials')) {
          const message = 'Email or password is incorrect'
          setApiError(message)
          form.setError('email', { message: 'Invalid credentials' })
          form.setError('password', { message: 'Invalid credentials' })
          toast.error(message)
          return
        }

        // Handle email not confirmed
        if (errorMessage.includes('email not confirmed')) {
          setApiError('Please verify your email address before signing in.')
          toast.error('Email not confirmed. Please check your inbox.')
          return
        }

        // Generic error from GoTrue
        setApiError(error.message || 'Unable to sign in. Please try again.')
        toast.error(error.message || 'Unable to sign in.')
        return
      }

      // Success - GoTrue client handles token storage automatically
      toast.success('Signed in successfully!')

      // Redirect to dashboard or return URL
      const { returnTo } = router.query
      const redirectPath = (returnTo as string) || '/organizations'
      router.push(redirectPath)

    } catch (error) {
      console.error('[SignInForm] Unexpected error:', error)
      setApiError('Unable to sign in. Please try again.')
      toast.error('An unexpected error occurred.')

      setCaptchaToken(null)
      captchaRef.current?.resetCaptcha()
    }
  }

  // Format remaining time for rate limit countdown
  const formatRateLimitTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`
    }
    return `${seconds} second${seconds !== 1 ? 's' : ''}`
  }

  const forgotPasswordUrl = `/forgot-password${router.query.returnTo ? `?returnTo=${encodeURIComponent(router.query.returnTo as string)}` : ''}`

  return (
    <div className="relative">
      {/* Error State */}
      {apiError && (
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
              {rateLimitSeconds && rateLimitSeconds > 0 && (
                <span className="block mt-1 font-medium">
                  Try again in {formatRateLimitTime(rateLimitSeconds)}
                </span>
              )}
            </AlertDescription_Shadcn_>
          </Alert_Shadcn_>
        </motion.div>
      )}

      {/* Form */}
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
                    disabled={isSubmitting || !!rateLimitSeconds}
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

          {/* Password Field with Forgot Password Link */}
          <div className="relative">
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
                        autoComplete="current-password"
                        placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                        disabled={isSubmitting || !!rateLimitSeconds}
                        aria-required="true"
                        aria-invalid={!!form.formState.errors.password}
                        {...field}
                      />
                      <Button
                        type="default"
                        title={passwordHidden ? 'Show password' : 'Hide password'}
                        aria-label={passwordHidden ? 'Show password' : 'Hide password'}
                        className="absolute right-1 top-1 px-1.5"
                        icon={passwordHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        disabled={isSubmitting || !!rateLimitSeconds}
                        onClick={() => setPasswordHidden((prev) => !prev)}
                      />
                    </div>
                  </FormControl_Shadcn_>
                </FormItemLayout>
              )}
            />

            {/* Forgot Password Link - positioned absolutely for smooth tabbing */}
            <Link
              href={forgotPasswordUrl}
              className="absolute top-0 right-0 text-sm text-foreground-lighter hover:text-foreground transition-colors"
              tabIndex={isSubmitting ? -1 : 0}
            >
              Forgot Password?
            </Link>
          </div>

          {/* Remember Me Checkbox */}
          <FormField_Shadcn_
            name="rememberMe"
            control={form.control}
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Checkbox_Shadcn_
                  id="rememberMe"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isSubmitting || !!rateLimitSeconds}
                  aria-label="Remember me for 30 days"
                />
                <label
                  htmlFor="rememberMe"
                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Remember me for 30 days
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
            disabled={!form.formState.isValid || isSubmitting || !!rateLimitSeconds}
            loading={isSubmitting}
            className="mt-2"
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </Button>

          {/* Sign Up Link */}
          <div className="text-center text-sm text-foreground-lighter">
            Don't have an account?{' '}
            <a
              href="/sign-up"
              className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              Sign Up
            </a>
          </div>
        </form>
      </Form_Shadcn_>
    </div>
  )
}
