# BuildShip-Style API Builder - Platform Vision

**Status**: Planning Phase
**Timeline**: 6-8 weeks to MVP
**Owner**: Platform Team
**Last Updated**: 2025-11-22

---

## Executive Summary

Build an **AI-native, self-service API endpoint builder** using the Bun server primitive we've established. Think BuildShip, but self-hosted, TypeScript-native, and integrated with our Railway infrastructure.

**Current State**: Bun server with SSH access (proven working for migrations)
**Target State**: Visual + conversational interface for generating and deploying API endpoints on demand

---

## The Vision

### What We're Building

A platform where users (or AI agents) can:
1. **Describe** an API endpoint in natural language
2. **Generate** TypeScript code automatically
3. **Deploy** to production with one click
4. **Monitor** endpoint performance and usage

**Example User Flow:**
```
User: "Create a CRUD endpoint for managing team members"
↓
AI generates TypeScript code with validation, auth, database queries
↓
User reviews code in visual editor
↓
One-click deploy to production
↓
New endpoint live: POST /api/teams/:id/members
```

---

## Current Primitive (✅ Built)

### Bun Server Foundation

**What We Have:**
- Bun runtime on Railway
- SSH access for code execution
- Internal network access (postgres, redis, mongodb)
- Production-ready environment
- Successfully tested with Migration 008

**Location**: `/bun-migrations/`

**Proven Capabilities:**
- ✅ Execute arbitrary TypeScript
- ✅ Access Railway internal network
- ✅ Database operations (migrations, queries)
- ✅ Secure execution context
- ✅ Production deployment

**Key Insight**: This is the **execution layer** - we just need to add HTTP API, code generation, and UI layers.

---

## Architecture Evolution

### Phase 1: Current State (✅ Complete)

```
Developer → SSH → Bun Server → Execute Script → Return Result
```

**Use Cases:**
- Database migrations
- One-off operations
- Manual administrative tasks

**Status**: Production-ready

---

### Phase 2: HTTP API Layer (Weeks 1-2)

```typescript
// Add HTTP server to Bun
import { Hono } from 'hono'

const app = new Hono()

// Execute arbitrary code (authenticated)
app.post('/api/execute', async (c) => {
  const { code, context } = await c.req.json()

  // Validate user permissions
  // Execute in isolated VM
  // Return result

  return c.json({ result, executionTime, logs })
})

// Health monitoring
app.get('/api/health', (c) => c.json({
  status: 'ok',
  uptime,
  connections
}))
```

**Deliverables:**
- HTTP server (Hono/Elysia)
- Authentication middleware
- Code execution sandbox
- Logging & monitoring
- Rate limiting

**Use Cases:**
- Programmatic endpoint creation
- CLI tool integration
- CI/CD pipeline execution

**Timeline**: 2 weeks

---

### Phase 3: Template System (Weeks 3-4)

```typescript
// Create endpoint from template
POST /api/create-endpoint
{
  "template": "crud-endpoint",
  "config": {
    "resource": "projects",
    "table": "platform.projects",
    "permissions": {
      "read": ["member", "admin", "owner"],
      "create": ["admin", "owner"],
      "update": ["owner"],
      "delete": ["owner"]
    },
    "validation": {
      "name": "string",
      "description": "string?",
      "status": "enum('active','archived')"
    }
  }
}

→ AI generates:
  - TypeScript endpoint code
  - Zod validation schemas
  - Database queries with RLS
  - OpenAPI documentation
  - Tests

→ Returns:
{
  "endpointUrl": "/api/projects",
  "code": "...",
  "tests": "...",
  "docs": "..."
}
```

**Template Library:**
- CRUD endpoints
- Authentication flows
- Webhook handlers
- Background jobs
- File uploads
- Real-time subscriptions
- Analytics endpoints
- Integration connectors

**Deliverables:**
- Template engine
- Code generation framework
- Validation system
- Auto-generated tests
- OpenAPI spec generation

**Timeline**: 2 weeks

---

### Phase 4: AI Code Generation (Weeks 5-6)

```typescript
// Natural language → Code
POST /api/generate-endpoint
{
  "description": "Create an endpoint that fetches user's projects with their team members and recent activity",
  "context": {
    "userId": "current user",
    "orgId": "active organization"
  }
}

→ AI Agent:
  1. Analyzes database schema
  2. Determines required joins
  3. Generates optimized SQL
  4. Creates TypeScript handler
  5. Adds validation & auth
  6. Writes tests

→ Returns:
{
  "code": "generated TypeScript",
  "tests": "generated tests",
  "sql": "optimized queries",
  "explanation": "what the endpoint does"
}
```

**AI Capabilities:**
- Schema understanding
- Query optimization
- Security best practices
- Performance optimization
- Test generation
- Documentation generation

**Deliverables:**
- AI agent integration (Claude)
- Schema analyzer
- Code optimizer
- Security validator
- Performance predictor

**Timeline**: 2 weeks

---

### Phase 5: Visual UI (Weeks 7-8)

```
┌─────────────────────────────────────────┐
│   Node Frontend (AI-Native)             │
│                                         │
│   ┌───────────────────────────────┐   │
│   │  Chat Interface               │   │
│   │  "Create CRUD for projects"   │   │
│   │  → AI generates code          │   │
│   │  → Shows preview              │   │
│   │  → One-click deploy           │   │
│   └───────────────────────────────┘   │
│                                         │
│   ┌───────────────────────────────┐   │
│   │  Visual Builder               │   │
│   │  Drag & drop:                 │   │
│   │  • Data source                │   │
│   │  • Transformations            │   │
│   │  • Validation                 │   │
│   │  • Response format            │   │
│   └───────────────────────────────┘   │
│                                         │
│   ┌───────────────────────────────┐   │
│   │  Code Editor                  │   │
│   │  • TypeScript                 │   │
│   │  • Live preview               │   │
│   │  • Inline errors              │   │
│   │  • Git integration            │   │
│   └───────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Features:**
- Conversational interface (chat)
- Visual workflow builder (drag-drop)
- Code editor with IntelliSense
- Live preview & testing
- Deployment management
- Usage analytics
- Version control

**Tech Stack:**
- Next.js 14 (App Router)
- React Server Components
- Tailwind CSS
- Monaco Editor (VS Code)
- Vercel AI SDK
- tRPC for type-safe API

**Timeline**: 2 weeks MVP, 4 weeks production-ready

---

## Key Advantages Over BuildShip

### 1. Self-Hosted
- **BuildShip**: SaaS, vendor lock-in
- **Us**: Self-hosted on Railway, full control

### 2. TypeScript-Native
- **BuildShip**: Visual-only, limited code access
- **Us**: Full TypeScript, drop to code anytime

### 3. Internal Network Access
- **BuildShip**: External API calls only
- **Us**: Direct Railway internal network (postgres, redis, mongodb)

### 4. AI-Native from Day 1
- **BuildShip**: Added AI later, bolted on
- **Us**: Built around AI, conversational-first

### 5. Database Integration
- **BuildShip**: Limited database connectors
- **Us**: Native Postgres, full schema awareness, RLS integration

### 6. Cost
- **BuildShip**: $19-99/month per seat
- **Us**: Railway infrastructure costs only (~$20/month total)

---

## Technical Architecture

### Final Architecture (Phase 5)

```
┌─────────────────────────────────────────────────────────┐
│                   Node Frontend                         │
│            (React + Next.js + AI SDK)                   │
│                                                         │
│  Chat Interface  │  Visual Builder  │  Code Editor     │
└─────────────────────────────────────────────────────────┘
                           ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────┐
│              AI Generation Layer                        │
│                                                         │
│  Claude API → Code Gen → Validation → Optimization     │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│           Bun Execution Server (Current)                │
│                                                         │
│  • HTTP API (Hono)                                      │
│  • Code Execution (VM2 sandbox)                         │
│  • Template Engine                                      │
│  • Hot-reload Endpoints                                 │
│  • Monitoring & Logging                                 │
└─────────────────────────────────────────────────────────┘
                           ↓ Railway Private Network
┌─────────────────────────────────────────────────────────┐
│              Data Layer                                 │
│                                                         │
│  PostgreSQL  │  Redis  │  MongoDB  │  S3 Storage       │
└─────────────────────────────────────────────────────────┘
```

### Security Model

**Authentication:**
- JWT tokens for API access
- Session-based for UI
- API keys for CLI/programmatic access

**Authorization:**
- Role-based access control (RBAC)
- Organization-level isolation
- Endpoint-level permissions

**Code Execution:**
- Sandboxed VM (VM2 or isolated-vm)
- Resource limits (CPU, memory, time)
- Network restrictions
- File system isolation

**Data Security:**
- All queries use RLS
- User context propagation
- Audit logging for all operations
- Encrypted secrets management

---

## Implementation Roadmap

### Week 1-2: HTTP API Foundation
**Owner**: Jordan Kim (Full-Stack)

**Tasks:**
- [ ] Add Hono HTTP server to Bun
- [ ] Implement authentication middleware
- [ ] Create code execution sandbox
- [ ] Add logging & monitoring
- [ ] Deploy to Railway
- [ ] Write API documentation

**Deliverable**: `/api/execute` and `/api/health` endpoints working

---

### Week 3-4: Template System
**Owner**: Marcus Thompson (React/TS)

**Tasks:**
- [ ] Design template schema
- [ ] Build CRUD template
- [ ] Create code generation engine
- [ ] Add validation system
- [ ] Generate OpenAPI specs
- [ ] Write template docs

**Deliverable**: `/api/create-endpoint` working with 3 templates

---

### Week 5-6: AI Integration
**Owner**: AI/ML Team

**Tasks:**
- [ ] Integrate Claude API
- [ ] Build schema analyzer
- [ ] Create prompt templates
- [ ] Add code optimizer
- [ ] Implement security validator
- [ ] Write AI usage docs

**Deliverable**: `/api/generate-endpoint` with natural language

---

### Week 7-8: MVP Frontend
**Owner**: Frontend Team

**Tasks:**
- [ ] Next.js project setup
- [ ] Chat interface (Vercel AI SDK)
- [ ] Code editor (Monaco)
- [ ] Deploy preview
- [ ] Usage analytics
- [ ] User documentation

**Deliverable**: Working UI for endpoint creation & management

---

## Success Metrics

### Phase 2 (HTTP API)
- ✅ <50ms endpoint response time
- ✅ 99.9% uptime
- ✅ Support 100 concurrent executions

### Phase 3 (Templates)
- ✅ Generate valid code 100% of time
- ✅ All generated endpoints pass tests
- ✅ <5 second generation time

### Phase 4 (AI Generation)
- ✅ 90%+ accuracy on natural language
- ✅ Generated code passes linting
- ✅ Optimized queries (explain analyze)

### Phase 5 (Frontend)
- ✅ <1 second page load
- ✅ Real-time code preview
- ✅ Mobile-responsive UI

---

## Use Cases

### 1. Internal Tooling
```
"Create an admin endpoint to bulk-update user roles"
→ Generates authenticated endpoint
→ Validates permissions
→ Deploys in 30 seconds
```

### 2. Customer APIs
```
"Create a webhook receiver for Stripe events"
→ Generates validated endpoint
→ Handles signature verification
→ Stores events in database
```

### 3. Data Pipelines
```
"Create an endpoint that syncs HubSpot contacts to our database"
→ Generates ETL logic
→ Handles pagination
→ Schedules as cron job
```

### 4. Analytics
```
"Create an endpoint for user engagement metrics"
→ Generates optimized SQL
→ Caches results in Redis
→ Returns JSON with charts data
```

---

## Risks & Mitigations

### Risk 1: Code Execution Security
**Concern**: Arbitrary code execution is dangerous

**Mitigation**:
- VM2/isolated-vm sandboxing
- Strict resource limits
- Code review before deployment
- Audit logging

### Risk 2: AI Hallucinations
**Concern**: AI might generate broken code

**Mitigation**:
- TypeScript compilation check
- Automated tests
- User review before deploy
- Rollback mechanism

### Risk 3: Performance at Scale
**Concern**: Many dynamic endpoints could be slow

**Mitigation**:
- Endpoint caching
- Code optimization
- Query analysis
- Auto-scaling on Railway

### Risk 4: Cost Control
**Concern**: Unlimited endpoint creation could be expensive

**Mitigation**:
- Per-org endpoint limits
- Resource usage monitoring
- Cost attribution
- Auto-pause unused endpoints

---

## Next Steps

### Immediate (This Week)
1. **Review this brief** with team
2. **Validate architecture** with database specialists
3. **Create Phase 2 sprint** in `.SoT/sprints/sprint-02/`
4. **Assign owners** for each phase

### Short Term (Month 1)
1. Complete Phases 2-3 (HTTP API + Templates)
2. Demo to stakeholders
3. Gather feedback
4. Iterate on template library

### Medium Term (Month 2)
1. Complete Phase 4 (AI Integration)
2. Beta test with internal users
3. Build template marketplace
4. Documentation & tutorials

### Long Term (Month 3+)
1. Complete Phase 5 (Frontend)
2. Public beta launch
3. Community templates
4. Enterprise features

---

## Conclusion

The Bun server we built for migrations is **the perfect primitive** for a BuildShip-style platform. We have:

✅ Execution environment (Bun on Railway)
✅ Internal network access
✅ Production deployment
✅ Proven working (Migration 008)

We just need to add **3 layers**:
1. HTTP API (2 weeks)
2. Code generation (4 weeks)
3. Visual UI (2 weeks)

**Total timeline to MVP**: 8 weeks
**Total cost**: Railway infrastructure only (~$20/month)
**Total value**: Self-hosted BuildShip alternative worth $99/month per seat

---

**Status**: Ready to proceed with Phase 2 planning
**Next Action**: Create Sprint 2 tickets in `.SoT/sprints/sprint-02/`
**Owner**: Platform Team + Dylan (TPM)
