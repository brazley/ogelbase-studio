# 🚀 Quick Start - Railway Database Setup

## The SQL You Need to Run

Copy this entire block and paste it into Railway's Postgres Data tab:

```sql
-- Create databases table
CREATE TABLE IF NOT EXISTS platform.databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  connection_string TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add your Railway connections
INSERT INTO platform.databases (project_id, name, type, connection_string, config, status)
VALUES
  (gen_random_uuid(), 'Railway Redis', 'redis',
   'redis://default:UTQjVunMdcoeTkszSCjPeAvXjewOTjAm@redis.railway.internal:6379',
   '{"tier":"pro"}'::jsonb, 'active'),
  (gen_random_uuid(), 'Railway MongoDB', 'mongodb',
   'mongodb://mongo:pedlSLZyLIwXzNSzaGAwTCKLCfgXtoDW@mongodb.railway.internal:27017',
   '{"tier":"pro"}'::jsonb, 'active');

-- Verify
SELECT * FROM platform.databases;
```

## Where to Run It

1. Go to https://railway.app
2. Open "OgelBase" project  
3. Click "Postgres" service
4. Click "Data" tab
5. Paste the SQL above
6. Click "Run"

## ✅ Done!

Your Redis and MongoDB are now connected and ready to use via the APIs we built!
