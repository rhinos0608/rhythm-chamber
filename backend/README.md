# Rhythm Chamber - Backend (Phase 2)

> **Status:** Setup only - NOT integrated with frontend.

This directory contains the backend infrastructure preparation for Phase 2 Cloud Backup feature. The code is intentionally not connected to the frontend to avoid premature complexity.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   Parser    │────▶│   Storage   │────▶│   Encrypt   │       │
│  │  (Worker)   │     │   (IDB)     │     │  (AES-GCM)  │       │
│  └─────────────┘     └─────────────┘     └──────┬──────┘       │
│                                                  │               │
│                                    [Phase 2] ────┼───────        │
└──────────────────────────────────────────────────┼───────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Backend                           │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │    Auth     │     │  PostgreSQL │     │   Storage   │       │
│  │ (JWT/Magic) │     │  (RLS + DB) │     │   (Blobs)   │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `schema.sql` | PostgreSQL schema for Supabase (sync_data, chat_sessions, user_metadata) |
| `.env.example` | Environment variable template |
| `api/sync.js` | API route stubs (returns 501 Not Implemented) |
| `payments.js` | Stripe webhook handlers (existing) |

## Phase 2 Launch Checklist

When ready to launch Cloud Backup:

1. [ ] Create Supabase project
2. [ ] Run `schema.sql` in Supabase SQL editor
3. [ ] Configure environment variables
4. [ ] Implement `api/sync.js` routes
5. [ ] Create `js/storage/cloud-sync.js` implementation
6. [ ] Add UI for Cloud Backup tier
7. [ ] Test sync flow end-to-end
8. [ ] Deploy to Railway/Render

## Cost Estimates

| Scale | Supabase | Storage | Total |
|-------|----------|---------|-------|
| 0-500 users | Free tier | Free (10GB) | $0/month |
| 500-1000 users | Pro ($25) | ~$5 | ~$30/month |
| 1000-5000 users | Pro ($25) | ~$25 | ~$50/month |

## Security Notes

- **Client-side encryption**: All data encrypted with user-derived keys BEFORE upload
- **Server is "dumb storage"**: Cannot decrypt user data
- **RLS policies**: Users can only access their own data
- **JWT auth**: Supabase handles token validation

## What This Is NOT

This is **Cloud Backup**, not **Cloud Sync**:

| Feature | Cloud Backup (Ours) | Full Cloud Sync |
|---------|---------------------|-----------------|
| Real-time sync | ❌ Manual | ✅ Automatic |
| Conflict resolution | Last-write-wins | CRDTs/OT |
| Offline support | ❌ Online only | ✅ Queue changes |
| Version history | ❌ Single version | ✅ Full history |
| Collaboration | ❌ Single user | ✅ Multi-user |

This is intentional - simpler architecture, lower costs, fewer bugs.
