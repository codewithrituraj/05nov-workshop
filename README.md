# Event Registration API

Flask API deployed on Render with Supabase Auth and Supabase Postgres.

## Deploy to Render

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint** and select the repository. Render will read `render.yaml`.
3. Add `SUPABASE_URL` and `SUPABASE_KEY` as secret environment variables. Use the Supabase publishable/anon key, never the `service_role` key.
4. Set `CORS_ORIGINS` to the deployed frontend origin(s), comma-separated. Keep `*` only for development.
5. Run [`supabase/setup.sql`](supabase/setup.sql) once in the Supabase SQL Editor.
6. Create Supabase Auth users and add matching rows to `public.users`:

```sql
insert into public.users (uuid, email, role)
values ('AUTH_USER_UUID', 'student@example.com', 'student');
```

Render starts the service with Gunicorn and checks `/health`.

## API authentication

Send the Supabase access token on protected endpoints:

```http
Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN
```

Registration body:

```json
{"event_id": "EVENT_UUID"}
```

## Endpoints

| Method | Endpoint | Auth |
| --- | --- | --- |
| GET | `/api/events` | Public |
| GET | `/api/events/{id}` | Public |
| POST | `/api/registrations` | Required |
| GET | `/api/me/registrations` | Required |
| GET | `/api/events/{id}/registrations` | Event organizer only |
