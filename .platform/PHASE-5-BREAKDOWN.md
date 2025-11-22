# Phase 5: Visual Workflow Builder - Implementation Timeline
**Date**: November 22, 2025
**Project Manager**: Dylan Torres
**Lead Developer**: Marcus Thompson
**Timeline**: 2 weeks MVP, 4 weeks production-ready

---

## Executive Summary

**Goal**: Build BuildShip-style visual API endpoint builder using ReactFlow

**Deliverables**:
- Visual workflow editor (drag-drop nodes)
- 5 custom node types (trigger, database, transform, validate, response)
- Real-time code generation (Flow → TypeScript)
- Test panel for endpoint validation
- Deploy functionality (create live endpoints)

**Success Criteria**:
- User can create a functional API endpoint without writing code
- Generated code is production-ready (type-safe, validated)
- MVP ships in 2 weeks

---

## Week 1: Foundation & Basic Flow Editor

### Day 1: Project Setup (8 hours)

**Tasks**:
1. Install dependencies
   ```bash
   npm install @xyflow/react zustand @monaco-editor/react
   npm install -D @types/react-flow
   ```

2. Create directory structure
   ```
   app/editor/
   ├── page.tsx
   ├── flow-builder.tsx
   ├── components/
   │   ├── nodes/
   │   ├── sidebar/
   │   ├── preview/
   │   └── toolbar/
   └── lib/
       ├── flow-store.ts
       ├── code-generator.ts
       └── node-templates.ts
   ```

3. Setup Zustand store (basic structure)
   - State: `nodes`, `edges`, `selectedNode`
   - Actions: `addNode`, `updateNode`, `deleteNode`

4. Create basic Next.js page with lazy-loaded ReactFlow

**Deliverable**: Empty ReactFlow canvas renders in browser

**Assignee**: Frontend Developer
**Status**: ⏳ Not Started

---

### Day 2-3: Custom Node Types (16 hours)

**Tasks**:

#### Day 2: Trigger & Response Nodes (8 hours)

1. **TriggerNode** (4 hours)
   - Visual design (icon, color, layout)
   - Configuration: HTTP method (GET/POST/PUT/DELETE), path
   - Handles: Output only (source handle)
   - Validation: Path must be unique

2. **ResponseNode** (4 hours)
   - Visual design
   - Configuration: Response format (JSON/XML), status code
   - Handles: Input only (target handle)
   - Preview: Show example response

#### Day 3: Database & Transform Nodes (8 hours)

3. **DatabaseNode** (4 hours)
   - Visual design (database icon)
   - Configuration: Table name, query (WHERE clause), limit
   - Handles: Input and output
   - Validation: Table must exist, query syntax

4. **TransformNode** (4 hours)
   - Visual design (code icon)
   - Configuration: JavaScript/TypeScript code snippet
   - Monaco editor inline (mini editor)
   - Handles: Input and output

**Deliverable**: 4 custom node types draggable from palette

**Assignee**: Frontend Developer
**Status**: ⏳ Not Started

---

### Day 4: ValidateNode & Node Palette (8 hours)

**Tasks**:

1. **ValidateNode** (4 hours)
   - Visual design (shield icon)
   - Configuration: Zod schema builder (form-based)
   - Example: `{ "email": "string", "age": "number" }`
   - Handles: Input and output

2. **NodePalette Sidebar** (4 hours)
   - Drag-drop interface
   - Node categories (Triggers, Data, Logic, Output)
   - Search/filter functionality
   - Node descriptions/tooltips

**Deliverable**: All 5 node types functional, draggable from sidebar

**Assignee**: Frontend Developer
**Status**: ⏳ Not Started

---

### Day 5: Connection Logic & Flow Validation (8 hours)

**Tasks**:

1. **Connection Rules** (3 hours)
   - Only compatible handles can connect
   - Trigger node: Must be first (no inputs)
   - Response node: Must be last (no outputs)
   - No cycles allowed (validate on connect)

2. **Flow Validation** (3 hours)
   - Check for required nodes (trigger, response)
   - Check for disconnected nodes
   - Check for cycles
   - Visual error indicators (red borders, error messages)

3. **Error Display** (2 hours)
   - Toast notifications for errors
   - Error panel below canvas
   - Highlight problematic nodes

**Deliverable**: Robust connection system with validation

**Assignee**: Frontend Developer
**Status**: ⏳ Not Started

---

## Week 2: Code Generation & Deployment

### Day 6-7: Code Generator (16 hours)

**Tasks**:

#### Day 6: Core Generator (8 hours)

1. **Template System** (4 hours)
   - Node type → code template mapping
   - Variable substitution
   - Import generation

2. **Execution Order** (2 hours)
   - Topological sort algorithm
   - Build dependency graph from edges
   - Handle parallel execution (future)

3. **Error Handling** (2 hours)
   - Wrap generated code in try-catch
   - Add logging statements
   - Return structured error responses

#### Day 7: Advanced Generation (8 hours)

4. **TypeScript Types** (3 hours)
   - Generate type definitions from Zod schemas
   - Infer types between nodes
   - Type-safe variable passing

5. **Code Optimization** (3 hours)
   - Remove unused variables
   - Simplify redundant logic
   - Format with Prettier

6. **Testing** (2 hours)
   - Unit tests for generator
   - Test all node type combinations
   - Edge case validation

**Deliverable**: Working code generator (Flow → TypeScript)

**Assignee**: Backend Developer
**Status**: ⏳ Not Started

---

### Day 8: Monaco Code Preview (8 hours)

**Tasks**:

1. **Monaco Integration** (3 hours)
   - Setup Monaco editor
   - TypeScript language support
   - Syntax highlighting, auto-formatting

2. **Real-Time Sync** (3 hours)
   - Generate code on every node change
   - Debounce for performance
   - Show loading state during generation

3. **Code Actions** (2 hours)
   - Copy to clipboard button
   - Download as .ts file
   - Open in VS Code (deep link)

**Deliverable**: Live code preview panel

**Assignee**: Frontend Developer
**Status**: ⏳ Not Started

---

### Day 9: Test Panel (8 hours)

**Tasks**:

1. **Request Builder** (3 hours)
   - JSON editor for request body
   - Headers configuration
   - Query parameters

2. **Test Execution** (3 hours)
   - Execute generated code in sandbox
   - Display response (formatted JSON)
   - Show execution time, status code

3. **Error Display** (2 hours)
   - Runtime error messages
   - Stack traces (formatted)
   - Debugging tips

**Deliverable**: Test panel for endpoint validation

**Assignee**: Full-Stack Developer
**Status**: ⏳ Not Started

---

### Day 10: Deployment System (8 hours)

**Tasks**:

1. **Deploy API Route** (3 hours)
   - `/api/deploy` endpoint
   - Write generated code to file system
   - Create API route dynamically

2. **Endpoint Management** (3 hours)
   - Save endpoint metadata to database
   - Generate unique endpoint IDs
   - Endpoint versioning (basic)

3. **Deployment UI** (2 hours)
   - Deploy button with confirmation
   - Show generated URL
   - Copy URL button
   - Test deployed endpoint

**Deliverable**: Working deployment system

**Assignee**: Backend Developer
**Status**: ⏳ Not Started

---

## Week 3-4: Polish & Production Features

### Week 3: Core Features

#### Days 11-12: Persistence & Auto-Save (16 hours)

**Tasks**:

1. **Save/Load Flows** (8 hours)
   - Save flow to database (`/api/flows`)
   - Load flow by ID
   - Flow list view
   - Recently edited flows

2. **Auto-Save** (4 hours)
   - Save draft to localStorage (Zustand persist)
   - Auto-save to backend every 30 seconds
   - Recovery from crashes

3. **Version History** (4 hours)
   - Basic versioning (save snapshots)
   - Compare versions (diff view)
   - Restore previous version

**Deliverable**: Persistent flows with auto-save

**Assignee**: Full-Stack Developer
**Status**: ⏳ Not Started

---

#### Days 13-14: UI Polish & Minimap (16 hours)

**Tasks**:

1. **Minimap** (2 hours)
   - Add ReactFlow MiniMap component
   - Custom node colors in minimap
   - Pan to clicked area

2. **Auto-Layout** (6 hours)
   - Install `elkjs` (graph layout library)
   - Implement auto-arrange button
   - Horizontal vs vertical layouts

3. **Visual Polish** (8 hours)
   - Improve node designs (shadows, borders, icons)
   - Add animations (node creation, connection)
   - Dark mode support
   - Responsive layout (mobile warning)

**Deliverable**: Polished, professional UI

**Assignee**: Frontend Developer
**Status**: ⏳ Not Started

---

### Week 4: Advanced Features & Testing

#### Days 15-16: Undo/Redo (16 hours)

**Tasks**:

1. **Zustand Middleware** (6 hours)
   - Implement undo/redo middleware
   - Track state history (last 50 actions)
   - Handle edge cases (undo after save)

2. **Keyboard Shortcuts** (4 hours)
   - Cmd/Ctrl+Z: Undo
   - Cmd/Ctrl+Shift+Z: Redo
   - Cmd/Ctrl+S: Save
   - Delete: Delete selected node
   - Cmd/Ctrl+C/V: Copy/paste nodes

3. **Visual Feedback** (6 hours)
   - Undo/redo buttons in toolbar
   - Show current action in status bar
   - Disable when no history available

**Deliverable**: Full undo/redo support

**Assignee**: Frontend Developer
**Status**: ⏳ Not Started

---

#### Days 17-18: Node Templates & Examples (16 hours)

**Tasks**:

1. **Template Library** (8 hours)
   - Pre-built workflows (CRUD API, Auth endpoint, Webhook)
   - Template browser UI
   - Insert template button
   - Customize after insertion

2. **Example Flows** (4 hours)
   - "Get started" tutorial flow
   - Sample database queries
   - Common transformation examples

3. **Documentation** (4 hours)
   - In-app help tooltips
   - Node documentation (click icon for docs)
   - Video tutorials (embedded)

**Deliverable**: Template library & documentation

**Assignee**: Full-Stack Developer
**Status**: ⏳ Not Started

---

#### Days 19-20: Testing & Bug Fixes (16 hours)

**Tasks**:

1. **Unit Tests** (6 hours)
   - Code generator tests (all node types)
   - Validation logic tests
   - Flow utilities tests (cycle detection, etc.)

2. **Integration Tests** (6 hours)
   - Flow creation end-to-end
   - Deployment flow
   - Save/load flows

3. **E2E Tests** (4 hours)
   - Playwright tests (critical paths)
   - Cross-browser testing
   - Performance testing (large flows)

4. **Bug Fixes** (buffer time)

**Deliverable**: Stable, tested application

**Assignee**: Full-Stack Developer + QA
**Status**: ⏳ Not Started

---

## Resource Allocation

### Team Structure (Recommended)

| Role | Allocation | Responsibilities |
|------|-----------|------------------|
| Frontend Developer | 100% (2 weeks) | ReactFlow integration, custom nodes, UI |
| Backend Developer | 50% (1 week) | Code generation, deployment API |
| Full-Stack Developer | 100% (2 weeks) | Integration, testing, polish |
| Designer | 20% (2-3 days) | Node designs, icons, UX review |
| QA Engineer | 50% (1 week) | Testing, bug validation |

**Total Effort**: ~6 person-weeks

---

## Risk Management

### High-Risk Areas 🔴

1. **Code Generation Complexity**
   - **Risk**: Templates don't cover all edge cases
   - **Mitigation**: Start with simple templates, iterate based on testing
   - **Contingency**: Manual code editing as fallback

2. **Performance with Large Flows**
   - **Risk**: 100+ nodes cause lag
   - **Mitigation**: Implement memoization, virtualization
   - **Contingency**: Warn users at 50+ nodes

### Medium-Risk Areas 🟡

3. **Undo/Redo State Management**
   - **Risk**: State history causes memory issues
   - **Mitigation**: Limit history to 50 actions
   - **Contingency**: Disable undo/redo for MVP (Phase 6)

4. **Deployment File System**
   - **Risk**: Concurrent deploys cause conflicts
   - **Mitigation**: Use unique IDs, atomic writes
   - **Contingency**: Queue deployment requests

### Low-Risk Areas 🟢

5. **ReactFlow Integration**
   - **Risk**: Library limitations
   - **Mitigation**: Library is mature, well-documented
   - **Confidence**: High (proven in production)

---

## Milestones & Checkpoints

### Week 1 Checkpoint (Day 5)
**Goal**: Basic flow editor functional

**Demo**:
- Create nodes (5 types)
- Connect nodes
- See validation errors

**Success Criteria**:
- ✅ All custom nodes render correctly
- ✅ Connections work (with validation)
- ✅ No console errors

---

### Week 2 Checkpoint (Day 10)
**Goal**: MVP complete

**Demo**:
- Create a workflow
- Generate code
- Deploy endpoint
- Test deployed endpoint

**Success Criteria**:
- ✅ Code generation works for all node types
- ✅ Deployment creates working endpoint
- ✅ Test panel validates functionality

---

### Week 3 Checkpoint (Day 15)
**Goal**: Core features complete

**Demo**:
- Save/load flows
- Auto-save recovery
- Minimap navigation
- Auto-layout

**Success Criteria**:
- ✅ Flows persist across sessions
- ✅ UI is polished and professional
- ✅ No data loss on crashes

---

### Week 4 Checkpoint (Day 20)
**Goal**: Production-ready

**Demo**:
- All features working
- Tests passing (95%+ coverage)
- Performance benchmarks met

**Success Criteria**:
- ✅ All critical tests pass
- ✅ No known P0/P1 bugs
- ✅ Documentation complete

---

## Dependencies & Blockers

### External Dependencies

1. **ReactFlow Library**
   - Status: ✅ Available
   - Version: @xyflow/react v12
   - License: MIT (no issues)

2. **Monaco Editor**
   - Status: ✅ Available
   - Version: @monaco-editor/react v4
   - License: MIT

3. **Backend API**
   - Status: ⚠️ Partially available
   - Blocker: `/api/flows` and `/api/deploy` need implementation
   - Owner: Backend team
   - ETA: Day 6

### Internal Dependencies

1. **Database Schema**
   - Tables: `flows`, `endpoints`
   - Status: ⚠️ Not created
   - Owner: Backend team
   - Blocker for: Save/load functionality (Day 11)

2. **Authentication**
   - Required for: Multi-user flows
   - Status: ✅ Available (existing auth system)
   - Integration: Day 11

---

## Success Metrics

### MVP Success (Week 2)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Node types | 5 | Count custom nodes |
| Code generation | 100% | All nodes generate valid code |
| Deployment | Works | Deploy creates accessible endpoint |
| Validation | Catches errors | No invalid flows deployable |

### Production Success (Week 4)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test coverage | 80%+ | Jest coverage report |
| Performance | <100ms | Code generation time |
| Bundle size | <500KB | Webpack analyzer |
| User testing | 5+ users | Internal beta |

---

## Alternative Timelines

### Aggressive (1 Week MVP)

**Scope Reduction**:
- ❌ Skip undo/redo
- ❌ Skip templates library
- ❌ Basic validation only
- ✅ 3 node types instead of 5

**Risk**: Higher technical debt, rushed code quality

**Recommendation**: ❌ Not advised (quality suffers)

---

### Conservative (6 Week MVP)

**Scope Addition**:
- ✅ Full test suite from day 1
- ✅ Multi-user collaboration
- ✅ Advanced validation (type inference)
- ✅ AI-powered node suggestions

**Risk**: Scope creep, delayed launch

**Recommendation**: ⚠️ Good for enterprise, overkill for MVP

---

### Recommended (2+4 Week)

**Phase 1 (2 weeks)**: MVP
- Basic editor
- 5 node types
- Code generation
- Deploy functionality

**Phase 2 (4 weeks)**: Production
- Polish UI
- Undo/redo
- Templates
- Testing

**Recommendation**: ✅ Best balance of speed and quality

---

## Post-Launch Plan (Phase 6)

### Month 2: Enhancements
- Advanced node types (10+ total)
- AI-powered suggestions (Vercel AI SDK)
- Workflow versioning (full history)
- Import/export flows (JSON)

### Month 3: Scale Features
- Real-time collaboration (Yjs + WebSockets)
- Team workflows (permissions)
- Marketplace (community templates)
- Analytics (usage tracking)

### Month 4: Enterprise
- SSO integration
- Audit logs
- Custom node plugins (SDK)
- On-premise deployment

---

## Budget Estimate

### Development Cost

| Phase | Effort | Rate | Total |
|-------|--------|------|-------|
| Week 1-2 (MVP) | 80 hours | $150/hr | $12,000 |
| Week 3-4 (Production) | 80 hours | $150/hr | $12,000 |
| QA & Testing | 20 hours | $100/hr | $2,000 |
| Design | 16 hours | $125/hr | $2,000 |
| **Total** | **196 hours** | - | **$28,000** |

### Infrastructure Cost (Monthly)

| Item | Cost |
|------|------|
| ReactFlow Pro (optional) | $0 (MIT version) |
| Hosting (Vercel) | $20 |
| Database (Supabase/Railway) | $25 |
| Monitoring (Sentry) | $26 |
| **Total** | **$71/month** |

**First Year Cost**: $28,000 (dev) + $852 (infra) = **$28,852**

---

## Decision Point

### ✅ Proceed with ReactFlow?

**Vote**: ✅ **YES**

**Reasoning**:
1. Achievable timeline (2 weeks MVP)
2. Proven technology (BuildShip uses it)
3. Cost-effective ($24K savings vs custom)
4. Low risk (stable library)
5. Excellent DX (TypeScript-first)

**Next Steps**:
1. Approve budget ($28K)
2. Assign team (frontend, backend, full-stack)
3. Kickoff meeting (Day 1, Week 1)
4. Sprint planning (break down tickets)

---

## Sources
1. [ReactFlow Documentation](https://reactflow.dev)
2. [BuildShip Platform](https://buildship.com/)
3. [Zustand State Management](https://docs.pmnd.rs/zustand)
4. [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
5. [Monaco Editor React](https://github.com/suren-atoyan/monaco-react)
6. [Project Estimation Best Practices](https://www.atlassian.com/agile/project-management/estimation)

---

**Document Owner**: Dylan Torres (TPM)
**Technical Lead**: Marcus Thompson
**Status**: ✅ Ready for Approval
**Last Updated**: November 22, 2025
