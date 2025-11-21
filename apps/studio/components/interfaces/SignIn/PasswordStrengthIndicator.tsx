import { Check, Circle } from 'lucide-react'
import { cn } from 'ui'

export type PasswordStrength = 'weak' | 'medium' | 'strong'

export type PasswordStrengthIndicatorProps = {
  password: string
}

const PasswordStrengthIndicator = ({ password }: PasswordStrengthIndicatorProps) => {
  // Password validation checks
  const isEightCharactersLong = password.length >= 8
  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecialCharacter = /[!@#$%^&*()_+\-=\[\]{};`':"\\|,.<>\/?]/.test(password)
  const isTooLong = password.length > 72

  // Calculate password strength
  const metConditions = [
    isEightCharactersLong,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialCharacter,
  ].filter(Boolean).length

  let strength: PasswordStrength = 'weak'
  let strengthColor = 'text-red-600 dark:text-red-400'
  let strengthBgColor = 'bg-red-500'
  let strengthText = 'Weak'

  if (metConditions >= 5) {
    strength = 'strong'
    strengthColor = 'text-green-600 dark:text-green-400'
    strengthBgColor = 'bg-green-500'
    strengthText = 'Strong'
  } else if (metConditions >= 3) {
    strength = 'medium'
    strengthColor = 'text-yellow-600 dark:text-yellow-400'
    strengthBgColor = 'bg-yellow-500'
    strengthText = 'Medium'
  }

  // Calculate progress percentage
  const progressPercentage = (metConditions / 5) * 100

  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-atomic="true">
      {/* Strength Bar and Label */}
      {password.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground-light">Password Strength</span>
            <span className={cn('text-xs font-semibold', strengthColor)}>
              {strengthText}
            </span>
          </div>
          <div className="h-2 w-full bg-surface-300 dark:bg-surface-75 rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-all duration-300 ease-out', strengthBgColor)}
              style={{ width: `${progressPercentage}%` }}
              role="progressbar"
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Password strength: ${strengthText}`}
            />
          </div>
        </div>
      )}

      {/* Password Requirements Checklist */}
      <div className="space-y-1.5" role="list">
        <PasswordCondition
          title="8 characters or more"
          isMet={isEightCharactersLong}
          isRequired
        />
        <PasswordCondition
          title="Uppercase letter (A-Z)"
          isMet={hasUppercase}
          isRequired
        />
        <PasswordCondition
          title="Lowercase letter (a-z)"
          isMet={hasLowercase}
          isRequired
        />
        <PasswordCondition
          title="Number (0-9)"
          isMet={hasNumber}
          isRequired
        />
        <PasswordCondition
          title="Special character (!@#$%^&*)"
          isMet={hasSpecialCharacter}
          isRequired
        />
        {isTooLong && (
          <PasswordCondition
            title="72 characters or less"
            isMet={!isTooLong}
            isRequired
          />
        )}
      </div>
    </div>
  )
}

export default PasswordStrengthIndicator

type PasswordConditionProps = {
  title: string
  isMet: boolean
  isRequired?: boolean
}

const PasswordCondition = ({ title, isMet, isRequired = false }: PasswordConditionProps) => {
  return (
    <div
      className={cn(
        'flex items-center gap-2 transition-all duration-200',
        isMet
          ? 'text-foreground'
          : 'text-foreground-lighter'
      )}
      role="listitem"
    >
      <div
        className={cn(
          'flex items-center justify-center transition-all duration-200',
          isMet ? 'text-green-600 dark:text-green-400' : 'text-surface-400'
        )}
        aria-hidden="true"
      >
        {isMet ? (
          <Check className="h-4 w-4" strokeWidth={2.5} />
        ) : (
          <Circle className="h-4 w-4" strokeWidth={2} />
        )}
      </div>

      <p className="text-sm">
        {title}
        {isRequired && !isMet && (
          <span className="sr-only"> (required)</span>
        )}
        {isMet && <span className="sr-only"> (satisfied)</span>}
      </p>
    </div>
  )
}
