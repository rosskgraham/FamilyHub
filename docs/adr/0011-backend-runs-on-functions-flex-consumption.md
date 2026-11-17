# The backend runs on Azure Functions Flex Consumption, not App Service F1

The family app's backend (ADR 0010) runs on Azure Functions' Flex Consumption plan instead of App Service's Free plan (F1). It's the same FastAPI app: the Python Functions library's `AsgiFunctionApp` hands each HTTP request to it, so it still runs and is tested locally as a plain FastAPI service. Flex is chosen over the older Linux Consumption plan, which retires on 30 September 2028 and gets no new features. This replaces ADR 0010's choice of F1. Everything else in ADR 0010 stands.

F1's limits were the problem. It stops for the rest of the day after 60 CPU minutes, until midnight UTC. It has no SLA, and Microsoft doesn't support it for production. Flex has no daily stop, scales to zero when idle and stays inside a free grant: 250,000 executions and 100,000 GB-seconds a month, per subscription, on the on-demand meters. The family's load is estimated at 9,000 to 10,000 executions a month, about 4% of the executions. Flex bills each execution as at least 1 second, so on the smallest instance (512 MB) that's about 5,000 GB-seconds, about 5% of the grant. Its maximum instance count is set to 1, which is plenty for a family.

Saving a change stays synchronous. The API saves the operation in Cosmos DB and tells Web PubSub in the same request, as ADR 0010 describes. Saves aren't sent through a queue: changes must be applied in the order they arrive, and neither Storage queues nor Service Bus Basic keeps order. Service Bus Standard has sessions, which do, but costs about $10 a month. Side jobs that don't need ordering use a Storage queue on the Functions app's own storage account: Web Push, the one-off import from Google Tasks, and timers.

Flex isn't entirely free. It needs a general-purpose storage account, for the deployment package and the host's own state, and that's billed separately at standard rates: pennies a month at this size. Ross approved that cost on 17 November 2026, as ADR 0008 requires. With no daily stop, a bug that loops would now cost money instead of stopping the API, so a Cost Management budget sends an alert when spending passes a small monthly amount. Budgets themselves are free. The limit of one instance also keeps a runaway small.

Flex scales to zero after a quiet spell. Microsoft doesn't say how long it waits first, and doesn't publish how long a cold start takes. Taps are still instant, because every device changes its own copy first. A cold start only delays how soon other devices see the change. The Hub still catches up every 10 to 15 minutes in waking hours as the safety net for a missed message, but it's no longer relied on to keep the API warm. If cold starts prove annoying, an always-ready instance removes them, but it's billed even when idle, with no free grant, so it would need its own approval.

## Considered Options

- **Stay on App Service F1, kept warm by the Hub:** free, but it stops for the day after 60 CPU minutes, has no SLA, and isn't supported for production.
- **Linux Consumption plan:** a similar free grant, but it retires on 30 September 2028, so it would need moving again.
- **Saves through a queue (Service Bus Standard, with sessions for ordering):** would separate the API from the save, but costs about $10 a month, and the family's load doesn't need it. Service Bus Basic and Storage queues don't keep order.
- **Azure Container Apps:** as in ADR 0010, free only if it scales to zero, and about $2 to $3.50 a month kept running in waking hours.
- **An always-ready Flex instance:** no cold starts, but its memory is billed all the time, with no free grant.
