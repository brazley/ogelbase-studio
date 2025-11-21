# Exhaustive-Deps Cleanup Work Plan
**Project**: Supabase Studio - React Hooks Dependency Array Fixes
**TPM**: Dylan Torres
**Date**: November 21, 2025
**Branch**: main (production quality gates apply)

## Objective
Fix ALL remaining `react-hooks/exhaustive-deps` ESLint warnings across the codebase without introducing breaking changes.

## Scope
- **Total Files**: ~1,358 TypeScript/TSX files
- **Target Directories**: `lib/`, `state/`, `components/`
- **Hook Types**: `useEffect`, `useCallback`, `useMemo`

## Quality Requirements (Production Branch)
1. ✅ No breaking changes to existing functionality
2. ✅ Proper dependency arrays (no eslint-disable comments unless absolutely necessary)
3. ✅ Test reactivity after changes (especially in state management)
4. ✅ Document any intentional omissions with clear reasoning
5. ✅ Use `useLatest` or `useEvent` patterns where appropriate for stable references

## Team Assignments

### Task 1: State Management Directory (Marcus Thompson)
**Priority**: CRITICAL - These are global state stores
**Files**: `state/*.tsx`, `state/*.ts`
**Key Files**:
- `storage-explorer.tsx` - Complex Valtio store with many effects
- `role-impersonation-state.tsx` - Auth state with callback dependencies
- `table-editor-table.tsx`, `table-editor.tsx` - Editor state
- `sidebar-manager-state.tsx` - UI state
- All other state files

**Special Considerations**:
- Valtio proxy state requires careful handling
- Effects with `subscribe()` may need cleanup functions
- `useLatest` is already imported in role-impersonation - use this pattern
- Test state updates don't break reactivity

---

### Task 2: Lib Directory (Jordan Kim)
**Priority**: HIGH - Core utilities used everywhere
**Files**: `lib/**/*.tsx`, `lib/**/*.ts`
**Key Files**:
- `lib/auth.tsx` - Auth provider with effects
- `lib/telemetry.tsx` - Analytics hooks
- `lib/constants/*.tsx` - Any hooks in constants

**Special Considerations**:
- Auth changes are sensitive - test thoroughly
- QueryClient and other context deps need proper arrays
- `clearAssistantStorage` and similar async functions

---

### Task 3: Grid Components (Marcus Thompson)
**Priority**: MEDIUM - Data grid is performance-critical
**Files**: `components/grid/**/*.tsx`, `components/grid/**/*.ts`
**Key Files**:
- `SupabaseGrid.tsx` - Main grid component
- `components/grid/hooks/*.ts` - Custom grid hooks
- Editor components with state

**Special Considerations**:
- Grid performance is critical - test scrolling/rendering
- Filter and sort hooks need careful dep array management
- Row context and shortcuts components

---

### Task 4: Auth Interface Components (Jordan Kim)
**Priority**: HIGH - User-facing auth features
**Files**: `components/interfaces/Auth/**/*.tsx`
**Key Files**:
- All ThirdPartyAuthForm dialogs (CreateWorkOSDialog, CreateAuth0Dialog, etc)
- Settings forms (MfaAuthSettingsForm, SessionsAuthSettingsForm, etc)
- RedirectUrls, SiteUrl, OAuthApps

**Special Considerations**:
- Form state and validation
- Modal/sheet lifecycle effects
- API call effects with project refs

---

### Task 5: Remaining Interface Components (Marcus Thompson)
**Priority**: MEDIUM - Bulk of application UI
**Files**: `components/interfaces/**/*.tsx` (excluding Auth)
**Subdirectories**:
- Billing/, Database/, Integrations/, Settings/, Organization/, etc.

**Special Considerations**:
- Payment/billing forms are sensitive
- Database editor features
- API key management components

---

### Task 6: Verification & Documentation (Jordan Kim)
**Priority**: FINAL
**Tasks**:
1. Run ESLint across entire codebase
2. Verify zero exhaustive-deps warnings remain
3. Document any intentional omissions
4. Create summary report of all changes

---

## Technical Patterns to Use

### Pattern 1: Use `useLatest` for Stable References
```typescript
import useLatest from 'hooks/misc/useLatest'

const callbackRef = useLatest(callback)

useEffect(() => {
  callbackRef.current(data)
}, [callbackRef, data]) // callbackRef is stable
```

### Pattern 2: Use `useEvent` for Event Handlers (if available)
```typescript
const handleClick = useEvent(() => {
  // Can use props/state without deps
})
```

### Pattern 3: Split Complex Effects
```typescript
// BEFORE (bad)
useEffect(() => {
  doA()
  doB()
}, []) // Missing deps

// AFTER (good)
useEffect(() => {
  doA()
}, [propA, propB])

useEffect(() => {
  doB()
}, [propC, propD])
```

### Pattern 4: Memoize Stable Objects/Arrays
```typescript
const stableOptions = useMemo(() => ({
  limit: LIMIT,
  sortBy: { column: sortBy, order: sortByOrder }
}), [sortBy, sortByOrder])

useEffect(() => {
  fetchData(stableOptions)
}, [stableOptions, fetchData])
```

### Pattern 5: Document Intentional Omissions
```typescript
useEffect(() => {
  // Only run on mount - projectRef is stable across component lifecycle
  initializeState(projectRef)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

---

## Testing Checklist
After fixes, verify:
- [ ] State updates still trigger re-renders correctly
- [ ] Form submissions work
- [ ] API calls fire at correct times
- [ ] No infinite loops
- [ ] No stale closure bugs
- [ ] Performance hasn't degraded

---

## Communication Protocol
- Each specialist commits fixes to their assigned scope
- Create focused commits per directory/feature area
- Flag any complex cases for review
- Report completion with file count and issue count fixed

---

## Success Criteria
1. ✅ Zero `react-hooks/exhaustive-deps` warnings in ESLint
2. ✅ All existing tests pass
3. ✅ Manual smoke testing shows no regressions
4. ✅ Clean git history with descriptive commits
5. ✅ Summary report documenting all changes

Let's ship production-quality code.

---
**Dylan Torres**
Web Development TPM
