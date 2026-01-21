---
path: /Users/rhinesharar/rhythm-chamber/js/observability/metrics-exporter.js
type: service
updated: 2026-01-21
status: active
---

# metrics-exporter.js

## Purpose

Comprehensive metrics export and scheduling framework supporting multiple formats (JSON, CSV, Prometheus, InfluxDB) and external service integrations (Datadog, New Relic, Prometheus Pushgateway).

## Exports

- **ExportFormat** - Enum of export format types (JSON, CSV, PROMETHEUS, INFLUXDB)
- **ScheduleType** - Enum of export schedule types (IMMEDIATE, HOURLY, DAILY, WEEKLY, MONTHLY)
- **ExternalService** - Enum of external service integration types (DATADOG, NEWRELIC, PROMETHEUS_PUSHGATEWAY, CUSTOM_ENDPOINT)
- **MetricsExporter** - Main class for metrics export with scheduling and external service integration
- **flatMetrics** - Utility function to flatten nested metric objects
- **getMetricsExporter** - Factory function to retrieve or create MetricsExporter singleton instance
- **default** - Default export (MetricsExporter class or getMetricsExporter)

## Dependencies

- [[performance-profiler]]
- [[core-web-vitals]]

## Used By

TBD

## Notes

Manages scheduled export jobs, external service credentials (encrypted), and supports aggregation windows for metrics data.