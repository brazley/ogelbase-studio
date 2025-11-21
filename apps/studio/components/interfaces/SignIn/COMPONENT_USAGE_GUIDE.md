# SignUpForm - Component Usage Guide

A comprehensive guide for developers and designers working with the SignUpForm component.

---

## Quick Start

```tsx
import { SignUpForm } from 'components/interfaces/SignIn/SignUpForm'

export default function SignUpPage() {
  return (
    <div className="max-w-md mx-auto">
      <SignUpForm />
    </div>
  )
}
```

---

## Component API

### SignUpForm

The main form component with no required props. All configuration is handled internally.

```tsx
export const SignUpForm = () => {
  // Internal state management
  // Handles validation, submission, and error states
  // Integrates with platform authentication API
}
```

**Features:**
- Self-contained form logic
- Built-in validation with Zod
- HCaptcha integration
- Success/error state management
- Automatic redirect on success

---

## Form Fields

### 1. Email
- **Type:** Email input
- **Required:** Yes
- **Validation:**
  - Required field
  - Valid email format
  - Real-time format checking
- **Autocomplete:** `email`
- **Example:** `john.doe@example.com`

### 2. First Name
- **Type:** Text input
- **Required:** Yes
- **Validation:**
  - Required field
  - 1-50 characters
- **Autocomplete:** `given-name`
- **Example:** `John`

### 3. Last Name
- **Type:** Text input
- **Required:** Yes
- **Validation:**
  - Required field
  - 1-50 characters
- **Autocomplete:** `family-name`
- **Example:** `Doe`

### 4. Username (Optional)
- **Type:** Text input
- **Required:** No
- **Validation:**
  - 0-30 characters
  - Alphanumeric + hyphens + underscores only
  - Pattern: `/^[a-zA-Z0-9_-]+$/`
- **Autocomplete:** `username`
- **Example:** `johndoe` or `john-doe_2024`

### 5. Password
- **Type:** Password input (with visibility toggle)
- **Required:** Yes
- **Validation:**
  - 8-72 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character
- **Autocomplete:** `new-password`
- **Features:**
  - Show/hide toggle
  - Real-time strength indicator
  - Progressive disclosure of requirements

### 6. Confirm Password
- **Type:** Password input (with visibility toggle)
- **Required:** Yes
- **Validation:**
  - Must match password field
  - Real-time matching validation
- **Autocomplete:** `new-password`

### 7. Terms & Conditions
- **Type:** Checkbox
- **Required:** Yes
- **Validation:** Must be checked
- **Links:** Terms of Service, Privacy Policy

---

## Password Strength Indicator

### Strength Levels

#### Weak (Red)
- **Color:** `#DC2626` (red-600)
- **Criteria:** Less than 3 requirements met
- **Progress:** 0-40%
- **Example:** `password` (lowercase only)

#### Medium (Yellow)
- **Color:** `#EAB308` (yellow-600)
- **Criteria:** 3-4 requirements met
- **Progress:** 41-80%
- **Example:** `Password123` (missing special character)

#### Strong (Green)
- **Color:** `#059669` (green-600)
- **Criteria:** All 5 requirements met
- **Progress:** 81-100%
- **Example:** `MyP@ssw0rd123!`

### Requirements Checklist
1. ✅ 8 characters or more
2. ✅ Uppercase letter (A-Z)
3. ✅ Lowercase letter (a-z)
4. ✅ Number (0-9)
5. ✅ Special character (!@#$%^&*)

---

## Form States

### 1. Default (Empty)
```tsx
// Initial state - all fields empty
// Submit button disabled
```

**Visual:**
- All fields empty
- No validation errors shown
- Submit button disabled
- Password strength hidden

---

### 2. Filled (Valid)
```tsx
// All fields filled correctly
// Submit button enabled
```

**Visual:**
- All fields completed
- Green checkmarks on password requirements
- Submit button enabled
- No error messages

---

### 3. Validation Errors
```tsx
// User has entered invalid data
// Errors shown below fields
```

**Visual:**
- Red border on invalid fields
- Error icons next to messages
- Specific error text below each field
- Submit button disabled

**Common Errors:**
- "Must be a valid email"
- "First name cannot exceed 50 characters"
- "Username can only contain letters, numbers, hyphens, and underscores"
- "Password must contain at least 1 uppercase character"
- "Passwords do not match"
- "You must accept the terms and conditions"

---

### 4. Loading
```tsx
// Form submission in progress
// All inputs disabled
```

**Visual:**
- All fields disabled (grayed out)
- Submit button shows spinner
- Button text: "Creating Account..."
- Form not scrollable

---

### 5. API Error
```tsx
// Server returned an error
// Error alert shown at top
```

**Visual:**
- Red alert banner at top of form
- AlertCircle icon
- Specific error message
- Form remains editable
- Submit button enabled for retry

**Error Types:**
- **400:** "Please check your information and try again."
- **409:** "An account with this email already exists. Please sign in instead."
- **500:** "Server error. Please try again later."

---

### 6. Success
```tsx
// Account created successfully
// Showing confirmation message
```

**Visual:**
- Green success banner
- CheckCircle icon
- "Check your email to confirm" message
- Form fades out
- "Redirecting to sign in..." text
- Automatic redirect after 2 seconds

---

## Responsive Behavior

### Mobile (<768px)
```css
- Single column layout
- Name fields stack vertically
- Full-width inputs
- Touch-optimized (44px min height)
- Larger tap targets
```

### Tablet/Desktop (≥768px)
```css
- Name fields in 2-column grid
- Wider form container
- Standard input heights
- Mouse-optimized interactions
```

---

## Animation Timing

| Element | Duration | Easing | Trigger |
|---------|----------|--------|---------|
| Password strength bar | 300ms | ease-out | Password change |
| Field validation | 200ms | ease | Blur |
| Success alert | 500ms | ease | Submission success |
| Error alert | 300ms | ease | API error |
| Form fade out | 500ms | ease | Success state |
| Requirement check | 200ms | ease | Password change |

**Reduced Motion:**
All animations respect `prefers-reduced-motion: reduce` and reduce to <100ms.

---

## Color System

### Semantic Colors

#### Success States
```css
Background: bg-green-50 dark:bg-green-950
Border: border-green-500
Text: text-green-900 dark:text-green-100
Icon: text-green-600
```

#### Error States
```css
Background: bg-red-50 dark:bg-red-950
Border: border-red-500
Text: text-red-900 dark:text-red-100
Icon: text-red-600
```

#### Warning States
```css
Background: bg-yellow-50 dark:bg-yellow-950
Border: border-yellow-500
Text: text-yellow-900 dark:text-yellow-100
Icon: text-yellow-600
```

#### Interactive Elements
```css
Brand links: text-brand-600 hover:text-brand-700
Form labels: text-foreground
Helper text: text-foreground-lighter
Disabled: text-foreground-muted
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Tab** | Navigate to next field |
| **Shift + Tab** | Navigate to previous field |
| **Enter** | Submit form (when valid) |
| **Space** | Toggle checkbox |
| **Escape** | Clear current field (browser default) |

---

## Accessibility Features

### ARIA Attributes
```tsx
// Required fields
aria-required="true"

// Invalid fields
aria-invalid="true"
aria-describedby="field-error"

// Password strength
role="status"
aria-live="polite"
aria-atomic="true"

// Progress bar
role="progressbar"
aria-valuenow={percentage}
aria-valuemin={0}
aria-valuemax={100}
aria-label="Password strength: Strong"
```

### Screen Reader Announcements
- **Field focus:** "Email, required, edit text"
- **Error:** "Email, invalid, must be a valid email"
- **Password strength:** "Password strength: Medium"
- **Success:** "Check your email to confirm. Redirecting to sign in."

---

## Error Prevention

### Client-Side
1. **Email validation** - Format checked before submission
2. **Password strength** - Requirements shown proactively
3. **Password matching** - Real-time confirmation validation
4. **Character limits** - Enforced via maxLength
5. **Terms requirement** - Submit disabled until checked

### Server-Side
1. **Duplicate email** - Friendly message suggesting sign-in
2. **Validation errors** - Mapped to specific fields
3. **Rate limiting** - Generic retry message
4. **Server errors** - User-friendly explanation

---

## Integration Example

### Basic Usage
```tsx
import { SignUpForm } from 'components/interfaces/SignIn/SignUpForm'

function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Create Account</h1>
        <SignUpForm />
      </div>
    </div>
  )
}
```

### With Custom Wrapper
```tsx
import { SignUpForm } from 'components/interfaces/SignIn/SignUpForm'

function SignUpPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white dark:bg-surface-100 rounded-lg shadow-lg p-6">
          <div className="text-center mb-6">
            <img src="/logo.svg" alt="Logo" className="h-12 mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Join Us</h1>
            <p className="text-foreground-lighter mt-2">
              Create your account to get started
            </p>
          </div>
          <SignUpForm />
        </div>
      </div>
    </div>
  )
}
```

---

## Testing

### Unit Tests
```bash
npm test SignUpForm.test.tsx
```

### Storybook
```bash
npm run storybook
# Navigate to Authentication/SignUpForm
```

### Accessibility
```bash
npm run test:a11y
```

---

## Common Issues & Solutions

### Issue: Submit button won't enable
**Solution:** Ensure all required fields are filled and terms are checked

### Issue: Password strength not showing
**Solution:** Click/focus on password field to trigger display

### Issue: Passwords match but error shown
**Solution:** This is a timing issue - error clears after re-render

### Issue: Form not submitting on Enter
**Solution:** Ensure at least one field is focused and form is valid

---

## Performance Tips

### Optimization
- Form uses React Hook Form for optimal re-renders
- Validation only runs on blur (not every keystroke)
- Password strength calculation is memoized
- Debounced validation for username format check

### Bundle Size
- Component adds ~8KB gzipped
- Includes all validation logic
- No heavy dependencies

---

## Browser Support

| Browser | Minimum Version | Status |
|---------|----------------|--------|
| Chrome | 120+ | ✅ |
| Firefox | 120+ | ✅ |
| Safari | 17+ | ✅ |
| Edge | 120+ | ✅ |
| iOS Safari | 17+ | ✅ |
| Chrome Android | 120+ | ✅ |

---

## Design Tokens

### Spacing
```css
gap-4 (1rem) - Between form fields
gap-2 (0.5rem) - Between labels and inputs
gap-1 (0.25rem) - Tight spacing in indicators
p-4 (1rem) - Alert padding
px-1.5 (0.375rem) - Button icon padding
```

### Typography
```css
text-sm - Helper text, errors
text-base - Input text, labels
text-xs - Alert descriptions
text-2xl - Page headings (external)
```

### Border Radius
```css
rounded - Standard inputs (0.25rem)
rounded-lg - Alerts (0.5rem)
rounded-full - Progress bars (9999px)
```

---

## Related Components

### PasswordStrengthIndicator
- Standalone component
- Can be used elsewhere
- Props: `password: string`

### PasswordConditionsHelper (Legacy)
- Older version kept for compatibility
- Consider using PasswordStrengthIndicator instead

---

## Future Enhancements

### Planned
- Social sign-up buttons (Google, GitHub)
- Multi-step wizard option
- Email verification code input
- Password manager hints

### Under Consideration
- Profile photo upload during signup
- Organization creation flow
- Referral code field
- Newsletter subscription option

---

## Support

### Documentation
- [Accessibility Compliance](./ACCESSIBILITY_COMPLIANCE.md)
- [Completion Report](./TICKET-3-COMPLETION-REPORT.md)
- [Storybook](http://localhost:6006/?path=/story/authentication-signupform)

### Contact
**Component Owner:** Luna Rodriguez
**Team:** UI/UX Engineering
**Slack:** #ui-engineering

---

**Last Updated:** 2025-11-21
**Version:** 1.0.0
**Status:** Production Ready
