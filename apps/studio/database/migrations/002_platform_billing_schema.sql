-- ============================================
-- Platform Billing Schema Migration
-- ============================================
-- This migration creates the billing infrastructure for Supabase Studio
-- to manage subscriptions, invoices, payments, and usage tracking.
--
-- Prerequisites:
--   - Migration 001_create_platform_schema.sql must be applied first
--   - PostgreSQL 12 or higher
--
-- Usage:
--   psql <database_url> -f 002_platform_billing_schema.sql
-- ============================================

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: platform.subscriptions
-- ============================================
-- Stores subscription plans and billing information for organizations
CREATE TABLE IF NOT EXISTS platform.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Plan details
    plan_id TEXT NOT NULL, -- 'tier_free', 'tier_pro', 'tier_team', 'tier_enterprise'
    plan_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',

    -- Billing cycle information
    billing_cycle_anchor BIGINT,
    current_period_start BIGINT,
    current_period_end BIGINT,
    next_invoice_at BIGINT,

    -- Usage and spend management
    usage_billing_enabled BOOLEAN DEFAULT true,
    spend_cap_enabled BOOLEAN DEFAULT false,
    spend_cap_amount NUMERIC(10,2),
    customer_balance NUMERIC(10,2) DEFAULT 0,

    -- Partner billing
    billing_via_partner BOOLEAN DEFAULT false,
    billing_partner TEXT, -- 'fly', 'aws', 'vercel', null

    -- Feature flags
    cached_egress_enabled BOOLEAN DEFAULT false,

    -- Stripe integration
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(organization_id),
    CONSTRAINT subscriptions_status_valid CHECK (status IN (
        'active', 'canceled', 'past_due', 'trialing', 'unpaid', 'incomplete'
    )),
    CONSTRAINT subscriptions_plan_id_valid CHECK (plan_id IN (
        'tier_free', 'tier_pro', 'tier_team', 'tier_enterprise'
    )),
    CONSTRAINT subscriptions_spend_cap_valid CHECK (
        NOT spend_cap_enabled OR spend_cap_amount > 0
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON platform.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON platform.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON platform.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON platform.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_invoice ON platform.subscriptions(next_invoice_at);

-- ============================================
-- Table: platform.invoices
-- ============================================
-- Stores invoice information for billing
CREATE TABLE IF NOT EXISTS platform.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Stripe integration
    stripe_invoice_id TEXT UNIQUE,
    invoice_number TEXT,

    -- Invoice amounts
    amount_due NUMERIC(10,2) NOT NULL,
    amount_paid NUMERIC(10,2) DEFAULT 0,
    amount_remaining NUMERIC(10,2),
    currency TEXT DEFAULT 'usd',

    -- Status and dates
    status TEXT NOT NULL,
    period_start BIGINT,
    period_end BIGINT,
    due_date BIGINT,
    paid_at BIGINT,

    -- Invoice URLs
    invoice_pdf TEXT,
    hosted_invoice_url TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT invoices_status_valid CHECK (status IN (
        'draft', 'open', 'paid', 'void', 'uncollectible'
    )),
    CONSTRAINT invoices_amount_valid CHECK (amount_due >= 0),
    CONSTRAINT invoices_currency_valid CHECK (currency ~ '^[a-z]{3}$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_org ON platform.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON platform.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe ON platform.invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON platform.invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON platform.invoices(created_at DESC);

-- ============================================
-- Table: platform.payment_methods
-- ============================================
-- Stores payment method information for organizations
CREATE TABLE IF NOT EXISTS platform.payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Stripe integration
    stripe_payment_method_id TEXT UNIQUE NOT NULL,

    -- Payment method details
    type TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,

    -- Card details (when applicable)
    card_brand TEXT, -- 'visa', 'mastercard', 'amex', 'discover', etc.
    card_last4 TEXT,
    card_exp_month INTEGER,
    card_exp_year INTEGER,

    -- Additional details
    billing_details JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT payment_methods_type_valid CHECK (type IN (
        'card', 'bank_account', 'sepa_debit', 'us_bank_account'
    )),
    CONSTRAINT payment_methods_card_exp_month_valid CHECK (
        card_exp_month IS NULL OR (card_exp_month >= 1 AND card_exp_month <= 12)
    ),
    CONSTRAINT payment_methods_card_exp_year_valid CHECK (
        card_exp_year IS NULL OR card_exp_year >= 2020
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON platform.payment_methods(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON platform.payment_methods(organization_id, is_default) WHERE is_default = true;

-- ============================================
-- Table: platform.tax_ids
-- ============================================
-- Stores tax identification numbers for organizations
CREATE TABLE IF NOT EXISTS platform.tax_ids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Tax ID details
    type TEXT NOT NULL, -- 'eu_vat', 'us_ein', 'gb_vat', etc.
    value TEXT NOT NULL,
    country TEXT,

    -- Status
    status TEXT DEFAULT 'active',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(organization_id, type, value),
    CONSTRAINT tax_ids_status_valid CHECK (status IN ('active', 'deleted')),
    CONSTRAINT tax_ids_country_valid CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tax_ids_org ON platform.tax_ids(organization_id);
CREATE INDEX IF NOT EXISTS idx_tax_ids_status ON platform.tax_ids(status);

-- ============================================
-- Table: platform.usage_metrics
-- ============================================
-- Stores usage metrics for billing and analytics
CREATE TABLE IF NOT EXISTS platform.usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Metric details
    metric_type TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit TEXT NOT NULL,

    -- Period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Cost calculation
    cost NUMERIC(10,2),

    -- Additional metadata
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT usage_metrics_value_valid CHECK (metric_value >= 0),
    CONSTRAINT usage_metrics_period_valid CHECK (period_end > period_start),
    CONSTRAINT usage_metrics_type_valid CHECK (metric_type IN (
        'database_size', 'egress', 'storage', 'auth_users', 'realtime_connections',
        'realtime_messages', 'storage_images_transformed', 'function_invocations',
        'function_count', 'compute_hours'
    )),
    CONSTRAINT usage_metrics_unit_valid CHECK (metric_unit IN (
        'bytes', 'hours', 'requests', 'users', 'connections', 'messages', 'invocations', 'count'
    ))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_org_period ON platform.usage_metrics(organization_id, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_project_period ON platform.usage_metrics(project_id, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_type ON platform.usage_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON platform.usage_metrics(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_usage_org_type_period ON platform.usage_metrics(organization_id, metric_type, period_start);

-- ============================================
-- Table: platform.addons
-- ============================================
-- Stores project-level add-ons and their configurations
CREATE TABLE IF NOT EXISTS platform.addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Add-on details
    addon_type TEXT NOT NULL,
    addon_variant TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    price_per_unit NUMERIC(10,2),

    -- Configuration
    metadata JSONB,

    -- Status
    status TEXT DEFAULT 'active',
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT addons_status_valid CHECK (status IN ('active', 'inactive')),
    CONSTRAINT addons_type_valid CHECK (addon_type IN (
        'pitr', 'custom_domain', 'ipv4', 'compute_instance', 'disk_expansion'
    )),
    CONSTRAINT addons_quantity_valid CHECK (quantity > 0),
    CONSTRAINT addons_price_valid CHECK (price_per_unit IS NULL OR price_per_unit >= 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_addons_project ON platform.addons(project_id);
CREATE INDEX IF NOT EXISTS idx_addons_status ON platform.addons(status);
CREATE INDEX IF NOT EXISTS idx_addons_type ON platform.addons(addon_type);

-- ============================================
-- Table: platform.customer_profiles
-- ============================================
-- Stores customer billing profile information
CREATE TABLE IF NOT EXISTS platform.customer_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID UNIQUE NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Company information
    company_name TEXT,

    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,

    -- Tax information
    tax_id TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT customer_profiles_country_valid CHECK (
        country IS NULL OR country ~ '^[A-Z]{2}$'
    )
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_customer_profiles_org ON platform.customer_profiles(organization_id);

-- ============================================
-- Table: platform.credits
-- ============================================
-- Stores promotional credits and their usage
CREATE TABLE IF NOT EXISTS platform.credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Credit amounts
    amount NUMERIC(10,2) NOT NULL,
    remaining NUMERIC(10,2) NOT NULL,

    -- Details
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT credits_amount_valid CHECK (amount > 0),
    CONSTRAINT credits_remaining_valid CHECK (remaining >= 0 AND remaining <= amount),
    CONSTRAINT credits_status_valid CHECK (status IN ('active', 'consumed', 'expired'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_credits_org ON platform.credits(organization_id);
CREATE INDEX IF NOT EXISTS idx_credits_expires ON platform.credits(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- Table: platform.disk_config
-- ============================================
-- Stores disk configuration for projects
CREATE TABLE IF NOT EXISTS platform.disk_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID UNIQUE NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Disk specifications
    size_gb INTEGER NOT NULL DEFAULT 8,
    io_budget INTEGER NOT NULL DEFAULT 2400,

    -- Autoscaling
    autoscale_enabled BOOLEAN DEFAULT false,
    autoscale_limit_gb INTEGER,

    -- Status
    status TEXT DEFAULT 'active',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT disk_config_size_valid CHECK (size_gb >= 8 AND size_gb <= 10000),
    CONSTRAINT disk_config_io_valid CHECK (io_budget >= 2400),
    CONSTRAINT disk_config_autoscale_valid CHECK (
        NOT autoscale_enabled OR (autoscale_limit_gb IS NOT NULL AND autoscale_limit_gb > size_gb)
    ),
    CONSTRAINT disk_config_status_valid CHECK (status IN ('active', 'inactive', 'upgrading'))
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_disk_config_project ON platform.disk_config(project_id);

-- ============================================
-- Table: platform.compute_config
-- ============================================
-- Stores compute instance configuration for projects
CREATE TABLE IF NOT EXISTS platform.compute_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID UNIQUE NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Instance specifications
    instance_size TEXT NOT NULL DEFAULT 'micro',
    cpu_cores NUMERIC(3,1),
    memory_gb NUMERIC(4,1),

    -- Architecture
    architecture TEXT,
    is_dedicated BOOLEAN DEFAULT false,

    -- Status
    status TEXT DEFAULT 'active',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT compute_config_instance_valid CHECK (instance_size IN (
        'nano', 'micro', 'small', 'medium', 'large', 'xlarge', '2xlarge', '4xlarge',
        '8xlarge', '12xlarge', '16xlarge'
    )),
    CONSTRAINT compute_config_arch_valid CHECK (
        architecture IS NULL OR architecture IN ('arm', 'amd', 'x86_64')
    ),
    CONSTRAINT compute_config_status_valid CHECK (status IN ('active', 'inactive', 'upgrading'))
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_compute_config_project ON platform.compute_config(project_id);
CREATE INDEX IF NOT EXISTS idx_compute_config_size ON platform.compute_config(instance_size);

-- ============================================
-- Triggers for updated_at timestamps
-- ============================================
-- Apply trigger to subscriptions table
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON platform.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON platform.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to invoices table
DROP TRIGGER IF EXISTS update_invoices_updated_at ON platform.invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON platform.invoices
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to payment_methods table
DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON platform.payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
    BEFORE UPDATE ON platform.payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to tax_ids table
DROP TRIGGER IF EXISTS update_tax_ids_updated_at ON platform.tax_ids;
CREATE TRIGGER update_tax_ids_updated_at
    BEFORE UPDATE ON platform.tax_ids
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to addons table
DROP TRIGGER IF EXISTS update_addons_updated_at ON platform.addons;
CREATE TRIGGER update_addons_updated_at
    BEFORE UPDATE ON platform.addons
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to customer_profiles table
DROP TRIGGER IF EXISTS update_customer_profiles_updated_at ON platform.customer_profiles;
CREATE TRIGGER update_customer_profiles_updated_at
    BEFORE UPDATE ON platform.customer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to credits table
DROP TRIGGER IF EXISTS update_credits_updated_at ON platform.credits;
CREATE TRIGGER update_credits_updated_at
    BEFORE UPDATE ON platform.credits
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to disk_config table
DROP TRIGGER IF EXISTS update_disk_config_updated_at ON platform.disk_config;
CREATE TRIGGER update_disk_config_updated_at
    BEFORE UPDATE ON platform.disk_config
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to compute_config table
DROP TRIGGER IF EXISTS update_compute_config_updated_at ON platform.compute_config;
CREATE TRIGGER update_compute_config_updated_at
    BEFORE UPDATE ON platform.compute_config
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get active subscription for an organization
CREATE OR REPLACE FUNCTION platform.get_active_subscription(org_id UUID)
RETURNS platform.subscriptions AS $$
    SELECT * FROM platform.subscriptions
    WHERE organization_id = org_id
    AND status = 'active'
    LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Function to calculate total usage cost for a period
CREATE OR REPLACE FUNCTION platform.calculate_usage_cost(
    org_id UUID,
    start_period TIMESTAMPTZ,
    end_period TIMESTAMPTZ
)
RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(cost), 0)
    FROM platform.usage_metrics
    WHERE organization_id = org_id
    AND period_start >= start_period
    AND period_end <= end_period;
$$ LANGUAGE sql STABLE;

-- Function to get available credits for an organization
CREATE OR REPLACE FUNCTION platform.get_available_credits(org_id UUID)
RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(remaining), 0)
    FROM platform.credits
    WHERE organization_id = org_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW());
$$ LANGUAGE sql STABLE;

-- Function to check if organization is on free tier
CREATE OR REPLACE FUNCTION platform.is_free_tier(org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1 FROM platform.subscriptions
        WHERE organization_id = org_id
        AND plan_id = 'tier_free'
        AND status = 'active'
    );
$$ LANGUAGE sql STABLE;

-- ============================================
-- Views for easier querying
-- ============================================

-- View combining subscriptions with organization details
CREATE OR REPLACE VIEW platform.subscriptions_with_orgs AS
SELECT
    s.id,
    s.organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    s.plan_id,
    s.plan_name,
    s.status,
    s.billing_cycle_anchor,
    s.current_period_start,
    s.current_period_end,
    s.next_invoice_at,
    s.usage_billing_enabled,
    s.spend_cap_enabled,
    s.spend_cap_amount,
    s.customer_balance,
    s.billing_via_partner,
    s.billing_partner,
    s.stripe_customer_id,
    s.stripe_subscription_id,
    s.created_at,
    s.updated_at
FROM platform.subscriptions s
JOIN platform.organizations o ON s.organization_id = o.id;

-- View for organization billing overview
CREATE OR REPLACE VIEW platform.organization_billing_overview AS
SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    s.plan_id,
    s.plan_name,
    s.status as subscription_status,
    s.customer_balance,
    COUNT(DISTINCT p.id) as project_count,
    COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'open') as open_invoices,
    COALESCE(SUM(i.amount_due) FILTER (WHERE i.status = 'open'), 0) as outstanding_balance,
    platform.get_available_credits(o.id) as available_credits
FROM platform.organizations o
LEFT JOIN platform.subscriptions s ON o.id = s.organization_id
LEFT JOIN platform.projects p ON o.id = p.organization_id
LEFT JOIN platform.invoices i ON o.id = i.organization_id
GROUP BY o.id, o.name, o.slug, s.plan_id, s.plan_name, s.status, s.customer_balance;

-- View for project resource configuration
CREATE OR REPLACE VIEW platform.project_resources AS
SELECT
    p.id as project_id,
    p.ref as project_ref,
    p.name as project_name,
    p.organization_id,
    p.status as project_status,
    dc.size_gb as disk_size_gb,
    dc.io_budget as disk_io_budget,
    dc.autoscale_enabled as disk_autoscale,
    cc.instance_size,
    cc.cpu_cores,
    cc.memory_gb,
    cc.architecture,
    cc.is_dedicated,
    COUNT(a.id) FILTER (WHERE a.status = 'active') as active_addons_count
FROM platform.projects p
LEFT JOIN platform.disk_config dc ON p.id = dc.project_id
LEFT JOIN platform.compute_config cc ON p.id = cc.project_id
LEFT JOIN platform.addons a ON p.id = a.project_id
GROUP BY
    p.id, p.ref, p.name, p.organization_id, p.status,
    dc.size_gb, dc.io_budget, dc.autoscale_enabled,
    cc.instance_size, cc.cpu_cores, cc.memory_gb, cc.architecture, cc.is_dedicated;

-- ============================================
-- Default Data Seeding
-- ============================================

-- Create default subscription for "Org 1" if it exists
DO $$
DECLARE
    org_1_id UUID;
BEGIN
    -- Get Org 1 ID
    SELECT id INTO org_1_id FROM platform.organizations WHERE slug = 'org-1' LIMIT 1;

    IF org_1_id IS NOT NULL THEN
        -- Insert default free tier subscription
        INSERT INTO platform.subscriptions (
            organization_id,
            plan_id,
            plan_name,
            status,
            usage_billing_enabled,
            spend_cap_enabled
        )
        VALUES (
            org_1_id,
            'tier_free',
            'Free',
            'active',
            false,
            true
        )
        ON CONFLICT (organization_id) DO NOTHING;

        RAISE NOTICE 'Created default Free tier subscription for Org 1';
    END IF;
END $$;

-- Create default configurations for "default" project if it exists
DO $$
DECLARE
    default_project_id UUID;
BEGIN
    -- Get default project ID
    SELECT id INTO default_project_id FROM platform.projects WHERE ref = 'default' LIMIT 1;

    IF default_project_id IS NOT NULL THEN
        -- Insert default disk configuration
        INSERT INTO platform.disk_config (
            project_id,
            size_gb,
            io_budget,
            autoscale_enabled,
            status
        )
        VALUES (
            default_project_id,
            8,
            2400,
            false,
            'active'
        )
        ON CONFLICT (project_id) DO NOTHING;

        -- Insert default compute configuration
        INSERT INTO platform.compute_config (
            project_id,
            instance_size,
            cpu_cores,
            memory_gb,
            architecture,
            is_dedicated,
            status
        )
        VALUES (
            default_project_id,
            'micro',
            2.0,
            1.0,
            'arm',
            false,
            'active'
        )
        ON CONFLICT (project_id) DO NOTHING;

        RAISE NOTICE 'Created default configurations for default project';
    END IF;
END $$;

-- ============================================
-- Migration Complete
-- ============================================
-- You can verify the migration with:
--   \dt platform.*
--   \df platform.*
--   \dv platform.*
--
-- New tables:
--   - platform.subscriptions
--   - platform.invoices
--   - platform.payment_methods
--   - platform.tax_ids
--   - platform.usage_metrics
--   - platform.addons
--   - platform.customer_profiles
--   - platform.credits
--   - platform.disk_config
--   - platform.compute_config
--
-- New views:
--   - platform.subscriptions_with_orgs
--   - platform.organization_billing_overview
--   - platform.project_resources
--
-- New functions:
--   - platform.get_active_subscription(org_id)
--   - platform.calculate_usage_cost(org_id, start_period, end_period)
--   - platform.get_available_credits(org_id)
--   - platform.is_free_tier(org_id)
-- ============================================
