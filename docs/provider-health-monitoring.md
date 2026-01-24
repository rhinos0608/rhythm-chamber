# Provider Health Monitoring

## Overview

Rhythm Chamber implements circuit breaker pattern for AI provider reliability.

## Architecture

```
Provider Health Monitor
    ↓
├── Ollama (localhost:11434)
├── LM Studio (localhost:1234)
└── OpenRouter (api.openrouter.ai)

Status: Healthy | Degraded | Unhealthy
    ↓
Fallback: Local AI → Next Provider → Error
```

## Health Checks

### Local Providers
- TCP connection check
- /health endpoint
- Model availability
- Response time monitoring

### Cloud Providers
- API reachability
- Rate limit status
- Error rate tracking
- Credit balance

## Circuit Breaker

States:
1. **Closed**: Normal operation
2. **Open**: Provider marked unhealthy, requests bypassed
3. **Half-Open**: Test requests to check recovery

Configuration (example values):
```javascript
{
  failureThreshold: 3,
  resetTimeout: 60000,  // 1 minute
  monitoringInterval: 30000  // 30 seconds
}
```

## Fallback Chain

```
Preferred Provider (User Selected)
    ↓ (if unhealthy)
Next Available Provider
    ↓ (if all unhealthy)
Local AI (WASM transformers)
    ↓ (if unavailable)
Error Message
```

## Implementation

See: `js/services/provider-health-monitor.js`

## Monitoring UI

Status indicators in Settings:
- Green: Provider healthy
- Yellow: Provider degraded
- Red: Provider unavailable
