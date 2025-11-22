# .platform/ - Platform Vision & Architecture

**Purpose**: Long-term platform architecture, vision documents, and strategic planning

---

## 🎯 Quick Navigation

### ReactFlow Evaluation (New! ✨)
**Goal**: Evaluate ReactFlow for BuildShip-style visual API builder

| Document | Purpose | Key Finding |
|----------|---------|-------------|
| [REACTFLOW-EVALUATION.md](./REACTFLOW-EVALUATION.md) | Technical assessment | ✅ **Use ReactFlow** (9.05/10) |
| [UI-ARCHITECTURE.md](./UI-ARCHITECTURE.md) | Implementation architecture | Zustand + ReactFlow + Monaco |
| [PHASE-5-BREAKDOWN.md](./PHASE-5-BREAKDOWN.md) | Detailed timeline | 2 weeks MVP, 4 weeks production |

**Decision**: ✅ Proceed with ReactFlow (@xyflow/react v12)
**Budget**: $28,000 development + $71/month infrastructure
**Timeline**: 2 weeks MVP (Day 1-10), 4 weeks production-ready (Day 11-20)

---

## Directory Structure

```
.platform/
├── README.md                      # This file (index)
├── BUILDSHIP-VISION.md            # AI-native API builder roadmap
│
├── REACTFLOW-EVALUATION.md        # ReactFlow technical assessment ✨ NEW
├── UI-ARCHITECTURE.md             # Visual workflow builder architecture ✨ NEW
├── PHASE-5-BREAKDOWN.md           # Phase 5 implementation timeline ✨ NEW
│
├── ARCHITECTURE.md                # Overall platform architecture
├── PLATFORM_SPECIFICATION.md      # Technical specifications
├── QUICK_START.md                 # Getting started guide
└── STATUS.md                      # Current platform status
```

---

## What Goes Here

### Vision Documents
Long-term product vision and strategic direction:
- **BUILDSHIP-VISION.md**: AI-native API builder roadmap
- **REACTFLOW-EVALUATION.md**: Visual workflow builder technology decision ✨ NEW
- Future: Multi-region architecture
- Future: Enterprise features
- Future: Marketplace plans

### Architecture Briefs
High-level architectural plans (not implementation details):
- **UI-ARCHITECTURE.md**: Visual workflow builder design ✨ NEW
- **PHASE-5-BREAKDOWN.md**: Phase 5 detailed timeline ✨ NEW
- Platform evolution roadmaps
- Technology decisions
- Integration strategies
- Scaling plans

### NOT Included Here
- ❌ Current implementation (use `.SoT/platform-specs/`)
- ❌ Sprint planning (use `.SoT/sprints/`)
- ❌ Status updates (use `.SoT/status-reports/`)
- ❌ Migration files (use `apps/studio/database/migrations/`)

---

## How to Use

### When Planning New Features
1. Check if vision doc exists in `.platform/`
2. Reference it in sprint planning
3. Update vision doc as plans evolve

### When Making Architectural Decisions
1. Document decision rationale here
2. Link to from implementation tickets
3. Use as reference for future work

### When Evaluating Technologies
1. Create evaluation doc (e.g., `REACTFLOW-EVALUATION.md`) ✨ NEW
2. Compare alternatives with scoring matrix
3. Document decision rationale
4. Create architecture doc for approved approach

### Review Cadence
- **Monthly**: Review vision docs for relevance
- **Quarterly**: Update long-term roadmaps
- **Annually**: Major architectural revisions

---

## Current Documents

### BUILDSHIP-VISION.md
**Status**: Planning Phase
**Timeline**: 8 weeks to MVP
**Summary**: Evolution of Bun server primitive into AI-native API builder

**Key Points**:
- Built on proven Bun server foundation
- 4-phase implementation (HTTP API → Templates → AI → UI)
- Self-hosted BuildShip alternative
- ~$20/month vs $99/month per seat

**Next Action**: Phase 5 implementation (visual workflow builder)

---

### REACTFLOW-EVALUATION.md ✨ NEW
**Status**: ✅ Evaluation Complete
**Decision**: Use ReactFlow (@xyflow/react v12)
**Score**: 9.05/10 (Strong Recommendation)

**Key Findings**:
- Battle-tested (BuildShip, Stripe, Temporal use it)
- 2-week MVP achievable
- $24,000 savings vs custom solution
- MIT license (free, no restrictions)
- Excellent TypeScript support

**Alternatives Rejected**:
- ❌ Rete.js (steeper learning curve)
- ❌ JsPlumb Toolkit ($1,500/year, overkill)
- ❌ react-diagrams (less maintained)
- ❌ Custom canvas (6-8 weeks, $36K cost)
- ❌ Pure code editor (loses visual appeal)

**Next Action**: Approve budget ($28K) and assign team

---

### UI-ARCHITECTURE.md ✨ NEW
**Status**: ✅ Architecture Complete
**Tech Stack**: ReactFlow + Zustand + Monaco + Next.js 14

**Key Architectural Decisions**:
1. **State Management**: Zustand (lightweight, 1KB)
2. **Code Preview**: Monaco editor (VS Code engine)
3. **Code Generation**: Template system (node type → TypeScript)
4. **Performance**: Lazy loading, memoization, debouncing

**Component Hierarchy**:
```
Editor Page (Next.js)
├── ReactFlow Canvas (visual workflow)
├── Sidebar (node palette, configuration)
├── Monaco Editor (generated code preview)
└── Test Panel (test endpoint with sample data)
```

**Custom Node Types** (5 total):
- TriggerNode (HTTP endpoint)
- DatabaseNode (query database)
- TransformNode (JavaScript code)
- ValidateNode (Zod schema)
- ResponseNode (JSON/XML output)

**Next Action**: Begin Day 1 development (Week 1)

---

### PHASE-5-BREAKDOWN.md ✨ NEW
**Status**: ✅ Timeline Complete
**Duration**: 2 weeks MVP + 2 weeks polish (4 weeks total)

**Week 1**: Foundation (Day 1-5)
- Day 1: Project setup
- Day 2-3: Custom node types (trigger, database, transform, validate)
- Day 4: ValidateNode + node palette
- Day 5: Connection logic & validation

**Week 2**: Code Generation & Deployment (Day 6-10)
- Day 6-7: Code generator (templates, execution order)
- Day 8: Monaco code preview
- Day 9: Test panel
- Day 10: Deploy system

**Week 3**: Core Features (Day 11-15)
- Day 11-12: Save/load flows, auto-save
- Day 13-14: UI polish, minimap, auto-layout
- Day 15: Checkpoint

**Week 4**: Advanced Features & Testing (Day 16-20)
- Day 15-16: Undo/redo
- Day 17-18: Node templates library
- Day 19-20: Testing & bug fixes

**Budget**: $28,000 (196 hours total)
- Development: $24,000 (160 hours)
- QA/Testing: $2,000 (20 hours)
- Design: $2,000 (16 hours)

**Next Action**: Kickoff meeting (Week 1, Day 1)

---

## Relationship to .SoT/

**.platform/** = Long-term vision (where we're going)
**.SoT/** = Current reality (where we are)

**Examples**:
- `.platform/BUILDSHIP-VISION.md` → Vision for API builder
- `.platform/REACTFLOW-EVALUATION.md` → Technology decision (Phase 5)
- `.platform/UI-ARCHITECTURE.md` → Architecture design (Phase 5)
- `.SoT/platform-specs/BUN_SERVER.md` → Current Bun server implementation
- `.SoT/sprints/sprint-02/` → Sprint to build Phase 2
- `.SoT/sprints/sprint-05/` → Sprint to build Phase 5 (visual builder)

---

## Contributing

When adding new vision documents:
1. Use clear, descriptive filenames (ALL_CAPS.md)
2. Include timeline and owner
3. Link to related .SoT/ docs
4. Update this README

---

**Last Updated**: 2025-11-22
**Maintained By**: Platform Team + Dylan (TPM)
