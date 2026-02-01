/**
 * MobileResponsivityController Unit Tests
 *
 * Tests the mobile responsiveness functionality
 * @module tests/unit/sidebar/mobile-responsiveness.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MobileResponsivityController } from '../../../js/controllers/sidebar/mobile-responsiveness.js';

describe('MobileResponsivityController', () => {
  let mockSidebar;
  let mockOverlay;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Create mock DOM elements
    mockSidebar = document.createElement('div');
    mockSidebar.id = 'chat-sidebar';
    document.body.appendChild(mockSidebar);

    mockOverlay = document.createElement('div');
    mockOverlay.id = 'sidebar-overlay';
    document.body.appendChild(mockOverlay);

    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Public API', () => {
    it('should have isMobile method', () => {
      expect(MobileResponsivityController.isMobile).toBeDefined();
    });

    it('should have openMobileSidebar method', () => {
      expect(MobileResponsivityController.openMobileSidebar).toBeDefined();
    });

    it('should have closeMobileSidebar method', () => {
      expect(MobileResponsivityController.closeMobileSidebar).toBeDefined();
    });

    it('should have setMobileSidebarState method', () => {
      expect(MobileResponsivityController.setMobileSidebarState).toBeDefined();
    });

    it('should have updateOverlayVisibility method', () => {
      expect(MobileResponsivityController.updateOverlayVisibility).toBeDefined();
    });

    it('should have MOBILE_BREAKPOINT constant', () => {
      expect(MobileResponsivityController.MOBILE_BREAKPOINT).toBe(768);
    });
  });

  describe('isMobile', () => {
    it('should return true when viewport is mobile size', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      expect(MobileResponsivityController.isMobile()).toBe(true);
    });

    it('should return true when viewport equals breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      });

      expect(MobileResponsivityController.isMobile()).toBe(true);
    });

    it('should return false when viewport is desktop size', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      expect(MobileResponsivityController.isMobile()).toBe(false);
    });
  });

  describe('openMobileSidebar', () => {
    it('should add open class on mobile viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      MobileResponsivityController.openMobileSidebar(mockSidebar);

      expect(mockSidebar.classList.contains('open')).toBe(true);
    });

    it('should not add open class on desktop viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      MobileResponsivityController.openMobileSidebar(mockSidebar);

      expect(mockSidebar.classList.contains('open')).toBe(false);
    });

    it('should handle null sidebar gracefully', () => {
      expect(() => {
        MobileResponsivityController.openMobileSidebar(null);
      }).not.toThrow();
    });
  });

  describe('closeMobileSidebar', () => {
    it('should remove open class', () => {
      mockSidebar.classList.add('open');

      MobileResponsivityController.closeMobileSidebar(mockSidebar);

      expect(mockSidebar.classList.contains('open')).toBe(false);
    });

    it('should handle null sidebar gracefully', () => {
      expect(() => {
        MobileResponsivityController.closeMobileSidebar(null);
      }).not.toThrow();
    });
  });

  describe('setMobileSidebarState', () => {
    it('should add open class when shouldOpen is true on mobile', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      MobileResponsivityController.setMobileSidebarState(mockSidebar, true);

      expect(mockSidebar.classList.contains('open')).toBe(true);
    });

    it('should remove open class when shouldOpen is false on mobile', () => {
      mockSidebar.classList.add('open');
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      MobileResponsivityController.setMobileSidebarState(mockSidebar, false);

      expect(mockSidebar.classList.contains('open')).toBe(false);
    });

    it('should not modify classes on desktop viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      MobileResponsivityController.setMobileSidebarState(mockSidebar, true);

      expect(mockSidebar.classList.contains('open')).toBe(false);
    });
  });

  describe('updateOverlayVisibility', () => {
    it('should add visible class when sidebar not collapsed and mobile', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      MobileResponsivityController.updateOverlayVisibility(mockOverlay, false);

      expect(mockOverlay.classList.contains('visible')).toBe(true);
    });

    it('should remove visible class when sidebar is collapsed', () => {
      mockOverlay.classList.add('visible');
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      MobileResponsivityController.updateOverlayVisibility(mockOverlay, true);

      expect(mockOverlay.classList.contains('visible')).toBe(false);
    });

    it('should remove visible class on desktop viewport', () => {
      mockOverlay.classList.add('visible');
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      MobileResponsivityController.updateOverlayVisibility(mockOverlay, false);

      expect(mockOverlay.classList.contains('visible')).toBe(false);
    });

    it('should handle null overlay gracefully', () => {
      expect(() => {
        MobileResponsivityController.updateOverlayVisibility(null, false);
      }).not.toThrow();
    });
  });
});
