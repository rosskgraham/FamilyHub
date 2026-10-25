# Telemetry goes through an OpenTelemetry Collector on the Pi to Azure Application Insights

The app emits traces, metrics and logs using only the standard OpenTelemetry API, and sends them to an OpenTelemetry Collector running beside it on the Pi, which forwards them to Azure Application Insights. The screen's browser code reports through the Hub's server, so only the Collector talks to Azure. Azure is an odd neighbour for a Google-data project, but it's the monitoring stack the project's owner runs at work. The Collector is the one place that strips anything personal (Event titles, Shopping items, names) before data leaves the house, and it buffers while the internet is down. The connection to Azure is outbound only, so ADR 0002 still holds.

## Considered Options

- **Azure Monitor exporter inside the app:** lighter on the Pi, but the privacy filter would live in app code and the app would be tied to Azure's package.
- **Local-only logs with phone push alerts:** no cloud dependency, but no searchable history or dashboards.
