from fastapi import FastAPI
from server import app as fastapi_app
from mangum import Mangum

# Vercel serverless handler
handler = Mangum(fastapi_app)

# Export for Vercel
def handler_function(event, context):
    return handler(event, context)
