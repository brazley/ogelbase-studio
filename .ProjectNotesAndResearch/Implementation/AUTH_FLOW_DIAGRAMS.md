# Visual Authentication Flow Diagrams

## Complete Login Journey - Visual Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE STUDIO AUTH FLOW                            │
│                              (UI/UX PERSPECTIVE)                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              SIGN UP JOURNEY                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    Browser                  Frontend                  GoTrue API
       │                        │                          │
       │    GET /sign-up        │                          │
       ├───────────────────────>│                          │
       │                        │                          │
       │   SignUpForm rendered  │                          │
       │<───────────────────────┤                          │
       │                        │                          │
       │  Fill email/password   │                          │
       │  Click "Sign Up"       │                          │
       ├───────────────────────>│                          │
       │                        │                          │
       │                        │  POST /auth/signup       │
       │                        │  { email, password,      │
       │                        │    captchaToken }        │
       │                        ├─────────────────────────>│
       │                        │                          │
       │                        │  User created            │
       │                        │  Email sent              │
       │                        │<─────────────────────────┤
       │                        │                          │
       │   Success message      │                          │
       │<───────────────────────┤                          │
       │                        │                          │
       │                        │                          │
       │  User clicks email     │                          │
       │  verification link     │                          │
       ├────────────────────────┼─────────────────────────>│
       │                        │                          │
       │                        │  Account verified        │
       │                        │  Redirect to /sign-in    │
       │<────────────────────────────────────────────────┤│
       │                        │                          │

┌─────────────────────────────────────────────────────────────────────────────┐
│                              SIGN IN JOURNEY                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    Browser                  Frontend                  GoTrue API            Platform API
       │                        │                          │                      │
       │    GET /sign-in        │                          │                      │
       │    ?returnTo=/x        │                          │                      │
       ├───────────────────────>│                          │                      │
       │                        │                          │                      │
       │   SignInForm rendered  │                          │                      │
       │<───────────────────────┤                          │                      │
       │                        │                          │                      │
       │  Fill email/password   │                          │                      │
       │  Click "Sign In"       │                          │                      │
       ├───────────────────────>│                          │                      │
       │                        │                          │                      │
       │                        │  POST /auth/token        │                      │
       │                        │  { email, password }     │                      │
       │                        ├─────────────────────────>│                      │
       │                        │                          │                      │
       │                        │  { access_token,         │                      │
       │                        │    refresh_token,        │                      │
       │                        │    user }                │                      │
       │                        │<─────────────────────────┤                      │
       │                        │                          │                      │
       │                        │  Store in localStorage   │                      │
       │                        │  or cookies              │                      │
       │                        │                          │                      │
       │                        │  Check MFA level         │                      │
       │                        ├─────────────────────────>│                      │
       │                        │<─────────────────────────┤                      │
       │                        │                          │                      │
       │                        │  ┌─────────────────┐    │                      │
       │                        │  │ MFA required?   │    │                      │
       │                        │  └────────┬────────┘    │                      │
       │                        │           │             │                      │
       │                        │      ┌────┴────┐        │                      │
       │                        │      │         │        │                      │
       │                        │    [YES]     [NO]       │                      │
       │                        │      │         │        │                      │
       │  /sign-in-mfa          │      │         │        │                      │
       │<───────────────────────┤      │         │        │                      │
       │                        │      │         │        │                      │
       │                        │      │         └────────┤                      │
       │                        │      │                  │                      │
       │                        │      │  Reset query     │                      │
       │                        │      │  cache           │                      │
       │                        │      │                  │                      │
       │                        │      │  Redirect to     │                      │
       │                        │      │  returnTo or     │                      │
       │  GET /organizations    │      │  /organizations  │                      │
       │<───────────────────────┴──────┴──────────────────┤                      │
       │                        │                          │                      │

┌─────────────────────────────────────────────────────────────────────────────┐
│                        POST-LOGIN DATA LOADING                               │
└─────────────────────────────────────────────────────────────────────────────┘

    Browser                  Frontend                Platform API         Database
       │                        │                        │                   │
       │  /organizations loads  │                        │                   │
       ├───────────────────────>│                        │                   │
       │                        │                        │                   │
       │                        │  ProfileProvider       │                   │
       │                        │  initializes           │                   │
       │                        │                        │                   │
       │                        │  GET /platform/profile │                   │
       │                        │  Authorization: Bearer │                   │
       │                        ├───────────────────────>│                   │
       │                        │                        │                   │
       │                        │                        │  SELECT * FROM    │
       │                        │                        │  platform.profiles│
       │                        │                        ├──────────────────>│
       │                        │                        │                   │
       │                        │                        │  { id, username,  │
       │                        │                        │    email, ... }   │
       │                        │                        │<──────────────────┤
       │                        │                        │                   │
       │                        │  { profile }           │                   │
       │                        │<───────────────────────┤                   │
       │                        │                        │                   │
       │                        │  GET /platform/        │                   │
       │                        │  permissions           │                   │
       │                        ├───────────────────────>│                   │
       │                        │                        │                   │
       │                        │  { permissions[] }     │                   │
       │                        │<───────────────────────┤                   │
       │                        │                        │                   │
       │                        │  GET /platform/        │                   │
       │                        │  organizations         │                   │
       │                        ├───────────────────────>│                   │
       │                        │                        │                   │
       │                        │                        │  SELECT * FROM    │
       │                        │                        │  platform.orgs    │
       │                        │                        │  WHERE user_id... │
       │                        │                        ├──────────────────>│
       │                        │                        │                   │
       │                        │                        │  [ { slug, name,  │
       │                        │                        │     plan, ... } ] │
       │                        │                        │<──────────────────┤
       │                        │                        │                   │
       │                        │  { organizations[] }   │                   │
       │                        │<───────────────────────┤                   │
       │                        │                        │                   │
       │   Render org cards     │                        │                   │
       │<───────────────────────┤                        │                   │
       │                        │                        │                   │
       │  Click org card        │                        │                   │
       │  → /org/{slug}         │                        │                   │
       ├───────────────────────>│                        │                   │
       │                        │                        │                   │

┌─────────────────────────────────────────────────────────────────────────────┐
│                      ORGANIZATION DASHBOARD LOAD                             │
└─────────────────────────────────────────────────────────────────────────────┘

    Browser                  Frontend                Platform API         Database
       │                        │                        │                   │
       │  GET /org/{slug}       │                        │                   │
       ├───────────────────────>│                        │                   │
       │                        │                        │                   │
       │                        │  withAuth() HOC        │                   │
       │                        │  validates session     │                   │
       │                        │                        │                   │
       │                        │  OrganizationLayout    │                   │
       │                        │  loads                 │                   │
       │                        │                        │                   │
       │                        │  Check partner mgmt    │                   │
       │                        │  (Vercel/AWS)          │                   │
       │                        │                        │                   │
       │                        │  Check MFA requirement │                   │
       │                        │                        │                   │
       │                        │  ┌─────────────────┐  │                   │
       │                        │  │ org requires MFA? │                    │
       │                        │  │ user has MFA?   │  │                   │
       │                        │  └────────┬────────┘  │                   │
       │                        │           │           │                   │
       │                        │      ┌────┴────┐      │                   │
       │                        │      │         │      │                   │
       │                        │    [YES]     [NO]     │                   │
       │                        │      │         │      │                   │
       │   Show MFA warning     │      │         │      │                   │
       │<───────────────────────┤      │         │      │                   │
       │                        │      │         │      │                   │
       │                        │      │         └──────┤                   │
       │                        │      │                │                   │
       │                        │      │  GET /platform/│                   │
       │                        │      │  projects      │                   │
       │                        │      │  ?org={slug}   │                   │
       │                        │      ├───────────────>│                   │
       │                        │      │                │                   │
       │                        │      │                │  SELECT * FROM    │
       │                        │      │                │  projects WHERE   │
       │                        │      │                │  org_id=...       │
       │                        │      │                ├──────────────────>│
       │                        │      │                │                   │
       │                        │      │                │  [ projects ]     │
       │                        │      │                │<──────────────────┤
       │                        │      │                │                   │
       │                        │      │  { projects } │                   │
       │                        │      │<───────────────┤                   │
       │                        │      │                │                   │
       │   ProjectList renders  │      │                │                   │
       │<───────────────────────┴──────┘                │                   │
       │                        │                        │                   │

┌─────────────────────────────────────────────────────────────────────────────┐
│                    STRIPE INTEGRATION - PAID ORG CREATION                    │
└─────────────────────────────────────────────────────────────────────────────┘

    Browser                  Frontend                Platform API         Stripe API
       │                        │                        │                   │
       │  GET /new              │                        │                   │
       ├───────────────────────>│                        │                   │
       │                        │                        │                   │
       │   NewOrgForm renders   │                        │                   │
       │<───────────────────────┤                        │                   │
       │                        │                        │                   │
       │  Select PRO plan       │                        │                   │
       ├───────────────────────>│                        │                   │
       │                        │                        │                   │
       │                        │  selectedPlan = 'PRO'  │                   │
       │                        │  Trigger:              │                   │
       │                        │  loadPaymentForm()     │                   │
       │                        │                        │                   │
       │                        │  Execute HCaptcha      │                   │
       │                        │  ↓                     │                   │
       │                        │  POST /platform/stripe/│                   │
       │                        │  setup-intent          │                   │
       │                        │  { hcaptchaToken }     │                   │
       │                        ├───────────────────────>│                   │
       │                        │                        │                   │
       │                        │                        │  POST /v1/        │
       │                        │                        │  setup_intents    │
       │                        │                        ├──────────────────>│
       │                        │                        │                   │
       │                        │                        │  { client_secret, │
       │                        │                        │    id, status }   │
       │                        │                        │<──────────────────┤
       │                        │                        │                   │
       │                        │  { client_secret, id } │                   │
       │                        │<───────────────────────┤                   │
       │                        │                        │                   │
       │                        │  loadStripe(STRIPE_KEY)│                   │
       │                        │  ↓                     │                   │
       │                        │  Load Stripe Elements  │                   │
       │                        │  ↓                     │                   │
       │   Stripe payment form  │                        │                   │
       │<───────────────────────┤                        │                   │
       │                        │                        │                   │
       │  Enter card details    │                        │                   │
       │  Click "Create Org"    │                        │                   │
       ├───────────────────────>│                        │                   │
       │                        │                        │                   │
       │                        │  stripe.confirmSetup() │                   │
       │                        │  ↓                     │                   │
       │                        │  POST /v1/setup_intents│                   │
       │                        │  /{id}/confirm         │                   │
       │                        ├────────────────────────┼──────────────────>│
       │                        │                        │                   │
       │                        │  { payment_method_id } │                   │
       │                        │<────────────────────────────────────────────┤
       │                        │                        │                   │
       │                        │  POST /platform/       │                   │
       │                        │  organizations         │                   │
       │                        │  { name, plan: 'PRO',  │                   │
       │                        │    payment_method_id } │                   │
       │                        ├───────────────────────>│                   │
       │                        │                        │                   │
       │                        │  { organization }      │                   │
       │                        │<───────────────────────┤                   │
       │                        │                        │                   │
       │  Redirect to           │                        │                   │
       │  /org/{slug}           │                        │                   │
       │<───────────────────────┤                        │                   │
       │                        │                        │                   │

┌─────────────────────────────────────────────────────────────────────────────┐
│                        ROUTING & REDIRECTS MAP                               │
└─────────────────────────────────────────────────────────────────────────────┘

                             ┌─────────────┐
                             │   /sign-up  │
                             └──────┬──────┘
                                    │
                              Success │
                                    ▼
                             ┌─────────────┐
                             │ Email sent  │
                             │ Check inbox │
                             └──────┬──────┘
                                    │
                        User clicks │ verification link
                                    ▼
                             ┌─────────────┐
                             │  /sign-in   │◄─────────┐
                             └──────┬──────┘          │
                                    │                 │
                           Success  │                 │
                                    ▼                 │
                             ┌─────────────┐          │
                             │ Check MFA?  │          │
                             └──────┬──────┘          │
                                    │                 │
                            ┌───────┴───────┐         │
                            │               │         │
                          [YES]           [NO]        │
                            │               │         │
                            ▼               ▼         │
                     ┌────────────┐  ┌──────────────┐│
                     │/sign-in-mfa│  │/organizations││
                     └─────┬──────┘  └───────┬──────┘│
                           │                 │       │
                   Success │                 │       │
                           │                 │       │
                           └─────────┬───────┘       │
                                     │               │
                                     ▼               │
                              ┌──────────────┐       │
                              │ Has orgs?    │       │
                              └──────┬───────┘       │
                                     │               │
                             ┌───────┴───────┐       │
                             │               │       │
                           [YES]           [NO]      │
                             │               │       │
                             │               ▼       │
                             │        ┌───────────┐  │
                             │        │   /new    │  │
                             │        └─────┬─────┘  │
                             │              │        │
                             │       Create │ org    │
                             │              │        │
                             │              └────────┘
                             │
                             │  Auto-select first/last org
                             │
                             ▼
                      ┌──────────────┐
                      │ /org/{slug}  │
                      │              │
                      │ - Projects   │
                      │ - Settings   │
                      │ - Billing    │
                      │ - Team       │
                      └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTH STATE LIFECYCLE                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   Logged Out │
    │              │
    │ session: null│
    └──────┬───────┘
           │
           │ /sign-in → auth.signInWithPassword()
           │
           ▼
    ┌──────────────┐
    │  Logging In  │
    │              │
    │ isLoading:   │
    │   true       │
    └──────┬───────┘
           │
           │ Session token received
           │ Stored in localStorage
           │
           ▼
    ┌──────────────┐
    │  Logged In   │
    │              │
    │ session: {   │
    │   token,     │
    │   user       │
    │ }            │
    └──────┬───────┘
           │
           │ Profile loading
           │ Permissions loading
           │ Organizations loading
           │
           ▼
    ┌──────────────┐
    │  Authorized  │
    │              │
    │ profile: {}  │
    │ permissions: │
    │   []         │
    │ orgs: []     │
    └──────┬───────┘
           │
           │ User navigates app
           │ Token auto-refreshes
           │
           ▼
    ┌──────────────┐
    │ Active Use   │
    │              │
    │ All queries  │
    │ include auth │
    │ header       │
    └──────┬───────┘
           │
           │ Token expires OR
           │ User signs out OR
           │ 401 error
           │
           ▼
    ┌──────────────┐
    │   Logged Out │
    │              │
    │ Redirect to  │
    │ /sign-in     │
    └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                  STRIPE CALL POINTS - COMPLETE MAP                           │
└─────────────────────────────────────────────────────────────────────────────┘

                     ┌──────────────────────────────┐
                     │   ENTIRE APPLICATION         │
                     └──────────┬───────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
              ┌─────▼─────┐         ┌──────▼──────┐
              │ AUTH FLOW │         │  POST-AUTH  │
              │           │         │  NAVIGATION │
              └─────┬─────┘         └──────┬──────┘
                    │                      │
          ┌─────────┴─────────┐            │
          │                   │            │
    ┌─────▼─────┐      ┌──────▼──────┐    │
    │ /sign-up  │      │  /sign-in   │    │
    │           │      │             │    │
    │ NO STRIPE │      │  NO STRIPE  │    │
    └───────────┘      └─────────────┘    │
                                           │
                          ┌────────────────┴──────────────┐
                          │                               │
                   ┌──────▼──────┐              ┌─────────▼────────┐
                   │/organizations│              │ /org/{slug}      │
                   │              │              │                  │
                   │  NO STRIPE   │              │   NO STRIPE      │
                   └──────┬───────┘              └─────────┬────────┘
                          │                                │
                    ┌─────▼─────┐                         │
                    │   /new    │                         │
                    └─────┬─────┘                         │
                          │                               │
                 ┌────────┴────────┐                      │
                 │                 │                      │
           ┌─────▼─────┐    ┌──────▼──────┐        ┌─────▼─────────┐
           │ FREE plan │    │  PRO plan   │        │ Billing pages │
           │           │    │             │        │               │
           │ NO STRIPE │    │ STRIPE HERE │◄───────┤ STRIPE HERE   │
           └───────────┘    └─────────────┘        └───────────────┘
                                   │
                                   │
                            Stripe Elements:
                            - Payment form
                            - Card input
                            - Setup intent

┌─────────────────────────────────────────────────────────────────────────────┐
│                     ENVIRONMENT FLAGS - DECISION TREE                        │
└─────────────────────────────────────────────────────────────────────────────┘

                        NEXT_PUBLIC_IS_PLATFORM
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                  [true]                      [false]
                    │                           │
                    │                           │
                    ▼                           ▼
           Platform Mode              Self-Hosted Mode
           ┌─────────────┐           ┌─────────────┐
           │ Full auth   │           │ Bypass auth │
           │ Stripe OK   │           │ No Stripe   │
           │ Billing OK  │           │ No billing  │
           └──────┬──────┘           │ → /project/ │
                  │                  │   default   │
                  │                  └─────────────┘
     NEXT_PUBLIC_ENABLE_MOCK_AUTH
                  │
         ┌────────┴────────┐
         │                 │
       [true]            [false]
         │                 │
         │                 │
         ▼                 ▼
    Mock Auth         Real Auth
    ┌─────────┐      ┌──────────┐
    │ Fake    │      │ GoTrue   │
    │ session │      │ session  │
    │ Quick   │      │ Real     │
    │ test    │      │ login    │
    └─────────┘      └──────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA DEPENDENCY GRAPH                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    Session Token
         │
         │ Required for ALL API calls
         │
         ├─────────────────┬──────────────────┬───────────────┐
         │                 │                  │               │
         ▼                 ▼                  ▼               ▼
    Profile          Permissions      Organizations      Projects
    (CRITICAL)       (CRITICAL)       (REQUIRED)         (OPTIONAL)
         │                 │                  │               │
         │                 │                  │               │
         └────────┬────────┴──────────────────┘               │
                  │                                            │
                  │ All loaded in parallel                     │
                  │                                            │
                  ▼                                            │
         App Fully Loaded                                      │
         User can navigate                                     │
                  │                                            │
                  ├────────────────────────────────────────────┘
                  │
                  ▼
         Optional Data (loaded on-demand):
         - Billing info (only on billing pages)
         - Payment methods (only when editing)
         - Invoices (only on invoices page)
         - Usage stats (only on usage page)
         - Team members (only on team page)

┌─────────────────────────────────────────────────────────────────────────────┐
│                          ERROR SCENARIOS                                     │
└─────────────────────────────────────────────────────────────────────────────┘

         Login Attempt
               │
               ▼
         ┌─────────────┐
         │ Auth API    │
         └──────┬──────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
[SUCCESS]              [ERROR]
    │                       │
    │                       ├─ Email not confirmed
    │                       │  → Show verification message
    │                       │
    │                       ├─ Invalid credentials
    │                       │  → Show error toast
    │                       │
    │                       ├─ Rate limited
    │                       │  → Show cooldown message
    │                       │
    │                       ├─ Network error
    │                       │  → Retry prompt
    │                       │
    │                       └─ 401 Unauthorized
    │                          → Force sign out
    │
    ▼
Profile Load
    │
    ├─ Success → Continue
    │
    └─ Error
       ├─ Profile not found
       │  → Auto-create profile
       │
       ├─ 401
       │  → Sign out → /sign-in
       │
       └─ Network error
          → Show timeout modal
