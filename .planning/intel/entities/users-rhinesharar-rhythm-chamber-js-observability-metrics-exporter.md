---
path: /Users/rhinesharar/rhythm-chamber/js/observability/metrics-exporter.js
type: service
updated: 2026-01-22
status: active
---

# metrics-exporter.js

## Purpose

Provides comprehensive metrics export and scheduling functionality with support for multiple export formats (JSON, CSV, Prometheus, InfluxDB) and external service integrations (Datadog, New Relic, Prometheus Pushgateway).

## Exports

- **ExportFormat**: Enum of export format types (JSON, CSV, PROMETHEUS, INFLUXDB)
- **ScheduleType**: Enum of export schedule types (IMMEDIATE, HOURLY, DAILY, WEEKLY, MONTHLY)
- **ExternalService**: Enum of external service integration types (DATADOG, NEWRELIC, PROMETHEUS_PUSHGATEWAY, CUSTOM_ENDPOINT)
- **MetricsExporter**: Main class for managing metrics export jobs, scheduling, and external service integrations
- **flatMetrics**: Utility function to flatten nested metrics objects
- **getMetricsExporter**: Singleton accessor function for the MetricsExporter instance
- **resetMetricsExporter**: Function to reset the singleton instance (primarily for testing)

## Dependencies

- [[performance-profiler]]
- [[core-web-vitals]]

## Used By

TBD

## Notes

Supports encrypted storage of external service credentials and provides aggregation windows for batched exports. Includes job scheduling with success/failure tracking.