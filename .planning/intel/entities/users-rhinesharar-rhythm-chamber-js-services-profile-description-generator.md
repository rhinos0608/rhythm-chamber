---
path: /Users/rhinesharar/rhythm-chamber/js/services/profile-description-generator.js
type: service
updated: 2026-01-21
status: active
---

# profile-description-generator.js

## Purpose

Generates AI-powered custom personality descriptions based on actual listening data when an LLM provider is configured, with fallback to generic descriptions.

## Exports

- `ProfileDescriptionGenerator` - Main service class for generating profile descriptions
- `checkLLMAvailability()` - Checks if LLM provider is available for generation
- `buildDescriptionPrompt()` - Builds the prompt for generating personalized descriptions
- `generateProfileDescription()` - Generates a profile description using LLM or fallback

## Dependencies

- [[js-services-config-loader]]
- [[js-settings]]
- [[js-providers-provider-interface]]

## Used By

TBD

## Notes

- Handles async description generation with loading states
- Supports OpenRouter, Ollama, and LM Studio providers
- Falls back to generic descriptions if LLM unavailable