# .platform/ - Platform Vision & Architecture

**Purpose**: Long-term platform architecture, vision documents, and strategic planning

---

## Directory Structure

```
.platform/
├── README.md                    # This file
├── BUILDSHIP-VISION.md          # API builder platform vision
└── [future architecture docs]
```

---

## What Goes Here

### Vision Documents
Long-term product vision and strategic direction:
- **BUILDSHIP-VISION.md**: AI-native API builder roadmap
- Future: Multi-region architecture
- Future: Enterprise features
- Future: Marketplace plans

### Architecture Briefs
High-level architectural plans (not implementation details):
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

**Next Action**: Create Sprint 2 for Phase 2 (HTTP API)

---

## Relationship to .SoT/

**.platform/** = Long-term vision (where we're going)
**.SoT/** = Current reality (where we are)

**Example**:
- `.platform/BUILDSHIP-VISION.md` → Vision for API builder
- `.SoT/platform-specs/BUN_SERVER.md` → Current Bun server implementation
- `.SoT/sprints/sprint-02/` → Sprint to build Phase 2

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
