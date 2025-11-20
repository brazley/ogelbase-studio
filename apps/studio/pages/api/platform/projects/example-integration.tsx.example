/**
 * Example React Component for Project Creation
 *
 * This file demonstrates how to integrate the project creation API
 * into a Supabase Studio frontend component.
 *
 * NOTE: This is an example/reference implementation.
 * Adapt it to your actual UI framework and design system.
 */

import { useState } from 'react'
import { Button, Input, Form, Alert } from '@ui/components' // Example UI library

interface ProjectFormData {
  name: string
  organization_id: string
  database_host: string
  database_port: number
  database_name: string
  database_user: string
  database_password: string
  postgres_meta_url: string
  supabase_url: string
  ref?: string
}

interface ProjectCreationResponse {
  project: {
    id: string
    ref: string
    name: string
    slug: string
    organization_id: string
    database_host: string
    database_port: number
    database_name: string
    database_user: string
    database_password: string
    postgres_meta_url: string
    supabase_url: string
    status: string
    created_at: string
    updated_at: string
  }
  credentials: {
    id: string
    project_id: string
    anon_key: string
    service_role_key: string
    jwt_secret: string
    created_at: string
    updated_at: string
  }
}

export function CreateProjectForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<ProjectCreationResponse | null>(null)

  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    organization_id: '',
    database_host: 'localhost',
    database_port: 5432,
    database_name: '',
    database_user: 'postgres',
    database_password: '',
    postgres_meta_url: 'http://localhost:8085',
    supabase_url: 'http://localhost:8000',
    ref: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/platform/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          // Only include ref if provided
          ...(formData.ref && { ref: formData.ref }),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'Failed to create project')
      }

      const result: ProjectCreationResponse = await response.json()
      setSuccess(result)

      // Optionally redirect to the new project
      // router.push(`/project/${result.project.ref}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof ProjectFormData, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  if (success) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          <h3>Project created successfully!</h3>
          <p>Your project "{success.project.name}" is ready to use.</p>
        </Alert>

        <div className="rounded-lg border p-4 space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Project Details</h4>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500">Project ID:</dt>
              <dd className="font-mono">{success.project.id}</dd>

              <dt className="text-gray-500">Project Ref:</dt>
              <dd className="font-mono font-semibold">{success.project.ref}</dd>

              <dt className="text-gray-500">Status:</dt>
              <dd>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {success.project.status}
                </span>
              </dd>
            </dl>
          </div>

          <div>
            <h4 className="font-semibold mb-2">API Credentials</h4>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Anon Key</label>
                <input
                  type="text"
                  readOnly
                  value={success.credentials.anon_key}
                  className="w-full font-mono text-xs p-2 border rounded bg-gray-50"
                  onClick={(e) => e.currentTarget.select()}
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Service Role Key (Keep Secret!)
                </label>
                <input
                  type="password"
                  readOnly
                  value={success.credentials.service_role_key}
                  className="w-full font-mono text-xs p-2 border rounded bg-gray-50"
                  onClick={(e) => {
                    e.currentTarget.type = 'text'
                    e.currentTarget.select()
                  }}
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  JWT Secret (Keep Very Secret!)
                </label>
                <input
                  type="password"
                  readOnly
                  value={success.credentials.jwt_secret}
                  className="w-full font-mono text-xs p-2 border rounded bg-gray-50"
                  onClick={(e) => {
                    e.currentTarget.type = 'text'
                    e.currentTarget.select()
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                setSuccess(null)
                setFormData({
                  name: '',
                  organization_id: formData.organization_id, // Keep org ID
                  database_host: 'localhost',
                  database_port: 5432,
                  database_name: '',
                  database_user: 'postgres',
                  database_password: '',
                  postgres_meta_url: 'http://localhost:8085',
                  supabase_url: 'http://localhost:8000',
                  ref: '',
                })
              }}
            >
              Create Another Project
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold mb-2">Create New Project</h2>
        <p className="text-gray-600">
          Set up a new Supabase project with auto-generated credentials.
        </p>
      </div>

      {error && (
        <Alert variant="error">
          <strong>Error:</strong> {error}
        </Alert>
      )}

      <div className="space-y-4">
        {/* Project Information */}
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold">Project Information</h3>

          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="My Awesome Project"
              required
            />
          </div>

          <div>
            <label htmlFor="organization_id" className="block text-sm font-medium mb-1">
              Organization ID <span className="text-red-500">*</span>
            </label>
            <Input
              id="organization_id"
              type="text"
              value={formData.organization_id}
              onChange={(e) => handleChange('organization_id', e.target.value)}
              placeholder="550e8400-e29b-41d4-a716-446655440000"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              UUID of the organization this project belongs to
            </p>
          </div>

          <div>
            <label htmlFor="ref" className="block text-sm font-medium mb-1">
              Custom Project Ref (Optional)
            </label>
            <Input
              id="ref"
              type="text"
              value={formData.ref}
              onChange={(e) => handleChange('ref', e.target.value)}
              placeholder="my-custom-ref (auto-generated if empty)"
              pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to auto-generate. Must be lowercase alphanumeric with hyphens.
            </p>
          </div>
        </div>

        {/* Database Configuration */}
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold">Database Configuration</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="database_host" className="block text-sm font-medium mb-1">
                Database Host <span className="text-red-500">*</span>
              </label>
              <Input
                id="database_host"
                type="text"
                value={formData.database_host}
                onChange={(e) => handleChange('database_host', e.target.value)}
                placeholder="localhost"
                required
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="database_port" className="block text-sm font-medium mb-1">
                Database Port <span className="text-red-500">*</span>
              </label>
              <Input
                id="database_port"
                type="number"
                value={formData.database_port}
                onChange={(e) => handleChange('database_port', parseInt(e.target.value))}
                placeholder="5432"
                min="1"
                max="65535"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="database_name" className="block text-sm font-medium mb-1">
              Database Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="database_name"
              type="text"
              value={formData.database_name}
              onChange={(e) => handleChange('database_name', e.target.value)}
              placeholder="my_database"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="database_user" className="block text-sm font-medium mb-1">
                Database User <span className="text-red-500">*</span>
              </label>
              <Input
                id="database_user"
                type="text"
                value={formData.database_user}
                onChange={(e) => handleChange('database_user', e.target.value)}
                placeholder="postgres"
                required
              />
            </div>

            <div>
              <label htmlFor="database_password" className="block text-sm font-medium mb-1">
                Database Password <span className="text-red-500">*</span>
              </label>
              <Input
                id="database_password"
                type="password"
                value={formData.database_password}
                onChange={(e) => handleChange('database_password', e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>
        </div>

        {/* Service URLs */}
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold">Service URLs</h3>

          <div>
            <label htmlFor="postgres_meta_url" className="block text-sm font-medium mb-1">
              Postgres Meta URL <span className="text-red-500">*</span>
            </label>
            <Input
              id="postgres_meta_url"
              type="url"
              value={formData.postgres_meta_url}
              onChange={(e) => handleChange('postgres_meta_url', e.target.value)}
              placeholder="http://localhost:8085"
              required
            />
          </div>

          <div>
            <label htmlFor="supabase_url" className="block text-sm font-medium mb-1">
              Supabase API URL <span className="text-red-500">*</span>
            </label>
            <Input
              id="supabase_url"
              type="url"
              value={formData.supabase_url}
              onChange={(e) => handleChange('supabase_url', e.target.value)}
              placeholder="http://localhost:8000"
              required
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={loading} disabled={loading}>
          {loading ? 'Creating Project...' : 'Create Project'}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/**
 * Example usage in a Next.js page:
 *
 * // pages/new-project.tsx
 * import { CreateProjectForm } from '@/components/CreateProjectForm'
 *
 * export default function NewProjectPage() {
 *   return (
 *     <div className="container mx-auto py-8">
 *       <CreateProjectForm />
 *     </div>
 *   )
 * }
 */
