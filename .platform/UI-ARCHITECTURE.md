# Visual Workflow Builder: UI Architecture
**Date**: November 22, 2025
**Architect**: Marcus Thompson (React/TypeScript Lead)
**Tech Stack**: ReactFlow + Next.js 14 + TypeScript + Tailwind

---

## Executive Summary

**Recommended Approach**: ReactFlow-based visual workflow builder with Monaco code preview

**Key Architectural Decisions**:
1. Client-side component with SSR disabled (ReactFlow requirement)
2. Zustand for state management (lightweight, React-friendly)
3. Real-time code generation using template system
4. Lazy-loaded editor to minimize bundle impact

---

## 1. Component Hierarchy

```
app/
├── editor/
│   ├── page.tsx                    # Server component (wrapper)
│   ├── flow-builder.tsx            # Client component (ReactFlow)
│   ├── components/
│   │   ├── nodes/
│   │   │   ├── DatabaseNode.tsx    # Custom node: Database source
│   │   │   ├── TransformNode.tsx   # Custom node: Data transformation
│   │   │   ├── ValidateNode.tsx    # Custom node: Validation logic
│   │   │   ├── ResponseNode.tsx    # Custom node: API response
│   │   │   └── TriggerNode.tsx     # Custom node: Workflow trigger
│   │   ├── sidebar/
│   │   │   ├── NodePalette.tsx     # Drag-drop node library
│   │   │   └── NodeConfig.tsx      # Selected node configuration
│   │   ├── preview/
│   │   │   ├── CodePreview.tsx     # Monaco editor (read-only)
│   │   │   └── TestPanel.tsx       # Test endpoint with sample data
│   │   └── toolbar/
│   │       ├── SaveButton.tsx      # Save flow to backend
│   │       ├── DeployButton.tsx    # Deploy endpoint
│   │       └── ExportButton.tsx    # Export as TypeScript file
│   └── lib/
│       ├── flow-store.ts           # Zustand store (app state)
│       ├── code-generator.ts       # Flow → TypeScript conversion
│       ├── validators.ts           # Flow validation logic
│       └── node-templates.ts       # Node type definitions
```

---

## 2. State Management Strategy

### Option Comparison

| Solution | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Zustand** | Lightweight (1KB), React hooks, simple API | Less features than Redux | ✅ Recommended |
| Redux Toolkit | Powerful, dev tools, time-travel | Heavy (20KB), boilerplate | ❌ Overkill |
| Jotai | Atomic state, React 18 optimized | Less mature | ⚠️ Alternative |
| Context API | Built-in, no deps | Performance issues, prop drilling | ❌ Not suitable |

**Decision**: Use Zustand for simplicity and performance.

### Zustand Store Architecture

```typescript
// lib/flow-store.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { Node, Edge } from '@xyflow/react'

export type FlowNode = Node<{
  type: 'database' | 'transform' | 'validate' | 'response' | 'trigger'
  config: Record<string, any>
  label: string
}>

interface FlowStore {
  // State
  nodes: FlowNode[]
  edges: Edge[]
  selectedNode: FlowNode | null
  generatedCode: string
  isDirty: boolean

  // Actions
  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: Edge[]) => void
  addNode: (node: FlowNode) => void
  updateNode: (id: string, data: Partial<FlowNode['data']>) => void
  deleteNode: (id: string) => void
  selectNode: (id: string | null) => void
  generateCode: () => void
  resetFlow: () => void

  // Async actions
  saveFlow: (name: string) => Promise<void>
  loadFlow: (id: string) => Promise<void>
  deployEndpoint: () => Promise<{ url: string }>
}

export const useFlowStore = create<FlowStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        nodes: [],
        edges: [],
        selectedNode: null,
        generatedCode: '',
        isDirty: false,

        // Actions implementation
        setNodes: (nodes) => set({ nodes, isDirty: true }),
        setEdges: (edges) => set({ edges, isDirty: true }),

        addNode: (node) => {
          const nodes = [...get().nodes, node]
          set({ nodes, isDirty: true })
          get().generateCode() // Auto-generate code on change
        },

        updateNode: (id, data) => {
          const nodes = get().nodes.map(node =>
            node.id === id
              ? { ...node, data: { ...node.data, ...data } }
              : node
          )
          set({ nodes, isDirty: true })
          get().generateCode()
        },

        deleteNode: (id) => {
          const nodes = get().nodes.filter(n => n.id !== id)
          const edges = get().edges.filter(e =>
            e.source !== id && e.target !== id
          )
          set({ nodes, edges, isDirty: true })
          get().generateCode()
        },

        selectNode: (id) => {
          const node = id ? get().nodes.find(n => n.id === id) : null
          set({ selectedNode: node })
        },

        generateCode: () => {
          const { nodes, edges } = get()
          const code = generateEndpointCode(nodes, edges)
          set({ generatedCode: code })
        },

        resetFlow: () => set({
          nodes: [],
          edges: [],
          selectedNode: null,
          generatedCode: '',
          isDirty: false
        }),

        saveFlow: async (name) => {
          const { nodes, edges } = get()
          await fetch('/api/flows', {
            method: 'POST',
            body: JSON.stringify({ name, nodes, edges })
          })
          set({ isDirty: false })
        },

        loadFlow: async (id) => {
          const res = await fetch(`/api/flows/${id}`)
          const { nodes, edges } = await res.json()
          set({ nodes, edges })
          get().generateCode()
        },

        deployEndpoint: async () => {
          const { generatedCode, nodes, edges } = get()
          const res = await fetch('/api/deploy', {
            method: 'POST',
            body: JSON.stringify({ code: generatedCode, nodes, edges })
          })
          return res.json()
        }
      }),
      { name: 'flow-storage' } // Persist to localStorage
    )
  )
)
```

**Why Zustand?**
1. **Simple API**: Easy to learn, matches React hooks patterns
2. **Performance**: Only re-renders components that use changed state
3. **DevTools**: Built-in Redux DevTools integration
4. **Persistence**: Auto-save to localStorage (draft recovery)
5. **No boilerplate**: Minimal code, maximum productivity

---

## 3. Code Generation Flow

### Architecture: Visual → TypeScript

```
[User Creates Flow]
       ↓
[ReactFlow State]
       ↓
[Validate Flow] ← Check for errors (cycles, missing configs)
       ↓
[Generate AST] ← Build abstract syntax tree
       ↓
[Template System] ← Apply node type templates
       ↓
[TypeScript Code]
       ↓
[Monaco Preview] ← Show generated code
       ↓
[Deploy API] ← Create endpoint
```

### Code Generator Implementation

```typescript
// lib/code-generator.ts
import { FlowNode } from './flow-store'
import { Edge } from '@xyflow/react'

interface GeneratedEndpoint {
  code: string
  imports: string[]
  errors: string[]
}

export function generateEndpointCode(
  nodes: FlowNode[],
  edges: Edge[]
): string {
  // 1. Validate flow
  const errors = validateFlow(nodes, edges)
  if (errors.length > 0) {
    return `// ❌ Flow has errors:\n${errors.map(e => `// - ${e}`).join('\n')}`
  }

  // 2. Build execution order (topological sort)
  const executionOrder = buildExecutionOrder(nodes, edges)

  // 3. Generate imports
  const imports = generateImports(nodes)

  // 4. Generate handler function
  const handler = generateHandler(executionOrder)

  // 5. Combine into final code
  return `${imports}\n\n${handler}`
}

function validateFlow(nodes: FlowNode[], edges: Edge[]): string[] {
  const errors: string[] = []

  // Check for trigger node (entry point)
  const triggerNodes = nodes.filter(n => n.data.type === 'trigger')
  if (triggerNodes.length === 0) {
    errors.push('Flow must have at least one trigger node')
  }
  if (triggerNodes.length > 1) {
    errors.push('Flow can only have one trigger node')
  }

  // Check for response node (exit point)
  const responseNodes = nodes.filter(n => n.data.type === 'response')
  if (responseNodes.length === 0) {
    errors.push('Flow must have at least one response node')
  }

  // Check for cycles
  if (hasCycle(nodes, edges)) {
    errors.push('Flow contains a cycle (infinite loop)')
  }

  // Check for disconnected nodes
  const disconnected = findDisconnectedNodes(nodes, edges)
  if (disconnected.length > 0) {
    errors.push(`Disconnected nodes: ${disconnected.map(n => n.data.label).join(', ')}`)
  }

  // Validate each node's configuration
  nodes.forEach(node => {
    const nodeErrors = validateNodeConfig(node)
    errors.push(...nodeErrors)
  })

  return errors
}

function buildExecutionOrder(nodes: FlowNode[], edges: Edge[]): FlowNode[] {
  // Topological sort to determine execution order
  const graph = buildDependencyGraph(nodes, edges)
  const sorted: FlowNode[] = []
  const visited = new Set<string>()

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const dependencies = graph[nodeId] || []
    dependencies.forEach(visit)

    const node = nodes.find(n => n.id === nodeId)
    if (node) sorted.push(node)
  }

  // Start from trigger node
  const trigger = nodes.find(n => n.data.type === 'trigger')
  if (trigger) visit(trigger.id)

  return sorted
}

function generateImports(nodes: FlowNode[]): string {
  const imports = new Set<string>()

  nodes.forEach(node => {
    switch (node.data.type) {
      case 'database':
        imports.add("import { db } from '@/lib/database'")
        imports.add("import { z } from 'zod'")
        break
      case 'transform':
        imports.add("import { transform } from '@/lib/utils'")
        break
      case 'validate':
        imports.add("import { z } from 'zod'")
        break
      case 'response':
        imports.add("import { NextResponse } from 'next/server'")
        break
    }
  })

  return Array.from(imports).join('\n')
}

function generateHandler(nodes: FlowNode[]): string {
  const steps = nodes.map((node, index) => {
    const stepName = `step${index + 1}`
    return generateNodeCode(node, stepName)
  }).join('\n\n  ')

  return `
export async function POST(request: Request) {
  try {
    // Extract request data
    const body = await request.json()

    // Execute workflow steps
    ${steps}

    // Return final result
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Workflow error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
`.trim()
}

function generateNodeCode(node: FlowNode, varName: string): string {
  switch (node.data.type) {
    case 'database':
      return generateDatabaseNode(node, varName)
    case 'transform':
      return generateTransformNode(node, varName)
    case 'validate':
      return generateValidateNode(node, varName)
    case 'response':
      return generateResponseNode(node, varName)
    default:
      return `// Unknown node type: ${node.data.type}`
  }
}

// Node-specific code generators
function generateDatabaseNode(node: FlowNode, varName: string): string {
  const { table, query } = node.data.config
  return `
    // ${node.data.label}
    const ${varName} = await db
      .selectFrom('${table}')
      .selectAll()
      ${query ? `.where(${query})` : ''}
      .execute()
  `.trim()
}

function generateTransformNode(node: FlowNode, varName: string): string {
  const { code } = node.data.config
  return `
    // ${node.data.label}
    const ${varName} = await (async (input) => {
      ${code}
    })(previousResult)
  `.trim()
}

function generateValidateNode(node: FlowNode, varName: string): string {
  const { schema } = node.data.config
  return `
    // ${node.data.label}
    const ${varName} = z.object(${JSON.stringify(schema, null, 2)}).parse(previousResult)
  `.trim()
}

function generateResponseNode(node: FlowNode, varName: string): string {
  const { format } = node.data.config
  return `
    // ${node.data.label}
    const result = previousResult
  `.trim()
}

// Utility functions
function hasCycle(nodes: FlowNode[], edges: Edge[]): boolean {
  // DFS cycle detection
  const graph = buildAdjacencyList(edges)
  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  function dfs(nodeId: string): boolean {
    visited.add(nodeId)
    recursionStack.add(nodeId)

    const neighbors = graph[nodeId] || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true
      } else if (recursionStack.has(neighbor)) {
        return true // Cycle detected
      }
    }

    recursionStack.delete(nodeId)
    return false
  }

  const trigger = nodes.find(n => n.data.type === 'trigger')
  return trigger ? dfs(trigger.id) : false
}

function findDisconnectedNodes(nodes: FlowNode[], edges: Edge[]): FlowNode[] {
  const connected = new Set<string>()
  edges.forEach(edge => {
    connected.add(edge.source)
    connected.add(edge.target)
  })

  return nodes.filter(node => !connected.has(node.id))
}

function validateNodeConfig(node: FlowNode): string[] {
  const errors: string[] = []

  switch (node.data.type) {
    case 'database':
      if (!node.data.config.table) {
        errors.push(`${node.data.label}: Missing table name`)
      }
      break
    case 'transform':
      if (!node.data.config.code) {
        errors.push(`${node.data.label}: Missing transformation code`)
      }
      break
    case 'validate':
      if (!node.data.config.schema) {
        errors.push(`${node.data.label}: Missing validation schema`)
      }
      break
  }

  return errors
}

function buildDependencyGraph(
  nodes: FlowNode[],
  edges: Edge[]
): Record<string, string[]> {
  const graph: Record<string, string[]> = {}

  edges.forEach(edge => {
    if (!graph[edge.target]) graph[edge.target] = []
    graph[edge.target].push(edge.source)
  })

  return graph
}

function buildAdjacencyList(edges: Edge[]): Record<string, string[]> {
  const graph: Record<string, string[]> = {}

  edges.forEach(edge => {
    if (!graph[edge.source]) graph[edge.source] = []
    graph[edge.source].push(edge.target)
  })

  return graph
}
```

**Code Generation Features**:
1. **Validation**: Checks for errors before generating code
2. **Topological Sort**: Determines correct execution order
3. **Template System**: Each node type has a code template
4. **Error Handling**: Wraps generated code in try-catch
5. **TypeScript Output**: Generates type-safe Next.js API routes

---

## 4. Real-Time Preview Architecture

### Two-Panel Layout

```
┌─────────────────────────────────┬─────────────────────────┐
│                                 │   Monaco Editor         │
│    ReactFlow Canvas             │   (Read-only)           │
│    (Visual Workflow)            │                         │
│                                 │   [Generated Code]      │
│                                 │                         │
│                                 ├─────────────────────────┤
│                                 │   Test Panel            │
│                                 │                         │
│                                 │   Request Body:         │
│                                 │   { "user": "test" }    │
│                                 │                         │
│                                 │   [Run Test] Button     │
│                                 │                         │
│                                 │   Response:             │
│                                 │   { "success": true }   │
└─────────────────────────────────┴─────────────────────────┘
```

### Implementation

```typescript
// components/preview/CodePreview.tsx
'use client'

import Editor from '@monaco-editor/react'
import { useFlowStore } from '@/lib/flow-store'

export function CodePreview() {
  const generatedCode = useFlowStore(state => state.generatedCode)

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-4 py-2 bg-gray-50">
        <h3 className="font-semibold">Generated Endpoint</h3>
      </div>

      <Editor
        height="100%"
        language="typescript"
        value={generatedCode}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: 'on',
          wordWrap: 'on'
        }}
      />
    </div>
  )
}
```

**Real-Time Sync**:
- Zustand store triggers `generateCode()` on every node change
- Monaco editor auto-updates when `generatedCode` state changes
- No manual refresh needed

---

## 5. Custom Node Types

### Node Type Definitions

```typescript
// lib/node-templates.ts
import { NodeTypes } from '@xyflow/react'
import { DatabaseNode } from '@/components/nodes/DatabaseNode'
import { TransformNode } from '@/components/nodes/TransformNode'
import { ValidateNode } from '@/components/nodes/ValidateNode'
import { ResponseNode } from '@/components/nodes/ResponseNode'
import { TriggerNode } from '@/components/nodes/TriggerNode'

export const customNodeTypes: NodeTypes = {
  database: DatabaseNode,
  transform: TransformNode,
  validate: ValidateNode,
  response: ResponseNode,
  trigger: TriggerNode,
}

// Node configuration schemas
export interface DatabaseNodeData {
  type: 'database'
  label: string
  config: {
    table: string
    query?: string
    limit?: number
  }
}

export interface TransformNodeData {
  type: 'transform'
  label: string
  config: {
    code: string
  }
}

export interface ValidateNodeData {
  type: 'validate'
  label: string
  config: {
    schema: Record<string, any>
  }
}

export interface ResponseNodeData {
  type: 'response'
  label: string
  config: {
    format: 'json' | 'xml'
    statusCode?: number
  }
}

export interface TriggerNodeData {
  type: 'trigger'
  label: string
  config: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    path: string
  }
}
```

### Example Custom Node

```typescript
// components/nodes/DatabaseNode.tsx
import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Database } from 'lucide-react'
import { useFlowStore } from '@/lib/flow-store'

export const DatabaseNode = memo(({ id, data }: NodeProps) => {
  const updateNode = useFlowStore(state => state.updateNode)
  const selectNode = useFlowStore(state => state.selectNode)

  return (
    <div
      className="rounded-lg border-2 border-blue-500 bg-white p-4 shadow-lg min-w-[200px]"
      onClick={() => selectNode(id)}
    >
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-5 h-5 text-blue-600" />
        <span className="font-semibold text-blue-600">
          {data.label || 'Database Query'}
        </span>
      </div>

      {/* Node Configuration */}
      <div className="space-y-2 text-sm">
        <div>
          <label className="text-gray-600">Table:</label>
          <input
            type="text"
            value={data.config.table || ''}
            onChange={(e) => updateNode(id, {
              config: { ...data.config, table: e.target.value }
            })}
            className="w-full border rounded px-2 py-1 mt-1"
            placeholder="users"
          />
        </div>

        <div>
          <label className="text-gray-600">Query:</label>
          <input
            type="text"
            value={data.config.query || ''}
            onChange={(e) => updateNode(id, {
              config: { ...data.config, query: e.target.value }
            })}
            className="w-full border rounded px-2 py-1 mt-1"
            placeholder="WHERE active = true"
          />
        </div>
      </div>

      {/* Handles (connection points) */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-blue-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-blue-500"
      />
    </div>
  )
})

DatabaseNode.displayName = 'DatabaseNode'
```

**Node Design Principles**:
1. **Self-contained**: Each node manages its own configuration
2. **Memoized**: Wrapped in `React.memo` for performance
3. **Visual feedback**: Clear icons and colors for each type
4. **Inline editing**: Edit config directly in the node (no separate modal)
5. **Type-safe**: Full TypeScript support

---

## 6. Integration Points

### Next.js API Route (Server-Side)

```typescript
// app/api/flows/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'

export async function POST(request: NextRequest) {
  const { name, nodes, edges } = await request.json()

  const flow = await db.flows.create({
    data: { name, nodes, edges }
  })

  return NextResponse.json(flow)
}

export async function GET() {
  const flows = await db.flows.findMany()
  return NextResponse.json(flows)
}
```

### Deployment Endpoint

```typescript
// app/api/deploy/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'

export async function POST(request: NextRequest) {
  const { code, nodes, edges } = await request.json()

  // Generate unique endpoint ID
  const endpointId = generateId()

  // Write generated code to file system
  const filePath = join(process.cwd(), 'app', 'api', 'generated', endpointId, 'route.ts')
  await writeFile(filePath, code)

  // Save metadata to database
  await db.endpoints.create({
    data: {
      id: endpointId,
      code,
      nodes,
      edges,
      url: `/api/generated/${endpointId}`
    }
  })

  return NextResponse.json({
    success: true,
    url: `/api/generated/${endpointId}`
  })
}
```

---

## 7. Performance Optimizations

### 1. Lazy Loading

```typescript
// app/editor/page.tsx
import dynamic from 'next/dynamic'

const FlowBuilder = dynamic(
  () => import('./flow-builder'),
  {
    ssr: false, // ReactFlow requires client-side
    loading: () => <FlowBuilderSkeleton />
  }
)
```

### 2. Node Memoization

```typescript
// Wrap all custom nodes in React.memo
export const DatabaseNode = memo((props: NodeProps) => {
  // Only re-renders when props change
  return <div>...</div>
})
```

### 3. Zustand Selectors

```typescript
// Only subscribe to specific state slices
const nodes = useFlowStore(state => state.nodes) // ✅ Efficient
const { nodes, edges } = useFlowStore() // ❌ Re-renders on any state change
```

### 4. Code Generation Debouncing

```typescript
// Debounce code generation to avoid excessive re-renders
import { debounce } from 'lodash'

const debouncedGenerate = debounce(() => {
  generateCode()
}, 300)
```

---

## 8. Testing Strategy

### Unit Tests

```typescript
// lib/__tests__/code-generator.test.ts
import { generateEndpointCode } from '../code-generator'

describe('Code Generator', () => {
  it('generates valid TypeScript for database node', () => {
    const nodes = [
      { id: '1', type: 'trigger', data: { config: { method: 'POST' } } },
      { id: '2', type: 'database', data: { config: { table: 'users' } } },
      { id: '3', type: 'response', data: { config: { format: 'json' } } }
    ]
    const edges = [
      { source: '1', target: '2' },
      { source: '2', target: '3' }
    ]

    const code = generateEndpointCode(nodes, edges)

    expect(code).toContain('db.selectFrom(\'users\')')
    expect(code).toContain('NextResponse.json')
  })

  it('detects cycles in flow', () => {
    const nodes = [/* ... */]
    const edges = [
      { source: '1', target: '2' },
      { source: '2', target: '1' } // Cycle!
    ]

    const code = generateEndpointCode(nodes, edges)

    expect(code).toContain('Flow contains a cycle')
  })
})
```

### Integration Tests

```typescript
// app/editor/__tests__/flow-builder.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlowBuilder } from '../flow-builder'

describe('FlowBuilder', () => {
  it('adds node when dragged from palette', async () => {
    render(<FlowBuilder />)

    const databaseNode = screen.getByText('Database')
    const canvas = screen.getByTestId('react-flow-canvas')

    await userEvent.dragAndDrop(databaseNode, canvas)

    expect(screen.getByText('Database Query')).toBeInTheDocument()
  })

  it('generates code when nodes are connected', async () => {
    render(<FlowBuilder />)

    // Add nodes and connect them
    // ...

    const codePreview = screen.getByTestId('code-preview')
    expect(codePreview).toContainHTML('db.selectFrom')
  })
})
```

### E2E Tests (Playwright)

```typescript
// e2e/editor.spec.ts
import { test, expect } from '@playwright/test'

test('complete workflow creation', async ({ page }) => {
  await page.goto('/editor')

  // Add trigger node
  await page.dragAndDrop('[data-node="trigger"]', '[data-reactflow]')

  // Add database node
  await page.dragAndDrop('[data-node="database"]', '[data-reactflow]')

  // Connect nodes
  await page.click('[data-handleid="trigger-source"]')
  await page.click('[data-handleid="database-target"]')

  // Verify code generation
  await expect(page.locator('[data-testid="code-preview"]')).toContainText('db.selectFrom')

  // Deploy endpoint
  await page.click('text=Deploy')
  await expect(page.locator('text=/api/generated/')).toBeVisible()
})
```

---

## 9. Accessibility Considerations

### Keyboard Navigation

```typescript
// components/flow-builder.tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  // Keyboard shortcuts
  deleteKeyCode="Delete"
  selectionKeyCode="Shift"
  multiSelectionKeyCode="Meta"
>
  {/* ... */}
</ReactFlow>
```

### ARIA Labels

```typescript
// components/nodes/DatabaseNode.tsx
<div
  role="treeitem"
  aria-label={`Database node: ${data.label}`}
  aria-describedby={`${id}-description`}
>
  <span id={`${id}-description`} className="sr-only">
    Fetches data from {data.config.table} table
  </span>
  {/* ... */}
</div>
```

### Focus Management

```typescript
// Ensure newly added nodes receive focus
const addNode = (node: FlowNode) => {
  const nodes = [...get().nodes, node]
  set({ nodes })

  // Focus new node
  setTimeout(() => {
    document.querySelector(`[data-id="${node.id}"]`)?.focus()
  }, 100)
}
```

---

## 10. Migration Path (Future Enhancements)

### Phase 5: MVP (Current Plan)
- Basic visual editor
- 5 custom node types
- Code generation
- Deploy to file system

### Phase 6: Advanced Features
- Undo/redo (via Zustand middleware)
- Node templates library
- AI-powered node suggestions
- Version control (Git integration)

### Phase 7: Collaboration
- Real-time multi-user editing (Yjs + WebSockets)
- Comments and annotations
- Team workflows

---

## Summary

**Recommended Architecture**:
- ✅ ReactFlow for visual canvas
- ✅ Zustand for state management
- ✅ Template-based code generation
- ✅ Monaco editor for code preview
- ✅ Lazy-loaded editor (performance)

**Timeline**: 2 weeks MVP achievable with this architecture.

**Next Steps**: See `PHASE-5-BREAKDOWN.md` for detailed implementation timeline.

---

## Sources
1. [ReactFlow Documentation](https://reactflow.dev)
2. [Zustand Documentation](https://docs.pmnd.rs/zustand)
3. [Next.js Dynamic Imports](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading)
4. [Monaco Editor React](https://github.com/suren-atoyan/monaco-react)
5. [BuildShip Visual Builder](https://buildship.com/)
