# Exhaustive-Deps Quick Start Guide

**For developers continuing this work**

## TL;DR
- **Total Warnings**: 140
- **Fixed So Far**: 3
- **Remaining**: 137
- **Full list**: `/tmp/all-exhaustive-deps.txt`
- **Detailed report**: `EXHAUSTIVE_DEPS_FINAL_REPORT.md`

---

## Quick Commands

### See all warnings
```bash
cd apps/studio
npx eslint . --ext .ts,.tsx 2>&1 | grep "react-hooks/exhaustive-deps"
```

### Check specific directory
```bash
npx eslint components/interfaces/Auth/ --ext .ts,.tsx 2>&1 | grep "exhaustive-deps"
```

### After fixing, verify the warning is gone
```bash
npx eslint path/to/fixed/file.tsx
```

---

## Fast Fix Patterns

### 1. Missing `form` (Most common - ~30 instances)
```typescript
// Find this:
useEffect(() => {
  form.setValue(...)
}, [someValue])

// Change to:
useEffect(() => {
  form.setValue(...)
}, [form, someValue])
```

### 2. Missing `router` (~10 instances)
```typescript
// Find this:
useEffect(() => {
  router.push(...)
}, [])

// Change to:
useEffect(() => {
  router.push(...)
}, [router])
```

### 3. Missing `setState` functions (~20 instances)
```typescript
// Find this:
useEffect(() => {
  setLoading(true)
}, [data])

// Change to:
useEffect(() => {
  setLoading(true)
}, [data, setLoading])
```

### 4. Remove stable refs from deps
```typescript
// Find this:
const ref = useLatest(callback)
useEffect(() => {
  ref.current()
}, [ref]) // ref is stable!

// Change to:
useEffect(() => {
  ref.current()
}, []) // Don't include stable refs
```

---

## Priority Order

### Start Here (30 warnings)
1. `components/interfaces/Auth/` - 15 warnings
2. `components/interfaces/Database/` - 10 warnings
3. `components/interfaces/Billing/` - 5 warnings

### Then (45 warnings)
4. `components/interfaces/Integrations/` - 20 warnings
5. `components/interfaces/QueryPerformance/` + `Logs/` - 15 warnings
6. `components/interfaces/App/` - 10 warnings

### Finally (62 warnings)
7. Everything else

---

## Testing Checklist

After fixing each file:
- [ ] ESLint warning gone
- [ ] Component still renders
- [ ] No console errors
- [ ] User interactions work (if applicable)
- [ ] No infinite loops

---

## When to Ask for Help

1. **Infinite loop** after adding dep - you might need `useCallback` in parent
2. **Effect fires too often** - consider `useMemo` for object deps
3. **Callback keeps changing** - wrap in `useCallback` at definition site
4. **Not sure if dep is needed** - add it, then test if removing causes bugs

---

## Git Commit Template

```bash
git commit -m "fix(area): resolve exhaustive-deps in ComponentName

- Add missing X dependency to useEffect
- Ensures effect responds to X changes correctly
- [any other details]

Fixes X/140 exhaustive-deps warnings"
```

---

## Files Already Fixed ✅

1. `state/storage-explorer.tsx` (line 1916)
2. `state/role-impersonation-state.tsx` (line 118)
3. `components/interfaces/Account/TOTPFactors/AddNewFactorModal.tsx` (line 157)

---

## Full Documentation

- **Detailed Report**: `EXHAUSTIVE_DEPS_FINAL_REPORT.md`
- **Fix Summary**: `EXHAUSTIVE_DEPS_FIX_SUMMARY.md`
- **Work Plan**: `apps/studio/EXHAUSTIVE_DEPS_CLEANUP_PLAN.md`
- **Warning List**: `/tmp/all-exhaustive-deps.txt`

---

**Questions?** Reference the full report or reach out to Dylan Torres (TPM)
