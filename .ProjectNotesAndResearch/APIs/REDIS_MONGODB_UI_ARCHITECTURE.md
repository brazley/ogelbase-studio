# Supabase Studio: Redis & MongoDB UI Extension Architecture

**Date**: 2025-11-20
**Purpose**: Architectural analysis and implementation plan for extending Supabase Studio to manage Redis and MongoDB databases alongside Postgres.

---

## Table of Contents

1. [Current UI Architecture Analysis](#current-ui-architecture-analysis)
2. [Extension Points for Redis & MongoDB](#extension-points-for-redis--mongodb)
3. [UI/UX Design Specifications](#uiux-design-specifications)
4. [Component Architecture](#component-architecture)
5. [Data Fetching & State Management](#data-fetching--state-management)
6. [Routing & Navigation Strategy](#routing--navigation-strategy)
7. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Current UI Architecture Analysis

### 1.1 Directory Structure

**Key Architectural Directories:**

```
apps/studio/
├── pages/                          # Next.js pages (routing)
│   └── project/[ref]/              # Project-level routes
│       ├── database/               # Postgres database pages
│       ├── storage/                # Storage management
│       ├── auth/                   # Authentication
│       ├── functions/              # Edge functions
│       └── [other-products]/
│
├── components/
│   ├── layouts/                    # Layout components
│   │   ├── ProjectLayout/          # Base project layout
│   │   ├── DatabaseLayout/         # Database-specific layout
│   │   ├── StorageLayout/          # Storage-specific layout
│   │   └── [product]Layout/        # Product-specific layouts
│   │
│   ├── interfaces/                 # Feature-specific components
│   │   ├── Sidebar.tsx             # Main navigation sidebar
│   │   ├── Storage/                # Storage UI components
│   │   └── [product]/              # Product-specific UIs
│   │
│   └── ui/                         # Reusable UI components (165+ files)
│       ├── ProductMenu/            # Generic product navigation menu
│       ├── DataTable/              # Table components
│       ├── Charts/                 # Chart components
│       └── [other-shared]/         # 160+ other components
│
└── data/                           # Data layer (React Query)
    ├── __templates/                # Query/mutation templates
    ├── database/                   # Database-related queries
    ├── storage/                    # Storage-related queries
    └── [domain]/                   # Domain-specific data hooks
```

### 1.2 Navigation Architecture

**File**: `apps/studio/components/interfaces/Sidebar.tsx`

The main navigation uses a collapsible sidebar with three-state behavior:
- **Expandable** (hover to expand)
- **Open** (always expanded)
- **Closed** (always collapsed)

**Navigation Generation** (from `NavigationBar.utils.tsx`):

```typescript
// Current navigation structure
export const generateProductRoutes = (ref, project, features) => {
  return [
    { key: 'database', label: 'Database', ... },      // Postgres
    { key: 'auth', label: 'Authentication', ... },
    { key: 'storage', label: 'Storage', ... },
    { key: 'functions', label: 'Edge Functions', ... },
    { key: 'realtime', label: 'Realtime', ... },
  ]
}
```

**Product Navigation Pattern:**

Each product (Database, Storage, Auth, etc.) follows this pattern:

1. **Route in Sidebar** → Clicking navigates to product
2. **Product Layout** → Wraps product pages with:
   - Left sidebar with product-specific menu
   - Main content area
3. **Product Menu** → Shows sub-navigation (e.g., Tables, Functions, Triggers)

### 1.3 Layout System

**Base Layout Hierarchy:**

```
DefaultLayout
└── ProjectLayout (product-specific)
    └── ProductMenu (left sidebar)
        └── Page Content
```

**Example - Database Layout** (`DatabaseLayout.tsx`):

```typescript
const DatabaseLayout = ({ children }) => {
  return (
    <ProjectLayout
      product="Database"
      productMenu={<DatabaseProductMenu />}
    >
      {children}
    </ProjectLayout>
  )
}

const DatabaseProductMenu = () => {
  const menu = generateDatabaseMenu(project, flags)
  return <ProductMenu page={page} menu={menu} />
}
```

**ProductMenu Structure** (`ProductMenu.types.ts`):

```typescript
interface ProductMenuGroup {
  title?: string           // Section header
  key?: string
  isPreview?: boolean
  items: ProductMenuGroupItem[]
}

interface ProductMenuGroupItem {
  name: string            // Menu item label
  key: string             // URL matcher
  url: string             // Navigation target
  icon?: ReactNode
  rightIcon?: ReactNode
  isExternal?: boolean
  label?: string          // Badge label
  pages?: string[]        // Active page matching
}
```

### 1.4 Database Management UI

**Database Menu Structure** (`DatabaseMenu.utils.tsx`):

```typescript
const generateDatabaseMenu = (project, flags) => [
  {
    title: 'Database Management',
    items: [
      { name: 'Schema Visualizer', key: 'schemas', url: `/project/${ref}/database/schemas` },
      { name: 'Tables', key: 'tables', url: `/project/${ref}/database/tables` },
      { name: 'Functions', key: 'functions', url: `/project/${ref}/database/functions` },
      { name: 'Triggers', key: 'triggers', url: `/project/${ref}/database/triggers` },
      { name: 'Extensions', key: 'extensions', url: `/project/${ref}/database/extensions` },
      { name: 'Indexes', key: 'indexes', url: `/project/${ref}/database/indexes` },
      ...
    ]
  },
  {
    title: 'Configuration',
    items: [
      { name: 'Roles', key: 'roles', ... },
      { name: 'Policies', key: 'policies', ... },
      { name: 'Settings', key: 'settings', ... },
    ]
  },
  ...
]
```

**Key Database Pages:**

- `/project/[ref]/database/tables` - Table listing and editor
- `/project/[ref]/database/schemas` - Schema visualizer
- `/project/[ref]/database/functions` - Functions management
- `/project/[ref]/database/extensions` - Extensions management

### 1.5 Storage Pattern (Analogous Example)

**Storage Menu** (`StorageMenuV2.tsx`):

```typescript
export const StorageMenuV2 = () => {
  return (
    <Menu type="pills">
      <Menu.Group title="MANAGE">
        <Link href={`/project/${ref}/storage/files`}>Files</Link>
        <Link href={`/project/${ref}/storage/vectors`}>Vectors</Link>
        <Link href={`/project/${ref}/storage/analytics`}>Analytics</Link>
      </Menu.Group>

      <Menu.Group title="CONFIGURATION">
        <Link href={`/project/${ref}/storage/s3`}>S3</Link>
      </Menu.Group>
    </Menu>
  )
}
```

---

## 2. Extension Points for Redis & MongoDB

### 2.1 Navigation Extension Points

**Location**: `components/layouts/ProjectLayout/NavigationBar/NavigationBar.utils.tsx`

**Current Product Routes:**
```typescript
generateProductRoutes(ref, project, features) {
  return [
    'database',    // Postgres
    'auth',
    'storage',
    'functions',
    'realtime',
  ]
}
```

**Proposed Extension:**
```typescript
generateProductRoutes(ref, project, features) {
  return [
    'database',     // Postgres
    'redis',        // NEW: Redis management
    'mongodb',      // NEW: MongoDB management
    'auth',
    'storage',
    'functions',
    'realtime',
  ]
}
```

**New Route Configuration:**

```typescript
// Add to NavigationBar.utils.tsx
export const generateProductRoutes = (ref, project, features) => {
  const {
    redis: redisEnabled = false,
    mongodb: mongodbEnabled = false,
    ...otherFeatures
  } = features || {}

  return [
    { key: 'database', label: 'Database', ... },

    // NEW: Redis
    ...(redisEnabled ? [{
      key: 'redis',
      label: 'Redis',
      icon: <RedisIcon size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && `/project/${ref}/redis/keys`,
      items: generateRedisMenu(ref)
    }] : []),

    // NEW: MongoDB
    ...(mongodbEnabled ? [{
      key: 'mongodb',
      label: 'MongoDB',
      icon: <MongoDBIcon size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && `/project/${ref}/mongodb/databases`,
      items: generateMongoDBMenu(ref)
    }] : []),

    { key: 'auth', label: 'Authentication', ... },
    ...
  ]
}
```

### 2.2 Page Structure Extension Points

**Create New Product Directories:**

```
apps/studio/pages/project/[ref]/
├── redis/                          # NEW
│   ├── keys.tsx                    # Key browser
│   ├── [key].tsx                   # Key detail view
│   ├── commands.tsx                # Command console
│   ├── monitor.tsx                 # Real-time monitor
│   └── settings.tsx                # Configuration
│
└── mongodb/                        # NEW
    ├── databases.tsx               # Database list
    ├── collections/
    │   ├── index.tsx               # Collections browser
    │   └── [collection].tsx        # Collection view
    ├── documents/
    │   ├── index.tsx               # Document browser
    │   └── [id].tsx                # Document editor
    ├── aggregations.tsx            # Aggregation pipeline builder
    └── settings.tsx                # Configuration
```

### 2.3 Layout Component Extension Points

**Create New Layouts:**

```
apps/studio/components/layouts/
├── RedisLayout/
│   ├── RedisLayout.tsx
│   ├── RedisMenu.utils.tsx
│   └── Redis.Commands.tsx          # Command palette integration
│
└── MongoDBLayout/
    ├── MongoDBLayout.tsx
    ├── MongoDBMenu.utils.tsx
    └── MongoDB.Commands.tsx
```

### 2.4 Data Layer Extension Points

**Create New Data Hooks:**

```
apps/studio/data/
├── redis/
│   ├── keys.ts                     # Query Redis keys
│   ├── redis-keys-query.ts
│   ├── redis-key-detail-query.ts
│   ├── redis-set-mutation.ts
│   ├── redis-delete-mutation.ts
│   └── redis-info-query.ts
│
└── mongodb/
    ├── mongodb-databases-query.ts
    ├── mongodb-collections-query.ts
    ├── mongodb-documents-query.ts
    ├── mongodb-document-create-mutation.ts
    ├── mongodb-document-update-mutation.ts
    └── mongodb-stats-query.ts
```

---

## 3. UI/UX Design Specifications

### 3.1 Redis Management Screens

#### 3.1.1 Redis Key Browser (`/project/[ref]/redis/keys`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Redis                                                     │
├───────────────┬─────────────────────────────────────────┤
│ MANAGE        │  [Search keys...]  [Type: All ▼] [Scan] │
│ > Keys        ├─────────────────────────────────────────┤
│   Commands    │                                           │
│   Monitor     │  Key Pattern         Type      TTL       │
│               │  ─────────────────────────────────────── │
│ CONFIGURATION │  user:123            hash      -1        │
│   Settings    │  session:abc-def     string    3600s     │
│   Info        │  cache:homepage      string    600s      │
│               │  queue:emails        list      -1        │
│               │  cart:xyz            hash      7200s     │
│               │                                           │
│               │  [Load More...] (100 of 5,432 keys)     │
└───────────────┴─────────────────────────────────────────┘
```

**Features:**
- **Key Search**: Pattern matching (e.g., `user:*`, `cache:*`)
- **Type Filter**: String, Hash, List, Set, Sorted Set, Stream
- **TTL Display**: Time-to-live with human-readable format
- **Batch Operations**: Delete, Set TTL, Export
- **Pagination**: Scan-based pagination (not blocking)
- **Real-time Updates**: Live key count and memory usage

**State Management:**
```typescript
// State shape
interface RedisKeyBrowserState {
  searchPattern: string
  typeFilter: RedisDataType | 'all'
  cursor: string
  keys: RedisKey[]
  totalKeys: number
  selectedKeys: string[]
}

// Example key object
interface RedisKey {
  name: string
  type: 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream'
  ttl: number          // -1 for no expiry
  size: number         // Memory size in bytes
  lastModified?: Date
}
```

#### 3.1.2 Redis Key Detail View (`/project/[ref]/redis/[key]`)

**Layout (String Type):**
```
┌─────────────────────────────────────────────────────────┐
│ Redis > user:123                                          │
├───────────────┬─────────────────────────────────────────┤
│ Key Details   │  Type: String                            │
│               │  TTL: No expiry  [Set TTL]               │
│ Name          │  Size: 245 bytes                         │
│ user:123      │  Encoding: raw                           │
│               ├─────────────────────────────────────────┤
│ Type: String  │  Value                                   │
│ TTL: None     │  ┌──────────────────────────────────┐   │
│ Size: 245 B   │  │ {"name":"John","email":"..."} │   │
│               │  │                                  │   │
│ [Rename]      │  │                                  │   │
│ [Set TTL]     │  └──────────────────────────────────┘   │
│ [Delete]      │  [Edit] [Copy] [Download]                │
└───────────────┴─────────────────────────────────────────┘
```

**Layout (Hash Type):**
```
┌─────────────────────────────────────────────────────────┐
│ Redis > cart:xyz                                          │
├───────────────┬─────────────────────────────────────────┤
│ Key Details   │  Field          Value              Size  │
│               │  ─────────────────────────────────────── │
│ Name          │  item_123       {"qty":2,"..."}    45B  │
│ cart:xyz      │  item_456       {"qty":1,"..."}    38B  │
│               │  total          "89.99"            6B   │
│ Type: Hash    │  currency       "USD"              3B   │
│ TTL: 2h       │                                           │
│ Fields: 4     │  [Add Field] [Export CSV]                │
│               │                                           │
│ [Operations]  │  Operations:                             │
│  - HGET       │  HGETALL cart:xyz                        │
│  - HSET       │  HLEN cart:xyz                           │
│  - HDEL       │  [Run Command]                           │
└───────────────┴─────────────────────────────────────────┘
```

**Features Per Type:**

| Type | View | Operations |
|------|------|------------|
| **String** | Text editor with JSON/XML/HTML formatting | GET, SET, APPEND, STRLEN |
| **Hash** | Field/value table | HGETALL, HSET, HDEL, HINCRBY |
| **List** | Ordered list view with indices | LRANGE, LPUSH, RPUSH, LPOP, RPOP |
| **Set** | Member list with search | SMEMBERS, SADD, SREM, SCARD |
| **Sorted Set** | Score-ordered table | ZRANGE, ZADD, ZREM, ZSCORE |
| **Stream** | Timeline view with entries | XREAD, XADD, XLEN, XINFO |

#### 3.1.3 Redis Command Console (`/project/[ref]/redis/commands`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Redis Command Console                                     │
├─────────────────────────────────────────────────────────┤
│ > KEYS user:*                                            │
│ 1) "user:123"                                            │
│ 2) "user:456"                                            │
│ (0.003s)                                                 │
│                                                          │
│ > GET user:123                                           │
│ {"name":"John Doe","email":"john@example.com"}          │
│ (0.001s)                                                 │
│                                                          │
│ > _█                                                     │
├─────────────────────────────────────────────────────────┤
│ [Command History ▼] [Clear] [Help]                      │
│                                                          │
│ Common Commands:                                         │
│ [KEYS *] [INFO] [DBSIZE] [FLUSHDB] [CONFIG GET *]      │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- **Auto-complete**: Command and key name suggestions
- **Syntax Highlighting**: Redis command syntax
- **History**: Command history with up/down arrows
- **Dangerous Commands**: Warning prompts for FLUSHDB, FLUSHALL
- **Multi-line Support**: For complex commands
- **Export Results**: Copy or download command output

#### 3.1.4 Redis Monitor (`/project/[ref]/redis/monitor`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Redis Real-time Monitor                    [●] Recording│
├─────────────────────────────────────────────────────────┤
│ Filters: [Command ▼] [Key Pattern...] [Client ID...]   │
├─────────────────────────────────────────────────────────┤
│ Time         Client      Command              Result    │
│ ──────────────────────────────────────────────────────  │
│ 14:32:01.234 10.0.1.5    GET user:123         (string) │
│ 14:32:01.456 10.0.1.8    SET cache:home       OK       │
│ 14:32:02.123 10.0.1.5    HGETALL cart:xyz     (4 flds) │
│ 14:32:02.789 10.0.1.12   LPUSH queue:jobs     (list)   │
│                                                          │
│ [Pause] [Clear] [Export] [Filter...]                   │
│                                                          │
│ Stats (Last 60s):                                       │
│ Commands: 1,234 | Reads: 890 | Writes: 344             │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- **Live Streaming**: Real-time command monitoring
- **Filtering**: By command type, key pattern, client
- **Performance Metrics**: Commands/sec, read/write ratio
- **Slow Queries**: Highlight commands >100ms
- **Export**: Save monitoring session

#### 3.1.5 Redis Settings/Info (`/project/[ref]/redis/settings`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Redis Configuration                                       │
├───────────────┬─────────────────────────────────────────┤
│ INFO          │  Server Information                      │
│ > Overview    │  ─────────────────                       │
│   Memory      │  Redis Version: 7.2.3                    │
│   Stats       │  Uptime: 15 days 3 hours                 │
│   Clients     │  Connected Clients: 42                   │
│   Persistence │  Used Memory: 2.4 GB / 4.0 GB (60%)     │
│               │  Total Keys: 125,432                     │
│ CONFIGURATION │  Hit Rate: 94.2%                         │
│   General     │                                           │
│   Persistence │  Memory Usage by Type                    │
│   Limits      │  ┌────────────────────────────────────┐  │
│               │  │ Strings:  45% ██████████           │  │
│               │  │ Hashes:   30% ███████              │  │
│               │  │ Lists:    15% ███                  │  │
│               │  │ Sets:     10% ██                   │  │
│               │  └────────────────────────────────────┘  │
└───────────────┴─────────────────────────────────────────┘
```

**Info Sections:**
- **Overview**: Version, uptime, memory, clients
- **Memory**: Usage breakdown, eviction policy, fragmentation
- **Stats**: Commands processed, hit rate, keyspace stats
- **Clients**: Connected clients, blocked clients
- **Persistence**: RDB/AOF status, last save time
- **Replication**: Master/slave info (if applicable)

### 3.2 MongoDB Management Screens

#### 3.2.1 MongoDB Database Browser (`/project/[ref]/mongodb/databases`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ MongoDB                                                   │
├───────────────┬─────────────────────────────────────────┤
│ MANAGE        │  [Search databases...]  [+ New Database]│
│ > Databases   ├─────────────────────────────────────────┤
│   Collections │                                           │
│   Aggregation │  Database        Collections  Size       │
│   Shell       │  ──────────────────────────────────────  │
│               │  production      12           2.4 GB     │
│ CONFIGURATION │  staging         8            456 MB     │
│   Settings    │  analytics       5            8.2 GB     │
│   Users       │  logs            3            15.6 GB    │
│   Indexes     │                                           │
│               │  [View Details] [Drop Database]          │
└───────────────┴─────────────────────────────────────────┘
```

**Features:**
- **Database List**: All databases with stats
- **Quick Stats**: Collection count, total size, indexes
- **Create Database**: With validation options
- **Drop Protection**: Confirmation for destructive operations

#### 3.2.2 MongoDB Collection Browser (`/project/[ref]/mongodb/collections`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ MongoDB > production                                      │
├───────────────┬─────────────────────────────────────────┤
│ Collections   │  [Search...]  [+ New Collection]         │
│               ├─────────────────────────────────────────┤
│ DATABASE      │  Collection    Documents    Size  Idx   │
│ production    │  ──────────────────────────────────────  │
│               │  users         125,432      245MB  4    │
│ > users       │  orders        89,234       1.2GB  6    │
│   orders      │  products      5,678        45MB   3    │
│   products    │  sessions      234,567      890MB  2    │
│   sessions    │                                           │
│               │  [View Documents] [Schema] [Indexes]     │
│ [+ Create]    │                                           │
│ [Import]      │  Selected: users                         │
│ [Export]      │  ┌──────────────────────────────────┐   │
│               │  │ Document Count: 125,432          │   │
│               │  │ Avg Doc Size: 2.1 KB             │   │
│               │  │ Total Size: 245 MB               │   │
│               │  │ Indexes: 4 (95 MB)               │   │
│               │  └──────────────────────────────────┘   │
└───────────────┴─────────────────────────────────────────┘
```

**Features:**
- **Collection Stats**: Document count, size, indexes
- **Schema Analysis**: Inferred schema from documents
- **Index Management**: Create, view, analyze indexes
- **Validation Rules**: JSON Schema validation
- **Capped Collections**: Size and document limits

#### 3.2.3 MongoDB Document Browser (`/project/[ref]/mongodb/documents`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ MongoDB > production > users                              │
├───────────────┬─────────────────────────────────────────┤
│ Filters       │  Filter: { "status": "active" } [Apply]  │
│               │  Sort: { "_id": -1 }  Limit: 20          │
│ {             ├─────────────────────────────────────────┤
│   "status":   │  [Table View] [JSON View] [Tree View]    │
│   "active"    │                                           │
│ }             │  _id            name       email    age  │
│               │  ──────────────────────────────────────  │
│ [Clear]       │  507f1f77...   John Doe   john@..   32  │
│               │  507f191...    Jane Smith jane@..   28  │
│ Projection    │  507f1a2...    Bob Jones  bob@...   45  │
│               │                                           │
│ {             │  [◀ Previous] Page 1 of 6,272 [Next ▶]  │
│   "_id": 1,   │                                           │
│   "name": 1,  │  [+ Insert Document] [Import] [Export]   │
│   "email": 1  │                                           │
│ }             │  Bulk Operations:                        │
│               │  [Update Many] [Delete Many]             │
└───────────────┴─────────────────────────────────────────┘
```

**Features:**
- **Query Builder**: Visual and JSON query modes
- **Multiple Views**: Table, JSON tree, raw JSON
- **Projections**: Field selection
- **Sorting**: Multi-field sorting
- **Pagination**: Skip/limit with total count
- **Bulk Operations**: Update/delete many documents
- **Export**: JSON, CSV, Excel formats

#### 3.2.4 MongoDB Document Editor (`/project/[ref]/mongodb/documents/[id]`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Edit Document: production.users > 507f1f77bcf86cd799439011│
├─────────────────────────────────────────────────────────┤
│ [JSON] [Tree] [Form]                      [Save] [Cancel]│
├─────────────────────────────────────────────────────────┤
│                                                          │
│  {                                                       │
│    "_id": ObjectId("507f1f77bcf86cd799439011"),         │
│    "name": "John Doe",                                  │
│    "email": "john@example.com",                         │
│    "age": 32,                                           │
│    "address": {                                         │
│      "street": "123 Main St",                           │
│      "city": "New York",                                │
│      "zip": "10001"                                     │
│    },                                                   │
│    "orders": [                                          │
│      { "id": 1, "total": 99.99 },                      │
│      { "id": 2, "total": 149.99 }                      │
│    ],                                                   │
│    "createdAt": ISODate("2024-01-15T10:30:00Z"),       │
│    "updatedAt": ISODate("2024-11-20T14:22:00Z")        │
│  }                                                      │
│                                                          │
│  [Validate] [Format] [Duplicate] [Delete]               │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- **JSON Editor**: Syntax highlighting, validation
- **Tree View**: Expandable/collapsible structure
- **Form View**: Auto-generated form from schema
- **Type Preservation**: ObjectId, Date, Binary types
- **Validation**: Against collection schema
- **History**: Track document changes (if enabled)

#### 3.2.5 MongoDB Aggregation Pipeline (`/project/[ref]/mongodb/aggregations`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Aggregation Pipeline Builder                             │
├───────────────┬─────────────────────────────────────────┤
│ Saved Pipes   │  Collection: users ▼                     │
│               │                                           │
│ > User Stats  │  Pipeline Stages                         │
│   Orders by   │  ┌──────────────────────────────────┐   │
│   Product     │  │ 1. $match                        │   │
│               │  │    { "status": "active" }        │   │
│ [+ New]       │  ├──────────────────────────────────┤   │
│ [Import]      │  │ 2. $group                        │   │
│               │  │    { _id: "$city",               │   │
│               │  │      count: { $sum: 1 } }        │   │
│               │  ├──────────────────────────────────┤   │
│               │  │ 3. $sort                         │   │
│               │  │    { count: -1 }                 │   │
│               │  └──────────────────────────────────┘   │
│               │  [+ Add Stage ▼]                         │
│               │                                           │
│               │  Preview Results (20 docs)               │
│               │  ┌──────────────────────────────────┐   │
│               │  │ { "_id": "New York", count: 45 } │   │
│               │  │ { "_id": "LA", count: 32 }       │   │
│               │  │ { "_id": "Chicago", count: 28 }  │   │
│               │  └──────────────────────────────────┘   │
│               │  [Run] [Explain] [Export] [Save]        │
└───────────────┴─────────────────────────────────────────┘
```

**Features:**
- **Visual Pipeline Builder**: Drag-and-drop stages
- **Stage Templates**: Common aggregation patterns
- **Live Preview**: Real-time results as you build
- **Explain Plan**: Query performance analysis
- **Save Pipelines**: Reusable aggregation queries
- **Export**: Results to JSON/CSV

#### 3.2.6 MongoDB Settings (`/project/[ref]/mongodb/settings`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ MongoDB Configuration                                     │
├───────────────┬─────────────────────────────────────────┤
│ INFO          │  Server Information                      │
│ > Overview    │  ─────────────────                       │
│   Databases   │  MongoDB Version: 7.0.4                  │
│   Operations  │  Storage Engine: WiredTiger              │
│   Network     │  Uptime: 30 days 12 hours                │
│   Security    │                                           │
│               │  Database Statistics                     │
│ USERS         │  ┌──────────────────────────────────┐   │
│   Roles       │  │ Total Databases: 4               │   │
│   Auth        │  │ Total Collections: 28            │   │
│               │  │ Total Documents: 454,901         │   │
│ INDEXES       │  │ Data Size: 27.3 GB               │   │
│   Analysis    │  │ Index Size: 3.2 GB               │   │
│   Rebuild     │  │ Storage Size: 35.1 GB            │   │
│               │  └──────────────────────────────────┘   │
│               │                                           │
│               │  Performance                             │
│               │  Operations/sec: 145                     │
│               │  Active Connections: 23 / 100            │
│               │  Queue: Read 0 | Write 0                 │
└───────────────┴─────────────────────────────────────────┘
```

---

## 4. Component Architecture

### 4.1 New Layout Components

#### 4.1.1 RedisLayout

**File**: `apps/studio/components/layouts/RedisLayout/RedisLayout.tsx`

```typescript
import { ReactNode } from 'react'
import { RedisMenuV2 } from 'components/interfaces/Redis/RedisMenuV2'
import { withAuth } from 'hooks/misc/withAuth'
import { ProjectLayout } from '../ProjectLayout'

export interface RedisLayoutProps {
  title: string
  children: ReactNode
}

const RedisLayout = ({ title, children }: RedisLayoutProps) => {
  return (
    <ProjectLayout
      title={title || 'Redis'}
      product="Redis"
      productMenu={<RedisMenuV2 />}
    >
      {children}
    </ProjectLayout>
  )
}

export default withAuth(RedisLayout)
```

#### 4.1.2 RedisMenu.utils.tsx

**File**: `apps/studio/components/layouts/RedisLayout/RedisMenu.utils.tsx`

```typescript
import type { ProductMenuGroup } from 'components/ui/ProductMenu/ProductMenu.types'
import type { Project } from 'data/projects/project-detail-query'
import { IS_PLATFORM } from 'lib/constants'

export const generateRedisMenu = (
  project?: Project,
  flags?: {
    clusterMode: boolean
    sentinelMode: boolean
  }
): ProductMenuGroup[] => {
  const ref = project?.ref ?? 'default'
  const { clusterMode, sentinelMode } = flags || {}

  return [
    {
      title: 'Data Management',
      items: [
        {
          name: 'Key Browser',
          key: 'keys',
          url: `/project/${ref}/redis/keys`,
          items: [],
        },
        {
          name: 'Command Console',
          key: 'commands',
          url: `/project/${ref}/redis/commands`,
          items: [],
        },
        {
          name: 'Monitor',
          key: 'monitor',
          url: `/project/${ref}/redis/monitor`,
          items: [],
        },
      ],
    },
    {
      title: 'Configuration',
      items: [
        {
          name: 'Settings',
          key: 'settings',
          url: `/project/${ref}/redis/settings`,
          items: [],
        },
        {
          name: 'Info & Stats',
          key: 'info',
          url: `/project/${ref}/redis/info`,
          items: [],
        },
        ...(clusterMode
          ? [
              {
                name: 'Cluster',
                key: 'cluster',
                url: `/project/${ref}/redis/cluster`,
                items: [],
              },
            ]
          : []),
        ...(sentinelMode
          ? [
              {
                name: 'Sentinel',
                key: 'sentinel',
                url: `/project/${ref}/redis/sentinel`,
                items: [],
              },
            ]
          : []),
      ],
    },
  ]
}
```

#### 4.1.3 MongoDBLayout

**File**: `apps/studio/components/layouts/MongoDBLayout/MongoDBLayout.tsx`

```typescript
import { ReactNode } from 'react'
import { MongoDBMenuV2 } from 'components/interfaces/MongoDB/MongoDBMenuV2'
import { withAuth } from 'hooks/misc/withAuth'
import { ProjectLayout } from '../ProjectLayout'

export interface MongoDBLayoutProps {
  title: string
  children: ReactNode
}

const MongoDBLayout = ({ title, children }: MongoDBLayoutProps) => {
  return (
    <ProjectLayout
      title={title || 'MongoDB'}
      product="MongoDB"
      productMenu={<MongoDBMenuV2 />}
    >
      {children}
    </ProjectLayout>
  )
}

export default withAuth(MongoDBLayout)
```

#### 4.1.4 MongoDBMenu.utils.tsx

**File**: `apps/studio/components/layouts/MongoDBLayout/MongoDBMenu.utils.tsx`

```typescript
import type { ProductMenuGroup } from 'components/ui/ProductMenu/ProductMenu.types'
import type { Project } from 'data/projects/project-detail-query'

export const generateMongoDBMenu = (
  project?: Project,
  flags?: {
    replicaSet: boolean
    sharding: boolean
  }
): ProductMenuGroup[] => {
  const ref = project?.ref ?? 'default'
  const { replicaSet, sharding } = flags || {}

  return [
    {
      title: 'Data Management',
      items: [
        {
          name: 'Databases',
          key: 'databases',
          url: `/project/${ref}/mongodb/databases`,
          items: [],
        },
        {
          name: 'Collections',
          key: 'collections',
          url: `/project/${ref}/mongodb/collections`,
          items: [],
        },
        {
          name: 'Documents',
          key: 'documents',
          url: `/project/${ref}/mongodb/documents`,
          items: [],
        },
        {
          name: 'Aggregations',
          key: 'aggregations',
          url: `/project/${ref}/mongodb/aggregations`,
          items: [],
        },
        {
          name: 'Shell',
          key: 'shell',
          url: `/project/${ref}/mongodb/shell`,
          items: [],
        },
      ],
    },
    {
      title: 'Configuration',
      items: [
        {
          name: 'Indexes',
          key: 'indexes',
          url: `/project/${ref}/mongodb/indexes`,
          items: [],
        },
        {
          name: 'Users & Roles',
          key: 'users',
          url: `/project/${ref}/mongodb/users`,
          items: [],
        },
        {
          name: 'Settings',
          key: 'settings',
          url: `/project/${ref}/mongodb/settings`,
          items: [],
        },
        ...(replicaSet
          ? [
              {
                name: 'Replica Set',
                key: 'replica-set',
                url: `/project/${ref}/mongodb/replica-set`,
                items: [],
              },
            ]
          : []),
        ...(sharding
          ? [
              {
                name: 'Sharding',
                key: 'sharding',
                url: `/project/${ref}/mongodb/sharding`,
                items: [],
              },
            ]
          : []),
      ],
    },
  ]
}
```

### 4.2 Reusable Components

**Leverage Existing UI Components** (165+ available):

| Component | Location | Use For |
|-----------|----------|---------|
| `DataTable` | `components/ui/DataTable/` | Redis keys, MongoDB documents |
| `CodeEditor` | `components/ui/CodeEditor/` | JSON editing, command input |
| `VirtualizedTable` | `components/ui/VirtualizedTable.tsx` | Large datasets |
| `Charts` | `components/ui/Charts/` | Memory usage, stats visualization |
| `FilterPopover` | `components/ui/FilterPopover.tsx` | Key/document filtering |
| `InfiniteList` | `components/ui/InfiniteList.tsx` | Pagination for large lists |
| `FormPanel` | `components/ui/Forms/FormPanel.tsx` | Settings forms |

### 4.3 New Feature Components

**Create Domain-Specific Components:**

```
apps/studio/components/interfaces/
├── Redis/
│   ├── RedisMenuV2.tsx
│   ├── RedisKeyBrowser/
│   │   ├── KeyList.tsx
│   │   ├── KeyTypeFilter.tsx
│   │   └── KeySearchBar.tsx
│   ├── RedisKeyDetail/
│   │   ├── StringValueEditor.tsx
│   │   ├── HashFieldTable.tsx
│   │   ├── ListItemViewer.tsx
│   │   ├── SetMemberViewer.tsx
│   │   └── SortedSetViewer.tsx
│   ├── RedisCommands/
│   │   ├── CommandConsole.tsx
│   │   ├── CommandHistory.tsx
│   │   └── CommandAutocomplete.tsx
│   └── RedisMonitor/
│       ├── LiveCommandStream.tsx
│       └── MonitorFilters.tsx
│
└── MongoDB/
    ├── MongoDBMenuV2.tsx
    ├── MongoDatabaseBrowser/
    │   ├── DatabaseList.tsx
    │   └── DatabaseStats.tsx
    ├── MongoCollectionBrowser/
    │   ├── CollectionList.tsx
    │   ├── CollectionSchema.tsx
    │   └── CollectionIndexes.tsx
    ├── MongoDocumentBrowser/
    │   ├── DocumentTable.tsx
    │   ├── QueryBuilder.tsx
    │   └── DocumentFilters.tsx
    ├── MongoDocumentEditor/
    │   ├── JSONEditor.tsx
    │   ├── TreeView.tsx
    │   └── FormView.tsx
    └── MongoAggregation/
        ├── PipelineBuilder.tsx
        ├── StageSelector.tsx
        └── PipelinePreview.tsx
```

**Example Component - RedisKeyBrowser/KeyList.tsx:**

```typescript
import { useRedisKeysQuery } from 'data/redis/redis-keys-query'
import { VirtualizedTable } from 'components/ui/VirtualizedTable'
import { formatBytes, formatTTL } from 'lib/helpers'

interface KeyListProps {
  projectRef: string
  pattern: string
  typeFilter: RedisDataType | 'all'
  onKeyClick: (key: string) => void
}

export const KeyList = ({
  projectRef,
  pattern,
  typeFilter,
  onKeyClick
}: KeyListProps) => {
  const { data: keys, isLoading } = useRedisKeysQuery({
    projectRef,
    pattern,
    type: typeFilter !== 'all' ? typeFilter : undefined,
  })

  const columns = [
    { key: 'name', label: 'Key', width: '40%' },
    { key: 'type', label: 'Type', width: '20%' },
    { key: 'ttl', label: 'TTL', width: '20%', render: formatTTL },
    { key: 'size', label: 'Size', width: '20%', render: formatBytes },
  ]

  return (
    <VirtualizedTable
      data={keys || []}
      columns={columns}
      isLoading={isLoading}
      onRowClick={(key) => onKeyClick(key.name)}
      emptyMessage="No keys found matching your filter"
    />
  )
}
```

---

## 5. Data Fetching & State Management

### 5.1 Data Layer Architecture

**Pattern**: React Query (TanStack Query) - Same as existing codebase

**Example Template** (`data/__templates/resources-query.ts`):

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'

export type ResourcesVariables = {
  projectRef?: string
}

export async function getResources({ projectRef }: ResourcesVariables, signal?: AbortSignal) {
  if (!projectRef) throw new Error('projectRef is required')

  const { data, error } = await get(`/v1/projects/{ref}/resource`, {
    params: { path: { ref: projectRef } },
    signal,
  })
  if (error) handleError(error)
  return data
}

export const useResourcesQuery = <TData = ResourcesData>(
  { projectRef }: ResourcesVariables,
  { enabled = true, ...options }: UseCustomQueryOptions = {}
) =>
  useQuery<ResourcesData, ResponseError, TData>({
    queryKey: resourceKeys.list(projectRef),
    queryFn: ({ signal }) => getResources({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
```

### 5.2 Redis Data Hooks

**Create**: `apps/studio/data/redis/`

#### redis-keys-query.ts

```typescript
import { useQuery } from '@tanstack/react-query'
import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { redisKeys } from './keys'

export type RedisKeysVariables = {
  projectRef?: string
  pattern?: string
  type?: 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream'
  cursor?: string
  count?: number
}

export async function getRedisKeys(
  { projectRef, pattern = '*', type, cursor = '0', count = 100 }: RedisKeysVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')

  const { data, error } = await get('/v1/projects/{ref}/redis/keys', {
    params: {
      path: { ref: projectRef },
      query: { pattern, type, cursor, count },
    },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type RedisKeysData = Awaited<ReturnType<typeof getRedisKeys>>
export type RedisKeysError = ResponseError

export const useRedisKeysQuery = <TData = RedisKeysData>(
  { projectRef, pattern, type, cursor, count }: RedisKeysVariables,
  { enabled = true, ...options }: UseCustomQueryOptions<RedisKeysData, RedisKeysError, TData> = {}
) =>
  useQuery<RedisKeysData, RedisKeysError, TData>({
    queryKey: redisKeys.list(projectRef, { pattern, type, cursor, count }),
    queryFn: ({ signal }) => getRedisKeys({ projectRef, pattern, type, cursor, count }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
```

#### redis-key-detail-query.ts

```typescript
import { useQuery } from '@tanstack/react-query'
import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { redisKeys } from './keys'

export type RedisKeyDetailVariables = {
  projectRef?: string
  key: string
}

export async function getRedisKeyDetail(
  { projectRef, key }: RedisKeyDetailVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')
  if (!key) throw new Error('key is required')

  const { data, error } = await get('/v1/projects/{ref}/redis/keys/{key}', {
    params: {
      path: { ref: projectRef, key: encodeURIComponent(key) },
    },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type RedisKeyDetailData = Awaited<ReturnType<typeof getRedisKeyDetail>>
export type RedisKeyDetailError = ResponseError

export const useRedisKeyDetailQuery = <TData = RedisKeyDetailData>(
  { projectRef, key }: RedisKeyDetailVariables,
  { enabled = true, ...options }: UseCustomQueryOptions<RedisKeyDetailData, RedisKeyDetailError, TData> = {}
) =>
  useQuery<RedisKeyDetailData, RedisKeyDetailError, TData>({
    queryKey: redisKeys.detail(projectRef, key),
    queryFn: ({ signal }) => getRedisKeyDetail({ projectRef, key }, signal),
    enabled: enabled && typeof projectRef !== 'undefined' && !!key,
    ...options,
  })
```

#### redis-set-mutation.ts

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { put, handleError } from 'data/fetchers'
import type { ResponseError } from 'types'
import { redisKeys } from './keys'

export type RedisSetVariables = {
  projectRef: string
  key: string
  value: any
  ttl?: number
}

export async function setRedisKey({ projectRef, key, value, ttl }: RedisSetVariables) {
  const { data, error } = await put('/v1/projects/{ref}/redis/keys/{key}', {
    params: {
      path: { ref: projectRef, key: encodeURIComponent(key) },
    },
    body: { value, ttl },
  })

  if (error) handleError(error)
  return data
}

export const useRedisSetMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: setRedisKey,
    onSuccess: (data, variables) => {
      const { projectRef, key } = variables

      // Invalidate affected queries
      queryClient.invalidateQueries({ queryKey: redisKeys.lists() })
      queryClient.invalidateQueries({ queryKey: redisKeys.detail(projectRef, key) })

      toast.success(`Key "${key}" updated successfully`)
    },
    onError: (error: ResponseError) => {
      toast.error(`Failed to update key: ${error.message}`)
    },
  })
}
```

#### keys.ts (Query Key Factory)

```typescript
export const redisKeys = {
  all: () => ['redis'] as const,
  lists: () => [...redisKeys.all(), 'list'] as const,
  list: (projectRef: string | undefined, filters?: Record<string, any>) =>
    [...redisKeys.lists(), projectRef, filters] as const,
  details: () => [...redisKeys.all(), 'detail'] as const,
  detail: (projectRef: string | undefined, key: string) =>
    [...redisKeys.details(), projectRef, key] as const,
  info: (projectRef: string | undefined) =>
    [...redisKeys.all(), 'info', projectRef] as const,
}
```

### 5.3 MongoDB Data Hooks

**Create**: `apps/studio/data/mongodb/`

#### mongodb-databases-query.ts

```typescript
import { useQuery } from '@tanstack/react-query'
import { get, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { mongodbKeys } from './keys'

export type MongoDBDatabasesVariables = {
  projectRef?: string
}

export async function getMongoDBDatabases(
  { projectRef }: MongoDBDatabasesVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')

  const { data, error } = await get('/v1/projects/{ref}/mongodb/databases', {
    params: {
      path: { ref: projectRef },
    },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type MongoDBDatabasesData = Awaited<ReturnType<typeof getMongoDBDatabases>>
export type MongoDBDatabasesError = ResponseError

export const useMongoDBDatabasesQuery = <TData = MongoDBDatabasesData>(
  { projectRef }: MongoDBDatabasesVariables,
  { enabled = true, ...options }: UseCustomQueryOptions<MongoDBDatabasesData, MongoDBDatabasesError, TData> = {}
) =>
  useQuery<MongoDBDatabasesData, MongoDBDatabasesError, TData>({
    queryKey: mongodbKeys.databases(projectRef),
    queryFn: ({ signal }) => getMongoDBDatabases({ projectRef }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
```

#### mongodb-documents-query.ts

```typescript
import { useQuery } from '@tanstack/react-query'
import { post, handleError } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { mongodbKeys } from './keys'

export type MongoDBDocumentsVariables = {
  projectRef?: string
  database: string
  collection: string
  filter?: Record<string, any>
  projection?: Record<string, number>
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
}

export async function getMongoDBDocuments(
  {
    projectRef,
    database,
    collection,
    filter = {},
    projection,
    sort,
    limit = 20,
    skip = 0
  }: MongoDBDocumentsVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')
  if (!database) throw new Error('database is required')
  if (!collection) throw new Error('collection is required')

  const { data, error } = await post('/v1/projects/{ref}/mongodb/query', {
    params: {
      path: { ref: projectRef },
    },
    body: {
      database,
      collection,
      filter,
      projection,
      sort,
      limit,
      skip,
    },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type MongoDBDocumentsData = Awaited<ReturnType<typeof getMongoDBDocuments>>
export type MongoDBDocumentsError = ResponseError

export const useMongoDBDocumentsQuery = <TData = MongoDBDocumentsData>(
  { projectRef, database, collection, filter, projection, sort, limit, skip }: MongoDBDocumentsVariables,
  { enabled = true, ...options }: UseCustomQueryOptions<MongoDBDocumentsData, MongoDBDocumentsError, TData> = {}
) =>
  useQuery<MongoDBDocumentsData, MongoDBDocumentsError, TData>({
    queryKey: mongodbKeys.documents(projectRef, database, collection, {
      filter,
      projection,
      sort,
      limit,
      skip
    }),
    queryFn: ({ signal }) =>
      getMongoDBDocuments({
        projectRef,
        database,
        collection,
        filter,
        projection,
        sort,
        limit,
        skip
      }, signal),
    enabled: enabled &&
      typeof projectRef !== 'undefined' &&
      !!database &&
      !!collection,
    ...options,
  })
```

#### mongodb-document-update-mutation.ts

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { put, handleError } from 'data/fetchers'
import type { ResponseError } from 'types'
import { mongodbKeys } from './keys'

export type MongoDBDocumentUpdateVariables = {
  projectRef: string
  database: string
  collection: string
  filter: Record<string, any>
  update: Record<string, any>
  upsert?: boolean
}

export async function updateMongoDBDocument({
  projectRef,
  database,
  collection,
  filter,
  update,
  upsert = false,
}: MongoDBDocumentUpdateVariables) {
  const { data, error } = await put('/v1/projects/{ref}/mongodb/documents', {
    params: {
      path: { ref: projectRef },
    },
    body: {
      database,
      collection,
      filter,
      update,
      upsert,
    },
  })

  if (error) handleError(error)
  return data
}

export const useMongoDBDocumentUpdateMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateMongoDBDocument,
    onSuccess: (data, variables) => {
      const { projectRef, database, collection } = variables

      // Invalidate affected queries
      queryClient.invalidateQueries({
        queryKey: mongodbKeys.documents(projectRef, database, collection)
      })

      toast.success('Document updated successfully')
    },
    onError: (error: ResponseError) => {
      toast.error(`Failed to update document: ${error.message}`)
    },
  })
}
```

#### keys.ts (Query Key Factory)

```typescript
export const mongodbKeys = {
  all: () => ['mongodb'] as const,
  databases: (projectRef: string | undefined) =>
    [...mongodbKeys.all(), 'databases', projectRef] as const,
  collections: (projectRef: string | undefined, database: string) =>
    [...mongodbKeys.all(), 'collections', projectRef, database] as const,
  documents: (
    projectRef: string | undefined,
    database: string,
    collection: string,
    filters?: Record<string, any>
  ) =>
    [...mongodbKeys.all(), 'documents', projectRef, database, collection, filters] as const,
  aggregations: (projectRef: string | undefined, database: string, collection: string) =>
    [...mongodbKeys.all(), 'aggregations', projectRef, database, collection] as const,
}
```

### 5.4 State Management

**Use Existing Patterns:**

1. **React Query** for server state (queries/mutations)
2. **Local Component State** (useState) for UI state
3. **URL State** (useUrlState hook) for shareable filters
4. **Valtio Proxy State** for global UI state (if needed)

**Example - Redis Key Browser State:**

```typescript
// In component
const [searchPattern, setSearchPattern] = useState('*')
const [typeFilter, setTypeFilter] = useState<RedisDataType | 'all'>('all')
const [cursor, setCursor] = useState('0')

// URL state for shareability
const [{ pattern, type }, setUrlState] = useUrlState({
  keys: {
    pattern: 'pattern',
    type: 'type',
  }
})

// Server state
const { data: keys, isLoading } = useRedisKeysQuery({
  projectRef,
  pattern: pattern || searchPattern,
  type: type || typeFilter,
  cursor,
})
```

### 5.5 Real-time Updates

**For Redis Monitor:**

```typescript
// Use WebSocket connection
import { useEffect, useState } from 'react'

export const useRedisMonitor = (projectRef: string) => {
  const [commands, setCommands] = useState<RedisCommand[]>([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const ws = new WebSocket(`wss://api.supabase.io/v1/projects/${projectRef}/redis/monitor`)

    ws.onopen = () => setIsConnected(true)
    ws.onclose = () => setIsConnected(false)

    ws.onmessage = (event) => {
      const command = JSON.parse(event.data)
      setCommands((prev) => [command, ...prev].slice(0, 1000)) // Keep last 1000
    }

    return () => ws.close()
  }, [projectRef])

  return { commands, isConnected }
}
```

---

## 6. Routing & Navigation Strategy

### 6.1 Route Structure

**Redis Routes** (`pages/project/[ref]/redis/`):

```
/project/[ref]/redis/keys              → Key browser
/project/[ref]/redis/keys/[key]        → Key detail (dynamic)
/project/[ref]/redis/commands          → Command console
/project/[ref]/redis/monitor           → Real-time monitor
/project/[ref]/redis/settings          → Settings
/project/[ref]/redis/info              → Server info
```

**MongoDB Routes** (`pages/project/[ref]/mongodb/`):

```
/project/[ref]/mongodb/databases                    → Database list
/project/[ref]/mongodb/collections                  → Collections (+ query param ?db=)
/project/[ref]/mongodb/documents                    → Documents (+ query params)
/project/[ref]/mongodb/documents/[id]               → Document detail
/project/[ref]/mongodb/aggregations                 → Aggregation builder
/project/[ref]/mongodb/shell                        → MongoDB shell
/project/[ref]/mongodb/indexes                      → Index management
/project/[ref]/mongodb/users                        → Users & roles
/project/[ref]/mongodb/settings                     → Settings
```

### 6.2 Example Page Implementation

**Redis Keys Page** (`pages/project/[ref]/redis/keys.tsx`):

```typescript
import RedisLayout from 'components/layouts/RedisLayout/RedisLayout'
import { RedisKeyBrowser } from 'components/interfaces/Redis/RedisKeyBrowser'
import type { NextPageWithLayout } from 'types'

const RedisKeys: NextPageWithLayout = () => {
  return <RedisKeyBrowser />
}

RedisKeys.getLayout = (page) => (
  <RedisLayout title="Redis Keys">
    {page}
  </RedisLayout>
)

export default RedisKeys
```

**MongoDB Documents Page** (`pages/project/[ref]/mongodb/documents.tsx`):

```typescript
import MongoDBLayout from 'components/layouts/MongoDBLayout/MongoDBLayout'
import { MongoDBDocumentBrowser } from 'components/interfaces/MongoDB/MongoDBDocumentBrowser'
import type { NextPageWithLayout } from 'types'

const MongoDBDocuments: NextPageWithLayout = () => {
  return <MongoDBDocumentBrowser />
}

MongoDBDocuments.getLayout = (page) => (
  <MongoDBLayout title="MongoDB Documents">
    {page}
  </MongoDBLayout>
)

export default MongoDBDocuments
```

### 6.3 Navigation Flow

**User Journey - Managing Redis:**

1. Click **Redis** in main sidebar
2. Lands on `/project/[ref]/redis/keys` (default)
3. Left product menu shows:
   - Data Management: Keys, Commands, Monitor
   - Configuration: Settings, Info
4. Click key from list → Navigate to `/project/[ref]/redis/keys/[key]`
5. View/edit key value inline
6. Navigate back to key list

**User Journey - Managing MongoDB:**

1. Click **MongoDB** in main sidebar
2. Lands on `/project/[ref]/mongodb/databases`
3. Select database → Navigate to collections view
4. Select collection → Navigate to documents with query params
5. Filter/search documents
6. Click document → Navigate to document editor
7. Edit JSON, save changes

### 6.4 Feature Flags

**Control visibility via feature flags:**

```typescript
// In NavigationBar.utils.tsx
export const generateProductRoutes = (ref, project, features) => {
  const {
    redis: redisEnabled,
    mongodb: mongodbEnabled,
  } = useIsFeatureEnabled([
    'project_redis:all',
    'project_mongodb:all',
  ])

  return [
    { key: 'database', ... },
    ...(redisEnabled ? [redisRoute] : []),
    ...(mongodbEnabled ? [mongodbRoute] : []),
    ...
  ]
}
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Tasks:**
- [ ] Create Redis & MongoDB layouts
- [ ] Add navigation items to sidebar
- [ ] Set up routing structure (all pages)
- [ ] Create data layer structure (hooks, keys)
- [ ] Design icon components (Redis, MongoDB icons)
- [ ] Set up feature flags

**Deliverables:**
- Navigation visible in sidebar (feature-flagged)
- Empty pages with correct layouts
- Data hooks ready (mocked responses)

### Phase 2: Redis MVP (Week 3-4)

**Tasks:**
- [ ] Implement Redis Key Browser
  - Key list with type filtering
  - Search/pattern matching
  - Pagination
- [ ] Implement Redis Key Detail views
  - String value editor
  - Hash field table
  - List viewer
  - Set viewer
- [ ] Backend API integration
  - Connect data hooks to real APIs
  - Error handling
- [ ] Basic operations
  - View, edit, delete keys
  - Set TTL

**Deliverables:**
- Functional Redis key management
- CRUD operations working
- Connected to live Redis instance

### Phase 3: MongoDB MVP (Week 5-6)

**Tasks:**
- [ ] Implement MongoDB Database Browser
  - Database list
  - Stats display
- [ ] Implement MongoDB Collection Browser
  - Collection list
  - Schema inference
- [ ] Implement MongoDB Document Browser
  - Table view
  - Query builder (basic)
  - Pagination
- [ ] Implement MongoDB Document Editor
  - JSON editor
  - CRUD operations
- [ ] Backend API integration

**Deliverables:**
- Functional MongoDB document management
- Basic querying capability
- CRUD operations working

### Phase 4: Advanced Redis Features (Week 7-8)

**Tasks:**
- [ ] Redis Command Console
  - Command execution
  - Auto-complete
  - History
- [ ] Redis Monitor
  - Live command stream
  - Filtering
  - Stats
- [ ] Redis Info & Settings
  - Server info display
  - Configuration management
- [ ] Advanced data type support
  - Sorted Sets
  - Streams

**Deliverables:**
- Full Redis management capability
- Real-time monitoring
- Advanced operations

### Phase 5: Advanced MongoDB Features (Week 9-10)

**Tasks:**
- [ ] MongoDB Aggregation Pipeline Builder
  - Visual pipeline builder
  - Stage templates
  - Live preview
- [ ] MongoDB Index Management
  - Index analyzer
  - Create/drop indexes
- [ ] MongoDB Users & Roles
  - User management
  - Role assignment
- [ ] Advanced query features
  - Complex filters
  - Multiple views (Tree, Form)

**Deliverables:**
- Full MongoDB management capability
- Aggregation pipeline support
- Advanced querying

### Phase 6: Polish & Optimization (Week 11-12)

**Tasks:**
- [ ] Performance optimization
  - Virtualization for large datasets
  - Query caching
- [ ] UX improvements
  - Loading states
  - Error messages
  - Empty states
- [ ] Documentation
  - User guides
  - API docs
  - Component documentation
- [ ] Testing
  - Unit tests for components
  - Integration tests for data hooks
  - E2E tests for critical flows
- [ ] Accessibility
  - Keyboard navigation
  - Screen reader support
  - ARIA labels

**Deliverables:**
- Production-ready Redis & MongoDB management
- Full test coverage
- Comprehensive documentation

---

## Summary

### Key Architectural Decisions

1. **Unified Pattern**: Follow existing Supabase Studio patterns (DatabaseLayout, StorageLayout)
2. **Component Reuse**: Leverage 165+ existing UI components
3. **Data Layer**: React Query for all server state management
4. **Feature Flags**: Gate Redis/MongoDB features behind flags
5. **Progressive Enhancement**: Start with MVP, add advanced features iteratively

### Extension Points Summary

| Aspect | Location | Action |
|--------|----------|--------|
| **Navigation** | `NavigationBar.utils.tsx` | Add Redis/MongoDB routes |
| **Layouts** | `components/layouts/` | Create RedisLayout, MongoDBLayout |
| **Pages** | `pages/project/[ref]/` | Create redis/, mongodb/ directories |
| **Data Hooks** | `data/` | Create redis/, mongodb/ directories |
| **Components** | `components/interfaces/` | Create Redis/, MongoDB/ components |

### Technical Stack

- **Frontend**: React, TypeScript, Next.js
- **State**: React Query (TanStack Query)
- **UI Components**: Radix UI, Tailwind CSS
- **Data Fetching**: Custom fetch wrapper with error handling
- **Real-time**: WebSocket for monitoring features

### Success Metrics

- **Performance**: Page load <2s, interactions <100ms
- **Scalability**: Handle 100k+ keys/documents
- **UX**: Cohesive with existing Postgres UI
- **Accessibility**: WCAG 2.1 AA compliance
- **Test Coverage**: >80% unit, >60% integration

---

**End of Document**
