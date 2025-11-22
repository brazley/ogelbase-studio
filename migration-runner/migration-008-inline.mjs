import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);
console.log('Executing Migration 008...');
try {
await sql.unsafe(`
BEGIN;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'platform' AND table_name = 'users' AND column_name = 'active_org_id') THEN ALTER TABLE platform.users ADD COLUMN active_org_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL; CREATE INDEX idx_users_active_org ON platform.users(active_org_id) WHERE active_org_id IS NOT NULL; COMMENT ON COLUMN platform.users.active_org_id IS 'Currently active organization'; END IF; END $$;
CREATE OR REPLACE FUNCTION platform.set_user_active_org(p_user_id UUID,p_org_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE v_is_member BOOLEAN; BEGIN SELECT EXISTS(SELECT 1 FROM platform.organization_members WHERE user_id=p_user_id AND organization_id=p_org_id) INTO v_is_member; IF NOT v_is_member THEN RAISE EXCEPTION 'Not a member'; END IF; UPDATE platform.users SET active_org_id=p_org_id,updated_at=NOW() WHERE id=p_user_id; RETURN TRUE; END; $$;
CREATE OR REPLACE FUNCTION platform.get_user_active_org(p_user_id UUID) RETURNS TABLE(organization_id UUID,organization_slug TEXT,organization_name TEXT,user_role TEXT) LANGUAGE plpgsql STABLE AS $$ BEGIN RETURN QUERY SELECT o.id,o.slug,o.name,om.role FROM platform.users u JOIN platform.organizations o ON u.active_org_id=o.id JOIN platform.organization_members om ON om.organization_id=o.id AND om.user_id=u.id WHERE u.id=p_user_id AND u.active_org_id IS NOT NULL; END; $$;
UPDATE platform.users u SET active_org_id=(SELECT om.organization_id FROM platform.organization_members om WHERE om.user_id=u.id ORDER BY om.joined_at ASC LIMIT 1) WHERE active_org_id IS NULL AND EXISTS(SELECT 1 FROM platform.organization_members om WHERE om.user_id=u.id);
COMMIT;
`);
const [r]=await sql\`SELECT COUNT(*) as total,COUNT(active_org_id) as with_org FROM platform.users\`;
console.log(\`✅ Migration 008 complete! Users: \${r.total}, With org: \${r.with_org}\`);
await sql.end();
process.exit(0);
} catch(e) { console.error('❌',e.message); await sql.end(); process.exit(1); }
