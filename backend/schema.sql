-- ==========================================
-- Rhythm Chamber - Phase 2 Backend Schema
-- ==========================================
-- 
-- Supabase PostgreSQL schema for Cloud Backup feature.
-- NOT integrated with frontend - preparation for Phase 2.
--
-- Cost estimate at 1,000 users: ~$25/month (Supabase Pro)
-- 
-- Usage pattern: Bursty (upload once, query occasionally)
-- - Users upload data after Spotify export (quarterly)
-- - Chat sessions append incrementally
-- - No real-time sync needed - eventual consistency is fine
--

-- ==========================================
-- Extensions
-- ==========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- Core Tables
-- ==========================================

-- User sync data (encrypted blobs)
-- Contains: parsed streams, embeddings, personality data
-- All encryption happens CLIENT-SIDE before upload
CREATE TABLE sync_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Encrypted blob containing:
    -- { chunks, embeddings, personality, patterns }
    -- Client encrypts with user-derived key before upload
    encrypted_blob JSONB NOT NULL,
    
    -- Metadata (unencrypted for server-side filtering)
    blob_size_bytes INTEGER NOT NULL DEFAULT 0,
    last_sync TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Optimistic locking for conflict detection
    -- Last-write-wins, but version helps detect conflicts
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT sync_data_user_unique UNIQUE (user_id)
);

-- Chat sessions (encrypted messages)
-- Separate from sync_data for granular sync
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Session metadata (unencrypted for listing)
    title TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    
    -- Encrypted messages array
    -- Client encrypts each message before upload
    encrypted_messages JSONB NOT NULL DEFAULT '[]'::JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User metadata (license status, preferences)
CREATE TABLE user_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- License information
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'supporter', 'patron', 'cloud')),
    license_key TEXT,
    license_activated_at TIMESTAMPTZ,
    
    -- Stripe integration
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'inactive',
    
    -- Preferences (sync settings)
    auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
    last_backup_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT user_metadata_user_unique UNIQUE (user_id)
);

-- ==========================================
-- Indexes
-- ==========================================

CREATE INDEX idx_sync_data_user_id ON sync_data(user_id);
CREATE INDEX idx_sync_data_last_sync ON sync_data(last_sync);
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at);
CREATE INDEX idx_user_metadata_tier ON user_metadata(tier);
CREATE INDEX idx_user_metadata_stripe ON user_metadata(stripe_customer_id);

-- ==========================================
-- Row Level Security (RLS)
-- ==========================================

ALTER TABLE sync_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_metadata ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own sync data"
    ON sync_data FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync data"
    ON sync_data FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync data"
    ON sync_data FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync data"
    ON sync_data FOR DELETE
    USING (auth.uid() = user_id);

-- Same for chat sessions
CREATE POLICY "Users can view own chat sessions"
    ON chat_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat sessions"
    ON chat_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat sessions"
    ON chat_sessions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions"
    ON chat_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- User metadata
CREATE POLICY "Users can view own metadata"
    ON user_metadata FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own metadata"
    ON user_metadata FOR UPDATE
    USING (auth.uid() = user_id);

-- ==========================================
-- Functions
-- ==========================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER sync_data_updated_at
    BEFORE UPDATE ON sync_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_metadata_updated_at
    BEFORE UPDATE ON user_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- Initial Data / Seed
-- ==========================================

-- No seed data needed - users create data via app
