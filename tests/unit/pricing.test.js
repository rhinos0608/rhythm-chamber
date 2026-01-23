/**
 * Pricing Module Tests
 *
 * Tests for Two-Tier Pricing Model (Sovereign, Chamber)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pricing } from '../../js/pricing.js';

describe('Pricing Module', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
    });

    afterEach(() => {
        // Clean up after each test
        if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
            localStorage.clear();
        }
    });

    describe('Tier Definitions', () => {
        it('should have two tier definitions', () => {
            expect(Object.keys(Pricing.TIERS)).toHaveLength(2);
            expect(Pricing.TIERS.sovereign).toBeDefined();
            expect(Pricing.TIERS.chamber).toBeDefined();
        });

        it('should have tier levels ordered correctly', () => {
            expect(Pricing.TIERS.sovereign.level).toBe(1);
            expect(Pricing.TIERS.chamber.level).toBe(2);
        });

        it('should have tier names', () => {
            expect(Pricing.TIERS.sovereign.name).toBe('The Sovereign');
            expect(Pricing.TIERS.chamber.name).toBe('The Chamber');
        });

        it('should have tier prices', () => {
            expect(Pricing.TIERS.sovereign.price).toBe('$0');
            expect(Pricing.TIERS.chamber.price).toBe('$4.99/mo or $39/yr');
        });

        it('should have sovereign tier features', () => {
            expect(Pricing.TIERS.sovereign.features).toContain('full_local_analysis');
            expect(Pricing.TIERS.sovereign.features).toContain('byoi_chat');
            expect(Pricing.TIERS.sovereign.features).toContain('basic_cards');
            expect(Pricing.TIERS.sovereign.features).toContain('personality_reveal');
            expect(Pricing.TIERS.sovereign.features).toContain('demo_mode');
            expect(Pricing.TIERS.sovereign.features).toContain('playlist_generation_trial');
        });

        it('should have chamber tier features', () => {
            expect(Pricing.TIERS.chamber.features).toContain('unlimited_playlists');
            expect(Pricing.TIERS.chamber.features).toContain('metadata_enrichment');
            expect(Pricing.TIERS.chamber.features).toContain('semantic_embeddings');
            expect(Pricing.TIERS.chamber.features).toContain('ai_playlist_curator');
            expect(Pricing.TIERS.chamber.features).toContain('monthly_insights');
        });
    });

    describe('Feature Definitions', () => {
        it('should have all feature definitions', () => {
            expect(Object.keys(Pricing.FEATURES)).toContain('full_local_analysis');
            expect(Object.keys(Pricing.FEATURES)).toContain('unlimited_playlists');
            expect(Object.keys(Pricing.FEATURES)).toContain('metadata_enrichment');
            expect(Object.keys(Pricing.FEATURES)).toContain('semantic_embeddings');
            expect(Object.keys(Pricing.FEATURES)).toContain('ai_playlist_curator');
            expect(Object.keys(Pricing.FEATURES)).toContain('monthly_insights');
        });

        it('should have sovereign features', () => {
            expect(Pricing.FEATURES.full_local_analysis.tier).toBe('sovereign');
            expect(Pricing.FEATURES.byoi_chat.tier).toBe('sovereign');
            expect(Pricing.FEATURES.basic_cards.tier).toBe('sovereign');
            expect(Pricing.FEATURES.personality_reveal.tier).toBe('sovereign');
            expect(Pricing.FEATURES.demo_mode.tier).toBe('sovereign');
            expect(Pricing.FEATURES.playlist_generation_trial.tier).toBe('sovereign');
        });

        it('should have chamber features', () => {
            expect(Pricing.FEATURES.unlimited_playlists.tier).toBe('chamber');
            expect(Pricing.FEATURES.metadata_enrichment.tier).toBe('chamber');
            expect(Pricing.FEATURES.semantic_embeddings.tier).toBe('chamber');
            expect(Pricing.FEATURES.ai_playlist_curator.tier).toBe('chamber');
            expect(Pricing.FEATURES.monthly_insights.tier).toBe('chamber');
        });

        it('should have monthly_insights marked as coming_soon', () => {
            expect(Pricing.FEATURES.monthly_insights.coming_soon).toBe(true);
        });
    });

    describe('getCurrentTier', () => {
        it('should return sovereign tier when no license exists', () => {
            const tier = Pricing.getCurrentTier();
            expect(tier).toBe('sovereign');
        });

        it('should return chamber tier when chamber license exists and is valid', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: futureDate.toISOString()
            }));

            const tier = Pricing.getCurrentTier();
            expect(tier).toBe('chamber');
        });

        it('should return sovereign tier when chamber license is expired', () => {
            const pastDate = new Date();
            pastDate.setFullYear(pastDate.getFullYear() - 1);

            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: pastDate.toISOString()
            }));

            const tier = Pricing.getCurrentTier();
            expect(tier).toBe('sovereign');
        });
    });

    describe('hasFeatureAccess', () => {
        it('should allow access to sovereign features for all users', () => {
            expect(Pricing.hasFeatureAccess('full_local_analysis')).toBe(true);
            expect(Pricing.hasFeatureAccess('byoi_chat')).toBe(true);
            expect(Pricing.hasFeatureAccess('basic_cards')).toBe(true);
            expect(Pricing.hasFeatureAccess('personality_reveal')).toBe(true);
            expect(Pricing.hasFeatureAccess('demo_mode')).toBe(true);
            expect(Pricing.hasFeatureAccess('playlist_generation_trial')).toBe(true);
        });

        it('should deny access to chamber features for sovereign users', () => {
            expect(Pricing.hasFeatureAccess('unlimited_playlists')).toBe(false);
            expect(Pricing.hasFeatureAccess('metadata_enrichment')).toBe(false);
            expect(Pricing.hasFeatureAccess('semantic_embeddings')).toBe(false);
            expect(Pricing.hasFeatureAccess('ai_playlist_curator')).toBe(false);
            expect(Pricing.hasFeatureAccess('monthly_insights')).toBe(false);
        });

        it('should allow access to chamber features for chamber users', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: futureDate.toISOString()
            }));

            expect(Pricing.hasFeatureAccess('unlimited_playlists')).toBe(true);
            expect(Pricing.hasFeatureAccess('metadata_enrichment')).toBe(true);
            expect(Pricing.hasFeatureAccess('semantic_embeddings')).toBe(true);
            expect(Pricing.hasFeatureAccess('ai_playlist_curator')).toBe(true);
            expect(Pricing.hasFeatureAccess('monthly_insights')).toBe(true);
        });
    });

    describe('getAvailableFeatures', () => {
        it('should return only sovereign features for free users', () => {
            const features = Pricing.getAvailableFeatures();
            expect(features).toContain('full_local_analysis');
            expect(features).toContain('byoi_chat');
            expect(features).toContain('playlist_generation_trial');
            expect(features).not.toContain('unlimited_playlists');
            expect(features).not.toContain('metadata_enrichment');
        });

        it('should return all features for chamber users', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: futureDate.toISOString()
            }));

            const features = Pricing.getAvailableFeatures();
            expect(features).toContain('full_local_analysis');
            expect(features).toContain('unlimited_playlists');
            expect(features).toContain('metadata_enrichment');
            expect(features).toContain('semantic_embeddings');
        });
    });

    describe('getCurrentTierInfo', () => {
        it('should return sovereign tier info for free users', () => {
            const info = Pricing.getCurrentTierInfo();
            expect(info.name).toBe('The Sovereign');
            expect(info.level).toBe(1);
            expect(info.price).toBe('$0');
            expect(info.features).toContain('playlist_generation_trial');
        });

        it('should return chamber tier info for chamber users', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: futureDate.toISOString()
            }));

            const info = Pricing.getCurrentTierInfo();
            expect(info.name).toBe('The Chamber');
            expect(info.level).toBe(2);
            expect(info.price).toBe('$4.99/mo or $39/yr');
            expect(info.features).toContain('unlimited_playlists');
        });
    });

    describe('getFeatureDefinition', () => {
        it('should return feature definition for valid chamber feature', () => {
            const feature = Pricing.getFeatureDefinition('metadata_enrichment');
            expect(feature).toBeDefined();
            expect(feature.name).toBe('Metadata Enrichment');
            expect(feature.description).toBeDefined();
            expect(feature.tier).toBe('chamber');
        });

        it('should return feature definition for semantic embeddings', () => {
            const feature = Pricing.getFeatureDefinition('semantic_embeddings');
            expect(feature).toBeDefined();
            expect(feature.name).toBe('Semantic Search');
            expect(feature.tier).toBe('chamber');
        });

        it('should return null for invalid feature', () => {
            const feature = Pricing.getFeatureDefinition('invalid_feature');
            expect(feature).toBeNull();
        });
    });

    describe('requiresUpgrade', () => {
        it('should return false for sovereign features', () => {
            expect(Pricing.requiresUpgrade('full_local_analysis')).toBe(false);
            expect(Pricing.requiresUpgrade('playlist_generation_trial')).toBe(false);
        });

        it('should return true for chamber features when user is sovereign', () => {
            expect(Pricing.requiresUpgrade('unlimited_playlists')).toBe(true);
            expect(Pricing.requiresUpgrade('metadata_enrichment')).toBe(true);
            expect(Pricing.requiresUpgrade('semantic_embeddings')).toBe(true);
        });

        it('should return false for chamber features when user is chamber', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: futureDate.toISOString()
            }));

            expect(Pricing.requiresUpgrade('unlimited_playlists')).toBe(false);
            expect(Pricing.requiresUpgrade('metadata_enrichment')).toBe(false);
        });
    });

    describe('getRequiredTier', () => {
        it('should return sovereign tier for sovereign features', () => {
            expect(Pricing.getRequiredTier('full_local_analysis')).toBe('sovereign');
            expect(Pricing.getRequiredTier('demo_mode')).toBe('sovereign');
        });

        it('should return chamber tier for chamber features', () => {
            expect(Pricing.getRequiredTier('unlimited_playlists')).toBe('chamber');
            expect(Pricing.getRequiredTier('metadata_enrichment')).toBe('chamber');
            expect(Pricing.getRequiredTier('semantic_embeddings')).toBe('chamber');
            expect(Pricing.getRequiredTier('ai_playlist_curator')).toBe('chamber');
        });

        it('should return null for invalid feature', () => {
            expect(Pricing.getRequiredTier('invalid_feature')).toBeNull();
        });
    });

    describe('requiresSubscription', () => {
        it('should return false for sovereign features', () => {
            expect(Pricing.requiresSubscription('full_local_analysis')).toBe(false);
        });

        it('should return true for all chamber features (subscription-based)', () => {
            expect(Pricing.requiresSubscription('unlimited_playlists')).toBe(true);
            expect(Pricing.requiresSubscription('metadata_enrichment')).toBe(true);
            expect(Pricing.requiresSubscription('semantic_embeddings')).toBe(true);
            expect(Pricing.requiresSubscription('ai_playlist_curator')).toBe(true);
            expect(Pricing.requiresSubscription('monthly_insights')).toBe(true);
        });
    });

    describe('requiresOneTimePurchase', () => {
        it('should return false for all features (subscription model)', () => {
            // All premium features are now subscription-based
            expect(Pricing.requiresOneTimePurchase('full_local_analysis')).toBe(false);
            expect(Pricing.requiresOneTimePurchase('unlimited_playlists')).toBe(false);
        });
    });

    describe('showUpgradeUI', () => {
        it('should dispatch showUpgradeModal event for chamber features', () => {
            let dispatchedEvent = null;

            window.addEventListener('showUpgradeModal', (e) => {
                dispatchedEvent = e.detail;
            });

            Pricing.showUpgradeUI('metadata_enrichment');

            expect(dispatchedEvent).toBeDefined();
            expect(dispatchedEvent.feature).toBe('metadata_enrichment');
            expect(dispatchedEvent.requiredTier).toBe('chamber');
        });
    });

    describe('migrateLegacyLicense', () => {
        it('should migrate isPremium license to chamber tier', () => {
            const legacy = {
                isPremium: true,
                activatedAt: '2026-01-21',
                validUntil: null
            };

            const migrated = Pricing.migrateLegacyLicense(legacy);

            expect(migrated.tier).toBe('curator');
            expect(migrated.activatedAt).toBe('2026-01-21');
            expect(migrated.migrated).toBe(true);
        });

        it('should migrate cloudSync license to chamber tier', () => {
            const legacy = {
                cloudSync: true,
                activatedAt: '2026-01-21',
                validUntil: '2027-01-21'
            };

            const migrated = Pricing.migrateLegacyLicense(legacy);

            expect(migrated.tier).toBe('chamber');
            expect(migrated.activatedAt).toBe('2026-01-21');
            expect(migrated.validUntil).toBe('2027-01-21');
            expect(migrated.migrated).toBe(true);
        });

        it('should return license unchanged if already has tier', () => {
            const license = {
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: null
            };

            const migrated = Pricing.migrateLegacyLicense(license);

            expect(migrated).toEqual(license);
            expect(migrated.migrated).toBeUndefined();
        });
    });
});
