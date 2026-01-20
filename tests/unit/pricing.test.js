/**
 * Pricing Module Tests
 *
 * Tests for Three-Pillar Pricing Model (Sovereign, Curator, Chamber)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pricing } from '../../js/pricing.js';

describe('Pricing Module', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        if (typeof localStorage !== 'undefined') {
            localStorage.clear();
        }
    });

    afterEach(() => {
        // Clean up after each test
        if (typeof localStorage !== 'undefined') {
            localStorage.clear();
        }
    });

    describe('Tier Definitions', () => {
        it('should have three tier definitions', () => {
            expect(Object.keys(Pricing.TIERS)).toHaveLength(3);
            expect(Pricing.TIERS.sovereign).toBeDefined();
            expect(Pricing.TIERS.curator).toBeDefined();
            expect(Pricing.TIERS.chamber).toBeDefined();
        });

        it('should have tier levels ordered correctly', () => {
            expect(Pricing.TIERS.sovereign.level).toBe(1);
            expect(Pricing.TIERS.curator.level).toBe(2);
            expect(Pricing.TIERS.chamber.level).toBe(3);
        });

        it('should have tier names', () => {
            expect(Pricing.TIERS.sovereign.name).toBe('The Sovereign');
            expect(Pricing.TIERS.curator.name).toBe('The Curator');
            expect(Pricing.TIERS.chamber.name).toBe('The Chamber');
        });

        it('should have tier prices', () => {
            expect(Pricing.TIERS.sovereign.price).toBe('$0');
            expect(Pricing.TIERS.curator.price).toBe('$19.99 one-time');
            expect(Pricing.TIERS.chamber.price).toBe('$4.99/mo or $39/yr');
        });
    });

    describe('Feature Definitions', () => {
        it('should have 15 feature definitions', () => {
            expect(Object.keys(Pricing.FEATURES)).toHaveLength(15);
        });

        it('should have sovereign features', () => {
            expect(Pricing.FEATURES.full_local_analysis.tier).toBe('sovereign');
            expect(Pricing.FEATURES.byoi_chat.tier).toBe('sovereign');
            expect(Pricing.FEATURES.basic_cards.tier).toBe('sovereign');
            expect(Pricing.FEATURES.personality_reveal.tier).toBe('sovereign');
            expect(Pricing.FEATURES.demo_mode.tier).toBe('sovereign');
        });

        it('should have curator features', () => {
            expect(Pricing.FEATURES.pkm_export.tier).toBe('curator');
            expect(Pricing.FEATURES.relationship_resonance.tier).toBe('curator');
            expect(Pricing.FEATURES.deep_enrichment.tier).toBe('curator');
            expect(Pricing.FEATURES.metadata_fixer.tier).toBe('curator');
            expect(Pricing.FEATURES.verified_badge.tier).toBe('curator');
        });

        it('should have chamber features', () => {
            expect(Pricing.FEATURES.e2ee_sync.tier).toBe('chamber');
            expect(Pricing.FEATURES.chamber_portal.tier).toBe('chamber');
            expect(Pricing.FEATURES.managed_ai.tier).toBe('chamber');
            expect(Pricing.FEATURES.weekly_insights.tier).toBe('chamber');
            expect(Pricing.FEATURES.priority_support.tier).toBe('chamber');
        });
    });

    describe('getCurrentTier', () => {
        it('should return sovereign tier when no license exists', () => {
            const tier = Pricing.getCurrentTier();
            expect(tier).toBe('sovereign');
        });

        it('should return curator tier when curator license exists', () => {
            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'curator',
                activatedAt: '2026-01-21'
            }));

            const tier = Pricing.getCurrentTier();
            expect(tier).toBe('curator');
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
        });

        it('should deny access to curator features for sovereign users', () => {
            expect(Pricing.hasFeatureAccess('pkm_export')).toBe(false);
            expect(Pricing.hasFeatureAccess('relationship_resonance')).toBe(false);
            expect(Pricing.hasFeatureAccess('deep_enrichment')).toBe(false);
            expect(Pricing.hasFeatureAccess('metadata_fixer')).toBe(false);
            expect(Pricing.hasFeatureAccess('verified_badge')).toBe(false);
        });

        it('should allow access to curator features for curator users', () => {
            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'curator',
                activatedAt: '2026-01-21'
            }));

            expect(Pricing.hasFeatureAccess('pkm_export')).toBe(true);
            expect(Pricing.hasFeatureAccess('relationship_resonance')).toBe(true);
            expect(Pricing.hasFeatureAccess('deep_enrichment')).toBe(true);
            expect(Pricing.hasFeatureAccess('metadata_fixer')).toBe(true);
            expect(Pricing.hasFeatureAccess('verified_badge')).toBe(true);
        });

        it('should deny access to chamber features for curator users', () => {
            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'curator',
                activatedAt: '2026-01-21'
            }));

            expect(Pricing.hasFeatureAccess('e2ee_sync')).toBe(false);
            expect(Pricing.hasFeatureAccess('chamber_portal')).toBe(false);
            expect(Pricing.hasFeatureAccess('managed_ai')).toBe(false);
            expect(Pricing.hasFeatureAccess('weekly_insights')).toBe(false);
            expect(Pricing.hasFeatureAccess('priority_support')).toBe(false);
        });

        it('should allow access to chamber features for chamber users', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'chamber',
                activatedAt: '2026-01-21',
                validUntil: futureDate.toISOString()
            }));

            expect(Pricing.hasFeatureAccess('e2ee_sync')).toBe(true);
            expect(Pricing.hasFeatureAccess('chamber_portal')).toBe(true);
            expect(Pricing.hasFeatureAccess('managed_ai')).toBe(true);
            expect(Pricing.hasFeatureAccess('weekly_insights')).toBe(true);
            expect(Pricing.hasFeatureAccess('priority_support')).toBe(true);
        });
    });

    describe('getAvailableFeatures', () => {
        it('should return only sovereign features for free users', () => {
            const features = Pricing.getAvailableFeatures();
            expect(features).toHaveLength(5);
            expect(features).toContain('full_local_analysis');
            expect(features).toContain('byoi_chat');
            expect(features).toContain('basic_cards');
            expect(features).toContain('personality_reveal');
            expect(features).toContain('demo_mode');
        });

        it('should return sovereign and curator features for curator users', () => {
            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'curator',
                activatedAt: '2026-01-21'
            }));

            const features = Pricing.getAvailableFeatures();
            expect(features).toHaveLength(10);
            expect(features).toContain('full_local_analysis');
            expect(features).toContain('pkm_export');
            expect(features).toContain('relationship_resonance');
            expect(features).toContain('deep_enrichment');
            expect(features).toContain('metadata_fixer');
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
            expect(features).toHaveLength(15);
        });
    });

    describe('getCurrentTierInfo', () => {
        it('should return sovereign tier info for free users', () => {
            const info = Pricing.getCurrentTierInfo();
            expect(info.name).toBe('The Sovereign');
            expect(info.level).toBe(1);
            expect(info.price).toBe('$0');
            expect(info.features).toHaveLength(5);
        });

        it('should return curator tier info for curator users', () => {
            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'curator',
                activatedAt: '2026-01-21'
            }));

            const info = Pricing.getCurrentTierInfo();
            expect(info.name).toBe('The Curator');
            expect(info.level).toBe(2);
            expect(info.price).toBe('$19.99 one-time');
            expect(info.features).toHaveLength(5);
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
            expect(info.level).toBe(3);
            expect(info.price).toBe('$4.99/mo or $39/yr');
            expect(info.features).toHaveLength(5);
        });
    });

    describe('getFeatureDefinition', () => {
        it('should return feature definition for valid feature', () => {
            const feature = Pricing.getFeatureDefinition('pkm_export');
            expect(feature).toBeDefined();
            expect(feature.name).toBe('PKM Export');
            expect(feature.description).toBeDefined();
            expect(feature.tier).toBe('curator');
        });

        it('should return null for invalid feature', () => {
            const feature = Pricing.getFeatureDefinition('invalid_feature');
            expect(feature).toBeNull();
        });
    });

    describe('requiresUpgrade', () => {
        it('should return false for sovereign features', () => {
            expect(Pricing.requiresUpgrade('full_local_analysis')).toBe(false);
            expect(Pricing.requiresUpgrade('byoi_chat')).toBe(false);
        });

        it('should return true for curator features when user is sovereign', () => {
            expect(Pricing.requiresUpgrade('pkm_export')).toBe(true);
            expect(Pricing.requiresUpgrade('relationship_resonance')).toBe(true);
        });

        it('should return true for chamber features when user is sovereign', () => {
            expect(Pricing.requiresUpgrade('e2ee_sync')).toBe(true);
            expect(Pricing.requiresUpgrade('chamber_portal')).toBe(true);
        });

        it('should return false for curator features when user is curator', () => {
            localStorage.setItem('rhythm_chamber_license', JSON.stringify({
                tier: 'curator',
                activatedAt: '2026-01-21'
            }));

            expect(Pricing.requiresUpgrade('pkm_export')).toBe(false);
            expect(Pricing.requiresUpgrade('relationship_resonance')).toBe(false);
        });
    });

    describe('getRequiredTier', () => {
        it('should return sovereign tier for sovereign features', () => {
            expect(Pricing.getRequiredTier('full_local_analysis')).toBe('sovereign');
            expect(Pricing.getRequiredTier('demo_mode')).toBe('sovereign');
        });

        it('should return curator tier for curator features', () => {
            expect(Pricing.getRequiredTier('pkm_export')).toBe('curator');
            expect(Pricing.getRequiredTier('deep_enrichment')).toBe('curator');
        });

        it('should return chamber tier for chamber features', () => {
            expect(Pricing.getRequiredTier('e2ee_sync')).toBe('chamber');
            expect(Pricing.getRequiredTier('managed_ai')).toBe('chamber');
        });

        it('should return null for invalid feature', () => {
            expect(Pricing.getRequiredTier('invalid_feature')).toBeNull();
        });
    });

    describe('requiresSubscription', () => {
        it('should return false for sovereign features', () => {
            expect(Pricing.requiresSubscription('full_local_analysis')).toBe(false);
        });

        it('should return false for curator features', () => {
            expect(Pricing.requiresSubscription('pkm_export')).toBe(false);
            expect(Pricing.requiresSubscription('relationship_resonance')).toBe(false);
        });

        it('should return true for chamber features', () => {
            expect(Pricing.requiresSubscription('e2ee_sync')).toBe(true);
            expect(Pricing.requiresSubscription('managed_ai')).toBe(true);
            expect(Pricing.requiresSubscription('weekly_insights')).toBe(true);
        });
    });

    describe('requiresOneTimePurchase', () => {
        it('should return false for sovereign features', () => {
            expect(Pricing.requiresOneTimePurchase('full_local_analysis')).toBe(false);
        });

        it('should return true for curator features', () => {
            expect(Pricing.requiresOneTimePurchase('pkm_export')).toBe(true);
            expect(Pricing.requiresOneTimePurchase('relationship_resonance')).toBe(true);
            expect(Pricing.requiresOneTimePurchase('deep_enrichment')).toBe(true);
        });

        it('should return false for chamber features', () => {
            expect(Pricing.requiresOneTimePurchase('e2ee_sync')).toBe(false);
            expect(Pricing.requiresOneTimePurchase('managed_ai')).toBe(false);
        });
    });

    describe('migrateLegacyLicense', () => {
        it('should migrate isPremium license to curator tier', () => {
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
                tier: 'curator',
                activatedAt: '2026-01-21',
                validUntil: null
            };

            const migrated = Pricing.migrateLegacyLicense(license);

            expect(migrated).toEqual(license);
            expect(migrated.migrated).toBeUndefined();
        });
    });

    describe('showUpgradeUI', () => {
        it('should dispatch showUpgradeModal event for curator features', () => {
            let dispatchedEvent = null;

            window.addEventListener('showUpgradeModal', (e) => {
                dispatchedEvent = e.detail;
            });

            Pricing.showUpgradeUI('pkm_export');

            expect(dispatchedEvent).toBeDefined();
            expect(dispatchedEvent.feature).toBe('pkm_export');
            expect(dispatchedEvent.requiredTier).toBe('curator');
        });

        it('should dispatch showUpgradeModal event for chamber features', () => {
            let dispatchedEvent = null;

            window.addEventListener('showUpgradeModal', (e) => {
                dispatchedEvent = e.detail;
            });

            Pricing.showUpgradeUI('e2ee_sync');

            expect(dispatchedEvent).toBeDefined();
            expect(dispatchedEvent.feature).toBe('e2ee_sync');
            expect(dispatchedEvent.requiredTier).toBe('chamber');
        });
    });
});
