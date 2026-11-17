"""The Azure Functions entry point. AsgiFunctionApp hands every HTTP request to the FastAPI app, which does
its own routing and sign-in checks, so the function itself is anonymous (ADR 0011)."""

import azure.functions as func

from familyhub_api.main import app as fastapi_app

app = func.AsgiFunctionApp(app=fastapi_app, http_auth_level=func.AuthLevel.ANONYMOUS)
