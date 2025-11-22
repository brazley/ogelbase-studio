/**
 * React Testing Utilities
 *
 * This file provides utilities for testing React components with proper context providers.
 * Based on existing test utilities but extended for the .tests/ directory.
 */

import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

/**
 * Create a new QueryClient for testing
 * Disables retries and caching for predictable tests
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  })
}

/**
 * Wrapper component with all required providers
 */
interface TestProvidersProps {
  children: React.ReactNode
  queryClient?: QueryClient
}

export function TestProviders({ children, queryClient }: TestProvidersProps) {
  const client = queryClient || createTestQueryClient()

  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  )
}

/**
 * Custom render function that includes all providers
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
}

export function customRender(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  const { queryClient, ...renderOptions } = options || {}

  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders queryClient={queryClient}>
        {children}
      </TestProviders>
    ),
    ...renderOptions,
  })
}

/**
 * Wait for element to be removed (useful for loading states)
 */
export { waitForElementToBeRemoved, waitFor, screen } from '@testing-library/react'

/**
 * User event utilities for realistic interactions
 */
export { default as userEvent } from '@testing-library/user-event'

/**
 * Helper to get text content from element
 */
export function getTextContent(element: HTMLElement): string {
  return element.textContent || ''
}

/**
 * Helper to check if element is visible
 */
export function isVisible(element: HTMLElement): boolean {
  return element.style.display !== 'none' &&
         element.style.visibility !== 'hidden' &&
         element.offsetParent !== null
}

/**
 * Helper to find element by test id with better error message
 */
export function getByTestId(container: HTMLElement, testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`)
  if (!element) {
    throw new Error(
      `Unable to find element with data-testid="${testId}". ` +
      `Available test IDs: ${Array.from(container.querySelectorAll('[data-testid]'))
        .map(el => el.getAttribute('data-testid'))
        .join(', ')}`
    )
  }
  return element as HTMLElement
}

/**
 * Helper to simulate API loading state
 */
export function createLoadingQuery<T>(data?: T) {
  return {
    data: undefined,
    error: null,
    isLoading: true,
    isError: false,
    isSuccess: false,
    status: 'loading' as const,
  }
}

/**
 * Helper to simulate API success state
 */
export function createSuccessQuery<T>(data: T) {
  return {
    data,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: true,
    status: 'success' as const,
  }
}

/**
 * Helper to simulate API error state
 */
export function createErrorQuery(error: Error) {
  return {
    data: undefined,
    error,
    isLoading: false,
    isError: true,
    isSuccess: false,
    status: 'error' as const,
  }
}

/**
 * Mock router push/replace functions
 */
export function createMockRouter(overrides?: any) {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
    ...overrides,
  }
}

/**
 * Helper to assert component renders without errors
 */
export function assertRenders(ui: ReactElement) {
  expect(() => customRender(ui)).not.toThrow()
}

/**
 * Helper to assert component matches snapshot
 */
export function assertMatchesSnapshot(ui: ReactElement) {
  const { container } = customRender(ui)
  expect(container.firstChild).toMatchSnapshot()
}

/**
 * Helper to debug component output
 */
export function debugComponent(ui: ReactElement) {
  const { debug } = customRender(ui)
  debug()
}

// Re-export everything from @testing-library/react for convenience
export * from '@testing-library/react'
