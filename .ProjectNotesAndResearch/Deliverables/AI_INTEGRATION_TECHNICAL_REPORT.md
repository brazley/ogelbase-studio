# AI Integration Architecture - Technical Investigation Report

**Date:** 2025-11-20
**Codebase:** Supabase Studio
**Current Provider:** OpenAI (with AWS Bedrock support)

---

## Executive Summary

The Supabase Studio codebase has a **well-architected, moderately abstracted** AI integration that currently supports both OpenAI and AWS Bedrock as providers. The architecture uses Vercel's AI SDK as an abstraction layer, making provider switching feasible but requiring moderate effort. The integration is primarily used for:

1. **AI Assistant Panel** - Chat-based SQL/database help
2. **Code Completion** - SQL and Edge Function code suggestions
3. **Schema Generation** - Automated database schema creation
4. **Feedback Classification** - Support ticket categorization
5. **SQL Debugging & Title Generation** - Developer tooling

**Difficulty Assessment:** Medium - Provider switching would require updating configuration and testing, but the abstraction layer minimizes code changes.

---

## 1. Architecture Overview

### 1.1 Core Architecture Pattern

```
User Interface (React Components)
         ↓
API Routes (/pages/api/ai/*)
         ↓
Model Selection Layer (lib/ai/model.ts)
         ↓
Vercel AI SDK (@ai-sdk/*)
         ↓
Provider SDKs (OpenAI / Bedrock)
```

### 1.2 Key Dependencies

**From package.json:**
```json
{
  "@ai-sdk/amazon-bedrock": "^3.0.0",
  "@ai-sdk/openai": "2.0.32",
  "@ai-sdk/provider": "^2.0.0",
  "@ai-sdk/react": "2.0.45",
  "@aws-sdk/credential-providers": "^3.804.0",
  "ai": "5.0.45",
  "openai": "^4.75.1"
}
```

**Benefits:**
- Vercel AI SDK provides unified interface across providers
- Already supports multiple providers (OpenAI, Bedrock)
- Type-safe with TypeScript throughout

---

## 2. Integration Points - Detailed Analysis

### 2.1 Central Model Selection Layer

**File:** `/apps/studio/lib/ai/model.ts`

**Key Function:** `getModel()`

```typescript
export async function getModel({
  provider?: ProviderName,     // 'openai' | 'bedrock' | 'anthropic'
  model?: Model,                // Specific model ID
  routingKey: string,           // For load balancing
  isLimited?: boolean,          // Free tier flag
}: GetModelParams): Promise<ModelResponse>
```

**Provider Selection Logic:**
1. Checks for explicit provider parameter
2. Auto-detects available credentials:
   - Prefers AWS Bedrock if `AWS_BEDROCK_ROLE_ARN` + credentials exist
   - Falls back to OpenAI if `OPENAI_API_KEY` exists
3. Returns appropriate model instance via AI SDK

**Supported Models:**

```typescript
// OpenAI Models
'gpt-5'           // Default for paid plans
'gpt-5-mini'      // Default for free tier

// Bedrock Models
'anthropic.claude-3-7-sonnet-20250219-v1:0'
'openai.gpt-oss-120b-1:0'  // OpenAI via Bedrock

// Anthropic (direct)
'claude-sonnet-4-20250514'
'claude-3-5-haiku-20241022'
```

---

### 2.2 API Routes (User-Facing Features)

All AI endpoints are located in `/apps/studio/pages/api/ai/`

#### Primary Endpoints:

| Endpoint | Purpose | Model Used | Provider Config |
|----------|---------|------------|-----------------|
| `/api/ai/sql/generate-v4.ts` | Main AI Assistant chat | gpt-5 / gpt-5-mini | Configurable via request |
| `/api/ai/code/complete.ts` | Code completion in editor | gpt-5-mini (limited) | Always limited model |
| `/api/ai/feedback/classify.ts` | Support ticket classification | gpt-5-mini | Fixed to OpenAI |
| `/api/ai/sql/title-v2.ts` | Generate SQL snippet titles | gpt-5-mini | OpenAI only |
| `/api/ai/sql/cron-v2.ts` | Generate cron schedules | gpt-5 | OpenAI preferred |
| `/api/ai/table-quickstart/generate-schemas.ts` | Schema generation | gpt-5 | OpenAI |
| `/api/ai/onboarding/design.ts` | Onboarding schema design | gpt-5 | OpenAI |
| `/api/ai/docs.ts` | Documentation search | Unknown | Unknown |

**Example Usage Pattern (from generate-v4.ts:148-153):**

```typescript
const {
  model,
  error: modelError,
  promptProviderOptions,
  providerOptions,
} = await getModel({
  provider: 'openai',        // ← Hardcoded here
  model: requestedModel ?? 'gpt-5',
  routingKey: projectRef,
  isLimited,
})
```

**Key Finding:** Most routes explicitly specify `provider: 'openai'`, limiting flexibility.

---

### 2.3 Frontend Components

**Main Component:** `/apps/studio/components/ui/AIAssistantPanel/AIAssistant.tsx`

**State Management:** `/apps/studio/state/ai-assistant-state.tsx`
- Stores chat sessions in IndexedDB
- Model selection: `gpt-5` or `gpt-5-mini`
- Message history with tool call results

**Model Selection UI:**
```typescript
// Line 68-77 from AIAssistant.tsx
const selectedModel = useMemo<AssistantModel>(() => {
  const defaultModel: AssistantModel = isPaidPlan ? 'gpt-5' : 'gpt-5-mini'
  const model = snap.model ?? defaultModel

  if (!isPaidPlan && model === 'gpt-5') {
    return 'gpt-5-mini'
  }

  return model
}, [isPaidPlan, snap.model])
```

**Chat Transport (Line 202-226):**
```typescript
transport: new DefaultChatTransport({
  api: `${BASE_PATH}/api/ai/sql/generate-v4`,
  async prepareSendMessagesRequest({ messages, ...options }) {
    return {
      body: {
        messages: cleanedMessages,
        projectRef: project?.ref,
        connectionString: project?.connectionString,
        orgSlug: selectedOrganizationRef.current?.slug,
        model: selectedModel,  // ← User-selectable
      },
    }
  },
})
```

---

### 2.4 Bedrock Configuration

**File:** `/apps/studio/lib/ai/bedrock.ts`

**Multi-Region Load Balancing:**
```typescript
const modelRegionWeights: Record<BedrockModel, RegionWeights> = {
  ['anthropic.claude-3-7-sonnet-20250219-v1:0']: {
    use1: 40,  // US East 1 - 40% of traffic
    use2: 10,  // US East 2 - 10%
    usw2: 10,  // US West 2 - 10%
    euc1: 10,  // EU Central 1 - 10%
  },
  ['openai.gpt-oss-120b-1:0']: {
    usw2: 30,  // Only in US West 2
  },
}
```

**Credential Chain:**
1. Vercel OIDC Provider (production/staging)
2. AWS Profile (local development)
3. Environment: `AWS_BEDROCK_ROLE_ARN` + `AWS_BEDROCK_PROFILE`

---

## 3. Configuration & Environment Variables

### 3.1 Required Environment Variables

**OpenAI Configuration:**
```bash
OPENAI_API_KEY=sk-...        # Required for OpenAI provider
```

**AWS Bedrock Configuration:**
```bash
AWS_BEDROCK_ROLE_ARN=arn:aws:iam::...  # Required for production
AWS_BEDROCK_PROFILE=default             # Optional, for local dev
```

**Platform Detection:**
```bash
IS_PLATFORM=true              # Enables full platform features
IS_THROTTLED=false            # Bypasses rate limiting
```

### 3.2 Configuration Files

**No AI-specific config files found.** Configuration is entirely environment-variable driven.

**Checked locations:**
- `/apps/studio/.env` - Local development config (not committed)
- `/apps/studio/.env.production` - Production config (not committed)
- No `config/ai.ts` or similar centralized config

---

## 4. Feature Functionality Analysis

### 4.1 AI Assistant Chat (Primary Feature)

**Entry Point:** AI Assistant Panel (right sidebar)

**Capabilities:**
- SQL query generation and debugging
- Database schema recommendations
- RLS (Row-Level Security) policy generation
- Edge Function code generation
- Real-time suggestions
- Multi-turn conversations with context

**Tools Available:**
```typescript
// From lib/ai/tools/index.ts
- getRenderingTools()        // Display results
- getFallbackTools()         // Self-hosted mode
- getMcpTools()              // Platform-specific tools
- getSchemaTools()           // Database introspection
```

**AI Opt-In Levels:**
```typescript
type AiOptInLevel =
  | 'disabled'    // No AI features
  | 'schema'      // Schema metadata only
  | 'data'        // Full data access
```

**Prompts:** `/apps/studio/lib/ai/prompts.ts`
- `GENERAL_PROMPT` - Base system prompt
- `CHAT_PROMPT` - Conversation rules
- `PG_BEST_PRACTICES` - PostgreSQL guidelines
- `RLS_PROMPT` - Row-Level Security patterns
- `EDGE_FUNCTION_PROMPT` - Deno/Edge Function rules
- `REALTIME_PROMPT` - Supabase Realtime best practices
- `SECURITY_PROMPT` - Security guidelines

### 4.2 Code Completion

**Entry Point:** Monaco Editor in SQL Editor

**File:** `/apps/studio/pages/api/ai/code/complete.ts`

**Behavior:**
- Triggered on text selection + command
- Context: `textBeforeCursor`, `textAfterCursor`, `selection`
- Returns only modified text (no markdown wrapping)
- Always uses limited model (`gpt-5-mini`)

**Provider:** Hardcoded to OpenAI (Line 72):
```typescript
const { model } = await getModel({
  provider: 'openai',    // ← Fixed
  routingKey: projectRef,
})
```

### 4.3 Schema Generation

**Multiple Entry Points:**
1. Project onboarding flow
2. Table quickstart wizard
3. AI-powered schema designer

**File:** `/apps/studio/pages/api/ai/table-quickstart/generate-schemas.ts`

**Uses:** Structured output with Zod schemas for validation

---

## 5. Provider Coupling Analysis

### 5.1 Tight Coupling Points

**Hard-Coded Provider References:**

1. **SQL Generation (generate-v4.ts:149):**
   ```typescript
   provider: 'openai'  // Explicit
   ```

2. **Code Completion (complete.ts:72):**
   ```typescript
   provider: 'openai'  // Explicit
   ```

3. **Feedback Classification (classify.ts:32):**
   ```typescript
   provider: 'openai'  // Explicit
   ```

4. **Multiple other endpoints** similarly hardcode `'openai'`

### 5.2 Abstraction Strengths

**Well-Abstracted Areas:**

1. **AI SDK Integration:**
   - All model calls go through Vercel AI SDK
   - Provider-agnostic API: `streamText()`, `generateText()`, `generateObject()`
   - No direct OpenAI SDK calls in main routes

2. **Model Selection Layer:**
   - Centralized in `lib/ai/model.ts`
   - Supports runtime provider switching
   - Credential auto-detection

3. **Tool System:**
   - Provider-independent tool definitions
   - JSON schema-based tool contracts

### 5.3 Provider-Specific Features

**OpenAI-Specific:**
```typescript
// model.utils.ts:56-59
providerOptions: {
  openai: {
    reasoningEffort: 'minimal',  // OpenAI o1/o3 models
  },
}
```

**Bedrock-Specific:**
```typescript
// model.utils.ts:37-42
promptProviderOptions: {
  bedrock: {
    cachePoint: { type: 'default' },  // Prompt caching
  },
}
```

---

## 6. Switching Difficulty Assessment

### 6.1 Effort Required: **MEDIUM** (3-5 days)

### 6.2 Changes Needed

#### Step 1: Add New Provider Support
**Estimated Time:** 1-2 hours

**File:** `/apps/studio/lib/ai/model.utils.ts`

Add provider configuration:
```typescript
export type ProviderName = 'bedrock' | 'openai' | 'anthropic' | 'google' // ← Add new

export type GoogleModel = 'gemini-1.5-pro' | 'gemini-1.5-flash'  // ← Add models

export const PROVIDERS: ProviderRegistry = {
  // ... existing providers
  google: {
    models: {
      'gemini-1.5-pro': { default: false },
      'gemini-1.5-flash': { default: true },
    },
  },
}
```

**File:** `/apps/studio/lib/ai/model.ts`

Add provider initialization:
```typescript
import { google } from '@ai-sdk/google'  // ← Add import

export async function getModel({ ... }) {
  // ... existing credential checks

  const hasGoogleKey = !!process.env.GOOGLE_GENAI_API_KEY  // ← Add check

  if (!preferredProvider) {
    if (hasAwsBedrockRoleArn && hasAwsCredentials) {
      preferredProvider = 'bedrock'
    } else if (hasGoogleKey) {
      preferredProvider = 'google'  // ← Add fallback
    } else if (hasOpenAIKey) {
      preferredProvider = 'openai'
    }
  }

  // ... existing provider handling

  if (preferredProvider === 'google') {  // ← Add handler
    if (!hasGoogleKey) {
      return { error: new Error('GOOGLE_GENAI_API_KEY not available') }
    }
    return {
      model: google(chosenModelId as GoogleModel),
      promptProviderOptions: models[chosenModelId]?.promptProviderOptions,
    }
  }
}
```

#### Step 2: Remove Hardcoded Provider References
**Estimated Time:** 2-3 hours

**Files to Update:**
- `/apps/studio/pages/api/ai/sql/generate-v4.ts` (Line 149)
- `/apps/studio/pages/api/ai/code/complete.ts` (Line 72)
- `/apps/studio/pages/api/ai/feedback/classify.ts` (Line 32)
- `/apps/studio/pages/api/ai/sql/title-v2.ts`
- `/apps/studio/pages/api/ai/sql/cron-v2.ts`
- `/apps/studio/pages/api/ai/onboarding/design.ts`
- `/apps/studio/pages/api/ai/table-quickstart/generate-schemas.ts`

**Change Pattern:**
```typescript
// Before
const { model } = await getModel({
  provider: 'openai',  // ← Remove this
  model: requestedModel,
  routingKey: projectRef,
})

// After
const { model } = await getModel({
  // provider auto-detected from env vars
  model: requestedModel,
  routingKey: projectRef,
})
```

#### Step 3: Update Environment Variables
**Estimated Time:** 15 minutes

**Add to `.env` files:**
```bash
# Option 1: Google AI
GOOGLE_GENAI_API_KEY=...

# Option 2: Anthropic
ANTHROPIC_API_KEY=...

# Option 3: Keep OpenAI (no changes)
OPENAI_API_KEY=...

# Option 4: AWS Bedrock (already supported)
AWS_BEDROCK_ROLE_ARN=...
```

#### Step 4: Update UI Model Selection
**Estimated Time:** 1-2 hours

**File:** `/apps/studio/components/ui/AIAssistantPanel/AIAssistant.tsx`

Update model selector to support new models:
```typescript
export type AssistantModel =
  | 'gpt-5'
  | 'gpt-5-mini'
  | 'gemini-1.5-pro'      // ← Add new
  | 'gemini-1.5-flash'    // ← Add new
  | 'claude-sonnet-4'     // ← Add new
```

**File:** `/apps/studio/components/ui/AIAssistantPanel/ModelSelector.tsx`

Add new model options to dropdown.

#### Step 5: Testing
**Estimated Time:** 1-2 days

Test all AI features with new provider:
- [ ] AI Assistant chat conversations
- [ ] Code completion in SQL Editor
- [ ] Schema generation
- [ ] Feedback classification
- [ ] SQL debugging
- [ ] Title generation
- [ ] Multi-turn conversations
- [ ] Tool calling functionality
- [ ] Streaming responses
- [ ] Error handling

---

## 7. Alternative Approaches

### 7.1 Environment-Based Provider Selection (Easiest)

**Current Behavior:** Already implemented!

The `getModel()` function already supports auto-detection based on environment variables. Simply:

1. **Remove** `OPENAI_API_KEY` from environment
2. **Add** new provider key (e.g., `GOOGLE_GENAI_API_KEY`)
3. **Update** all hardcoded `provider: 'openai'` to `provider: undefined` (or omit)

**Pros:**
- Minimal code changes
- Uses existing architecture
- Easy rollback

**Cons:**
- Cannot mix providers within same deployment
- Requires restart to switch providers

### 7.2 Dynamic Provider Configuration (Moderate)

Add runtime provider selection via organization settings:

```typescript
// New function in lib/ai/org-ai-details.ts
export async function getOrgPreferredProvider(orgSlug: string) {
  // Fetch from database: organizations.ai_provider
  return preferredProvider ?? 'openai'  // Default fallback
}

// Usage in API routes
const provider = await getOrgPreferredProvider(orgSlug)
const { model } = await getModel({ provider, ... })
```

**Pros:**
- Per-organization provider selection
- Easy A/B testing
- Gradual migration path

**Cons:**
- Requires database schema changes
- More complex configuration
- Potential cost tracking complications

### 7.3 Multi-Provider Fallback Chain (Advanced)

Implement automatic failover between providers:

```typescript
async function getModelWithFallback(params: GetModelParams) {
  const providers: ProviderName[] = ['bedrock', 'openai', 'google']

  for (const provider of providers) {
    const result = await getModel({ ...params, provider })
    if (!result.error) return result
  }

  return { error: new Error('No providers available') }
}
```

**Pros:**
- High availability
- Automatic failover
- Cost optimization (use cheaper provider first)

**Cons:**
- Complex error handling
- Difficult to debug
- Inconsistent model capabilities

---

## 8. Recommended Implementation Strategy

### Phase 1: Preparation (Week 1)

1. **Audit all API routes** and create comprehensive test coverage
2. **Set up new provider credentials** in staging environment
3. **Add provider to model.ts** with proper SDK integration
4. **Update environment variable documentation**

### Phase 2: Backend Migration (Week 2)

1. **Remove hardcoded provider references** from all API routes
2. **Deploy to staging** with new provider as primary
3. **Run integration tests** against all AI features
4. **Monitor error rates and performance**

### Phase 3: Frontend Updates (Week 3)

1. **Update model selector** to show new provider models
2. **Update UI messaging** (remove "OpenAI" branding if needed)
3. **Add provider status indicators** (optional)

### Phase 4: Rollout (Week 4)

1. **Gradual rollout** to production (10% → 50% → 100%)
2. **Monitor costs** and performance metrics
3. **A/B test** user satisfaction with new provider
4. **Document changes** for team

---

## 9. Risk Assessment

### High Risk Areas

1. **Breaking Changes:**
   - Tool calling format differences between providers
   - Streaming response format variations
   - Token counting differences (affects rate limiting)

2. **Cost Implications:**
   - Different pricing models (input/output tokens)
   - Prompt caching availability
   - Batch processing capabilities

3. **Performance:**
   - Latency differences between providers
   - Rate limiting policies
   - Regional availability

### Mitigation Strategies

1. **Comprehensive Testing:**
   - Create test suite covering all AI endpoints
   - Test with various prompt types and lengths
   - Validate tool calling with different schemas

2. **Gradual Rollout:**
   - Deploy to staging first
   - Use feature flags for controlled rollout
   - Monitor error rates closely

3. **Fallback Plans:**
   - Keep OpenAI credentials as backup
   - Implement provider health checks
   - Cache responses where appropriate

---

## 10. Cost Comparison Example

**Assumptions:**
- 1M tokens/day total usage
- 70% input tokens, 30% output tokens

### Current Setup (OpenAI GPT-4o)

| Model | Input | Output | Daily Cost |
|-------|-------|--------|------------|
| gpt-4o | $2.50/1M | $10.00/1M | $3.25/day |
| gpt-4o-mini | $0.15/1M | $0.60/1M | $0.285/day |

**Total:** ~$3.50/day (~$105/month)

### Alternative Providers

**Google Gemini:**
| Model | Input | Output | Daily Cost |
|-------|-------|--------|------------|
| gemini-1.5-pro | $1.25/1M | $5.00/1M | $2.375/day |
| gemini-1.5-flash | $0.075/1M | $0.30/1M | $0.143/day |

**Potential Savings:** 30-50%

**Anthropic Claude:**
| Model | Input | Output | Daily Cost |
|-------|-------|--------|------------|
| claude-sonnet-4 | $3.00/1M | $15.00/1M | $6.00/day |
| claude-haiku | $0.25/1M | $1.25/1M | $0.55/day |

**Comparison:** Similar to higher cost, cheaper with Haiku

**AWS Bedrock (already supported):**
- Additional 25% markup on base model pricing
- BUT: Prompt caching can reduce costs 90% for repeated system prompts

---

## 11. Testing Checklist

### Unit Tests
- [ ] `getModel()` returns correct provider based on env vars
- [ ] Provider fallback chain works correctly
- [ ] Error handling for missing credentials
- [ ] Model selection respects `isLimited` flag
- [ ] Tool filtering works across providers

### Integration Tests
- [ ] AI Assistant chat completes successfully
- [ ] Code completion returns valid suggestions
- [ ] Schema generation creates valid SQL
- [ ] Feedback classification returns expected categories
- [ ] SQL debugging fixes broken queries
- [ ] Streaming responses work correctly

### End-to-End Tests
- [ ] Full conversation with multi-turn context
- [ ] Tool calling (execute_sql, search_docs, etc.)
- [ ] Error recovery and retry logic
- [ ] Rate limiting respects provider limits
- [ ] UI updates reflect new provider models

### Performance Tests
- [ ] Latency < 2s for first token
- [ ] Streaming chunks arrive smoothly
- [ ] Memory usage stays within limits
- [ ] Concurrent requests handled properly

---

## 12. Open Questions

1. **Provider Preference:**
   - What provider are you considering switching to?
   - What's driving the switch? (Cost, performance, compliance, etc.)

2. **Migration Timeline:**
   - Is this urgent or can it be done gradually?
   - Do you need to support multiple providers simultaneously?

3. **Feature Parity:**
   - Are there provider-specific features you need? (e.g., OpenAI's function calling vs Anthropic's tool use)
   - Is prompt caching (Bedrock/Anthropic) important for cost savings?

4. **Compliance:**
   - Are there data residency requirements?
   - Do you need on-premises deployment options?

---

## 13. Key Files Reference

### Core AI Logic
```
/apps/studio/lib/ai/
├── model.ts                 # Central model selection (MOST IMPORTANT)
├── model.utils.ts           # Provider registry and config
├── bedrock.ts              # AWS Bedrock setup with multi-region
├── prompts.ts              # System prompts for AI features
├── tools/
│   ├── index.ts            # Tool aggregation
│   ├── fallback-tools.ts   # Self-hosted mode tools
│   ├── mcp-tools.ts        # Platform-specific tools
│   ├── schema-tools.ts     # Database introspection
│   └── rendering-tools.ts  # UI display tools
└── tool-filter.ts          # Opt-in level filtering
```

### API Routes
```
/apps/studio/pages/api/ai/
├── sql/
│   ├── generate-v4.ts      # Main AI chat endpoint
│   ├── title-v2.ts         # SQL title generation
│   ├── cron-v2.ts          # Cron schedule generation
│   └── check-api-key.ts    # Credential validation
├── code/
│   └── complete.ts         # Code completion
├── feedback/
│   ├── rate.ts             # User feedback on AI responses
│   └── classify.ts         # Support ticket classification
├── table-quickstart/
│   └── generate-schemas.ts # Schema generation wizard
├── onboarding/
│   └── design.ts           # Onboarding schema designer
└── docs.ts                 # Documentation search
```

### Frontend Components
```
/apps/studio/components/ui/AIAssistantPanel/
├── AIAssistant.tsx                # Main chat interface
├── AssistantChatForm.tsx          # Input form
├── ModelSelector.tsx              # Model dropdown
├── Message.tsx                    # Chat message rendering
└── DisplayBlockRenderer.tsx       # Tool result display

/apps/studio/state/
└── ai-assistant-state.tsx         # State management
```

---

## 14. Conclusion

The Supabase Studio AI integration is **well-architected with moderate provider coupling**. The use of Vercel's AI SDK provides a solid abstraction layer, but hardcoded provider references in API routes create friction for switching.

**Key Strengths:**
- ✅ Centralized model selection
- ✅ Already supports multiple providers (OpenAI, Bedrock)
- ✅ Type-safe throughout
- ✅ Good separation of concerns

**Key Weaknesses:**
- ❌ Hardcoded `provider: 'openai'` in most API routes
- ❌ No centralized AI configuration file
- ❌ Limited documentation on switching providers
- ❌ No automated tests for provider switching

**Recommendation:** Switching providers is **feasible with moderate effort** (3-5 days). The cleanest approach is to:
1. Remove all hardcoded provider references
2. Rely on environment-based auto-detection (already built!)
3. Add comprehensive testing
4. Deploy gradually with monitoring

**Next Steps:**
1. Choose target provider
2. Set up credentials in staging
3. Run full test suite
4. Gradual production rollout

---

**Report Author:** Jordan Kim (AI Full-Stack Developer Persona)
**Analysis Completed:** 2025-11-20
**Confidence Level:** High (based on comprehensive codebase review)
