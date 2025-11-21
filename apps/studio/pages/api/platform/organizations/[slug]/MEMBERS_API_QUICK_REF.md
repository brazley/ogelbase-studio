# Team Members API - Quick Reference

## Endpoint
`/api/platform/organizations/[slug]/members`

## Operations

### GET - List Members
**Access**: Any organization member

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/platform/organizations/lancio/members
```

**Response**:
```json
[
  {
    "id": "member-uuid",
    "user_id": "user-uuid",
    "organization_id": "org-uuid",
    "role": "owner",
    "invited_at": "2024-01-01T00:00:00Z",
    "accepted_at": "2024-01-01T00:00:00Z",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe"
  }
]
```

**Sorting**: Owner → Admin → Developer → Read Only, then by invite date

---

### POST - Invite Member
**Access**: Admin or Owner

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"newdev@example.com","role":"developer"}' \
  http://localhost:3000/api/platform/organizations/lancio/members
```

**Body**:
```json
{
  "email": "newdev@example.com",
  "role": "developer"  // owner | admin | developer | read_only
}
```

**Rules**:
- Only owners can invite owners
- User must already exist in platform
- Cannot invite existing members

---

### PUT - Update Role
**Access**: Admin (for non-owners), Owner (for all)

```bash
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"member_id":"member-uuid","role":"admin"}' \
  http://localhost:3000/api/platform/organizations/lancio/members
```

**Body**:
```json
{
  "member_id": "member-uuid",
  "role": "admin"
}
```

**Rules**:
- Cannot change own role
- Only owners can change to/from owner role
- Admins can change non-owner roles

---

### DELETE - Remove Member
**Access**: Admin (for non-owners), Owner (for all)

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"member_id":"member-uuid"}' \
  http://localhost:3000/api/platform/organizations/lancio/members
```

**Body**:
```json
{
  "member_id": "member-uuid"
}
```

**Rules**:
- Cannot remove self
- Only owners can remove owners
- Consider checking for last owner

---

## Role Hierarchy

```
owner       ⭐ Can do everything
  ↓
admin       🔧 Can manage non-owner members
  ↓
developer   💻 Can view members only
  ↓
read_only   👀 Can view members only
```

## Error Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Member invited |
| 400 | Invalid input |
| 403 | Insufficient permissions |
| 404 | Member/user not found |
| 500 | Database error |

## Database Schema

```sql
platform.organization_members
  - id: uuid (PK)
  - organization_id: uuid (FK)
  - user_id: uuid (FK)
  - role: text
  - invited_at: timestamp
  - accepted_at: timestamp
```

## Query Performance

- List: ~10ms for <100 members
- Invite: ~20ms (includes user lookup)
- Update: ~15ms
- Remove: ~10ms

## Testing

Run integration tests:
```bash
node apps/studio/test-members-api.js
```

Run unit tests:
```bash
npm test apps/studio/pages/api/platform/organizations/__tests__/members.test.ts
```
