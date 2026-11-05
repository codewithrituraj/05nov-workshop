"""Event registration API backed by Supabase."""

from functools import wraps
import os
from typing import Any, Callable

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from postgrest import APIError
from supabase import Client, create_client

load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def allowed_origins() -> set[str]:
    configured = os.environ.get("CORS_ORIGINS", "*")
    return {origin.strip() for origin in configured.split(",") if origin.strip()}


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    origins = allowed_origins()
    if "*" in origins:
        response.headers["Access-Control-Allow-Origin"] = "*"
    elif origin in origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


def error_response(message: str, status: int):
    return jsonify({"error": message}), status


def bearer_token() -> str | None:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def authenticated(handler: Callable):
    @wraps(handler)
    def wrapper(*args, **kwargs):
        token = bearer_token()
        if not token:
            return error_response("Authentication required", 401)
        try:
            response = supabase.auth.get_user(token)
            user = response.user if response else None
        except Exception:
            return error_response("Invalid or expired access token", 401)
        if not user:
            return error_response("Invalid or expired access token", 401)
        return handler(user, token, *args, **kwargs)
    return wrapper


def client_for(token: str) -> Client:
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.postgrest.auth(token)
    return client


def api_error_message(error: APIError) -> str:
    return getattr(error, "message", None) or "Database request failed"


@app.get("/")
def index():
    return jsonify({"service": "event-registration-api", "status": "ok"})


@app.get("/health")
def health():
    try:
        supabase.table("events").select("event_id").limit(1).execute()
        return jsonify({"service": "event-registration-api", "status": "ok", "supabase": "connected"}), 200
    except Exception as error:
        app.logger.warning("Supabase health check failed: %s", error)
        return jsonify({"service": "event-registration-api", "status": "degraded", "supabase": "unreachable"}), 503


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    email = body.get("email")
    password = body.get("password")
    if not isinstance(email, str) or not email.strip() or not isinstance(password, str) or not password:
        return error_response("email and password are required", 400)
    try:
        response = supabase.auth.sign_in_with_password({"email": email.strip(), "password": password})
        session = getattr(response, "session", None)
        user = getattr(response, "user", None)
        if not session or not user:
            return error_response("Invalid email or password", 401)
        return jsonify({
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "expires_at": session.expires_at,
            "user": {"id": str(user.id), "email": user.email,
                     "name": (user.user_metadata or {}).get("name") or user.email},
        }), 200
    except Exception:
        return error_response("Invalid email or password", 401)


@app.errorhandler(404)
def not_found(_error):
    return error_response("Route not found", 404)


@app.errorhandler(405)
def method_not_allowed(_error):
    return error_response("Method not allowed", 405)


@app.errorhandler(413)
def request_too_large(_error):
    return error_response("Request body is too large", 413)


@app.get("/api/events")
def list_events():
    try:
        result = supabase.table("events").select("*").order("created_at", desc=True).execute()
        return jsonify(result.data), 200
    except Exception as error:
        return error_response(api_error_message(error), 500)


@app.get("/api/events/<event_id>")
def get_event(event_id: str):
    try:
        result = supabase.table("events").select("*").eq("event_id", event_id).maybe_single().execute()
        if not result.data:
            return error_response("Event not found", 404)
        return jsonify(result.data), 200
    except Exception as error:
        return error_response(api_error_message(error), 500)


@app.post("/api/registrations")
@authenticated
def create_registration(user: Any, token: str):
    body = request.get_json(silent=True) or {}
    event_id = body.get("event_id")
    if not isinstance(event_id, str) or not event_id.strip():
        return error_response("event_id is required", 400)
    db = client_for(token)
    try:
        event = db.table("events").select("event_id, capacity").eq("event_id", event_id).maybe_single().execute()
        if not event.data:
            return error_response("Event not found", 404)
        current = db.table("registrations").select("id").eq("event_id", event_id).execute()
        capacity = event.data.get("capacity")
        if capacity is not None and len(current.data) >= int(capacity):
            return error_response("Event is full", 409)
        registration = db.table("registrations").insert({"student_id": str(user.id), "event_id": event_id}).select("*").single().execute()
        return jsonify(registration.data), 201
    except APIError as error:
        if error.code == "23505" or "duplicate" in api_error_message(error).lower():
            return error_response("Already registered for this event", 409)
        return error_response(api_error_message(error), 500)
    except Exception as error:
        return error_response(api_error_message(error), 500)


@app.get("/api/me/registrations")
@authenticated
def my_registrations(user: Any, token: str):
    try:
        result = client_for(token).table("registrations").select("*, events(*)").eq("student_id", str(user.id)).order("created_at", desc=True).execute()
        return jsonify(result.data), 200
    except Exception as error:
        return error_response(api_error_message(error), 500)


@app.get("/api/events/<event_id>/registrations")
@authenticated
def event_registrations(user: Any, token: str, event_id: str):
    db = client_for(token)
    try:
        event = db.table("events").select("event_id, student_id").eq("event_id", event_id).maybe_single().execute()
        if not event.data:
            return error_response("Event not found", 404)
        if str(event.data.get("student_id")) != str(user.id):
            return error_response("Only the event organizer can view attendees", 403)
        result = db.table("registrations").select("*").eq("event_id", event_id).order("created_at", desc=True).execute()
        return jsonify(result.data), 200
    except Exception as error:
        return error_response(api_error_message(error), 500)


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true")
