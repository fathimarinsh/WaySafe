# 🛡️ WaySafe — Travel Safety & Journey Preparation Web Application

> **WaySafe** is an intelligent personal safety platform engineered for travelers and commuters. It empowers users to plan safe journeys, monitor battery health with hardware-truth awareness, coordinate with trusted emergency contacts, log consensual location check-ins on OpenStreetMap, and maintain an immutable, privacy-protected travel archive.

---

## 📑 Table of Contents

1. [System Overview & Architecture](#-system-overview--architecture)
2. [Technology Stack](#-technology-stack)
3. [Project Directory Structure](#-project-directory-structure)
4. [Supabase Project Setup Guide](#-supabase-project-setup-guide)
   - [1. Create Supabase Project](#1-create-supabase-project)
   - [2. Obtain Project URL & Keys](#2-obtain-project-url--keys)
   - [3. Enable Email & Password Authentication](#3-enable-email--password-authentication)
   - [4. Configure Email Confirmation & Redirect URLs](#4-configure-email-confirmation--redirect-urls)
5. [Database Schema & Migrations](#-database-schema--migrations)
   - [Data Model & Constraints](#data-model--constraints)
   - [How to Apply SQL Migrations](#how-to-apply-sql-migrations)
6. [Row-Level Security (RLS) & Protection](#-row-level-security-rls--protection)
7. [Environment Configuration](#-environment-configuration)
8. [How to Run Locally](#-how-to-run-locally)
9. [REST API Documentation](#-rest-api-documentation)
10. [Test Checklist & Verification Results](#-test-checklist--verification-results)

---

## 🌟 System Overview & Architecture

WaySafe employs a decoupled, secure three-tier architecture:
- **Client (Frontend)**: Static HTML5 pages styled with Vanilla CSS3, powered by Vanilla JavaScript ES modules. Integrates the browser Battery Status API and Geolocation API with explicit user consent.
- **Application Server (Backend)**: Node.js and Express.js REST API providing strict server-side authentication, status transition guards, and cross-user isolation.
- **Database & Identity (Supabase)**: PostgreSQL with Row-Level Security (RLS) policies, composite foreign keys, and trigger-based state machines.

```
┌────────────────────────────────────────────────────────┐
│                   WaySafe Frontend                     │
│  (HTML5, Vanilla CSS3, ES Modules, Supabase Client)   │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       Direct Supabase (Auth)      Express REST API (/api)
                │                        │
                ▼                        ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│     Supabase Auth       │    │   WaySafe Express API   │
│  (JWT Issuance/Refresh) │    │ (Bearer JWT Verification│
└─────────────────────────┘    │  Status Machine Guards) │
                               └─────────┬───────────────┘
                                         │
                                         ▼
                               ┌─────────────────────────┐
                               │   Supabase PostgreSQL   │
                               │  (RLS, FKs, Triggers)   │
                               │  profiles, contacts,    │
                               │  trips, trip_checkins   │
                               └─────────────────────────┘
```

---

## 💻 Technology Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System with Navy `#0A192F` and Teal `#0D9488`), Vanilla JavaScript (ES6+ modules).
- **Mapping & Geodata**: Leaflet.js (v1.9.4) & OpenStreetMap tile service.
- **Backend API**: Node.js, Express.js.
- **Database**: PostgreSQL (Supabase).
- **Authentication**: Supabase Auth (Email/Password, Session Persistence via `sessionStore`).
- **Security & Authorization**: PostgreSQL Row-Level Security (RLS), Bearer token server verification via `supabase.auth.getUser(token)`, SQL triggers.

---

## 📂 Project Directory Structure

```text
WaySafe/
├── backend/
│   ├── src/
│   │   ├── server.js                  # Express application & static file server
│   │   ├── config/
│   │   │   └── supabase.js            # Supabase client & getUserClient helper
│   │   ├── middleware/
│   │   │   ├── authenticate.js        # Supabase JWT token verification
│   │   │   └── error-handler.js       # Centralized error handler
│   │   ├── routes/
│   │   │   ├── profile.js             # /api/profile routes
│   │   │   ├── contacts.js            # /api/contacts routes
│   │   │   ├── trips.js               # /api/trips routes
│   │   │   └── checkins.js            # /api/checkins routes
│   │   ├── controllers/
│   │   │   ├── profileController.js   # User profile CRUD
│   │   │   ├── contactsController.js  # Emergency contacts CRUD
│   │   │   ├── tripsController.js     # Trip lifecycle & status transitions
│   │   │   └── checkinsController.js  # Check-in logging
│   │   ├── services/
│   │   │   └── firestoreService.js    # In-memory development store fallback
│   │   └── validators/
│   │       ├── tripValidator.js       # Trip schema validation
│   │       └── contactValidator.js    # Contact input validation
│   ├── test-supabase-final-integration.js # Master acceptance test suite
│   ├── test-trip-completion-history.js    # Trip completion & history tests
│   ├── test-active-trip-checkins.js       # Active trip & check-in tests
│   ├── test-contacts-module.js            # Emergency contacts tests
│   ├── test-battery-location.js           # Battery & location logic tests
│   ├── package.json                   # Backend dependencies & npm test scripts
│   ├── .env.example                   # Backend environment template
│   └── .env                           # Local environment file (git-ignored)
├── frontend/
│   ├── index.html                     # Landing page
│   ├── login.html                     # Sign-in page
│   ├── signup.html                    # Registration page
│   ├── dashboard.html                 # Main safety dashboard
│   ├── trip-setup.html                # Route planner with OpenStreetMap
│   ├── trip-status.html               # Live journey monitoring & check-ins
│   ├── trip-completed.html            # Journey completion report
│   ├── trip-history.html              # Past travel logs & filterable history
│   ├── emergency-contacts.html        # Emergency contacts network
│   ├── low-battery.html               # Low-battery emergency protocol
│   ├── css/
│   │   ├── styles.css                 # Core design tokens & typography
│   │   ├── components.css             # Cards, buttons, modals, badges
│   │   └── responsive.css             # Mobile & tablet responsiveness
│   └── js/
│       ├── supabase-config.js         # Frontend Supabase client & storage adapter
│       ├── auth.js                    # Client authentication service
│       ├── api.js                     # HTTP API client for Express backend
│       ├── app.js                     # Global UI helpers & session watcher
│       ├── trips.js                   # Trip service & model mapping
│       ├── contacts.js                # Contacts management service
│       ├── battery.js                 # Hardware battery status monitor
│       ├── location.js                # Consensual geolocation & map links
│       └── storage.js                 # Session & local storage wrapper
├── supabase/
│   └── migrations/
│       ├── 20261011000001_create_profiles.sql      # Profiles schema & triggers
│       ├── 20261011000002_create_contacts.sql      # Contacts schema & unique keys
│       ├── 20261011000003_create_trips.sql         # Trips schema & state machine
│       ├── 20261011000004_create_trip_checkins.sql # Check-ins schema & location consent
│       └── 20261011000005_rls_and_security.sql     # RLS verification & grants
├── supabase-schema.sql                # Master unified SQL migration script
├── .env.example                       # Root environment reference
├── .gitignore                         # Git ignore rules (.env, secrets)
└── README.md                          # Comprehensive documentation
```

---

## 🔑 Supabase Project Setup Guide

### 1. Create Supabase Project
1. Navigate to [https://supabase.com](https://supabase.com) and sign in or create an account.
2. Click **New Project**, choose your organization, select a database region close to your users, and choose a secure database password.
3. Wait approximately 1-2 minutes for Supabase to provision your PostgreSQL database.

### 2. Obtain Project URL & Keys
1. In the Supabase Dashboard, open your project.
2. Navigate to **Project Settings** (gear icon in the left sidebar) ➔ **API**.
3. Under **Project URL**, copy the URL (e.g. `https://your-project-id.supabase.co`).
4. Under **Project API keys**:
   - Copy the **anon public** key (safe for client and frontend usage).
   - Copy the **service_role secret** key (keep secret; used **only** in `backend/.env`).

> [!CAUTION]
> **NEVER expose the `service_role` key in frontend files**, commit it to GitHub, or bundle it into browser-accessible scripts. The `service_role` key bypasses all Row-Level Security rules.

### 3. Enable Email & Password Authentication
1. In the left navigation, go to **Authentication** ➔ **Providers**.
2. Expand the **Email** provider.
3. Ensure **Enable Email provider** is toggled **ON**.
4. To enable immediate login without waiting for email verification during testing, toggle **Confirm email** **OFF** (or leave it **ON** if you want to test email confirmation workflows).
5. Click **Save**.

### 4. Configure Email Confirmation & Redirect URLs
1. In the left navigation, go to **Authentication** ➔ **URL Configuration**.
2. Set **Site URL** to:
   - `http://localhost:5000` (or `http://localhost:3000` depending on your local development port).
3. Under **Redirect URLs**, add:
   - `http://localhost:5000/dashboard.html`
   - `http://localhost:5000/login.html`
   - `http://localhost:3000/dashboard.html`
4. Click **Save**.

---

## 🗄️ Database Schema & Migrations

### Data Model & Constraints

#### 1. `profiles`
- `id` (UUID, Primary Key): References `auth.users(id)` with `ON DELETE CASCADE`.
- `full_name` (TEXT): User's full name.
- `created_at` (TIMESTAMPTZ, DEFAULT `now()`).
- `updated_at` (TIMESTAMPTZ, DEFAULT `now()`).
- **Trigger**: `on_auth_user_created` automatically creates a profile row whenever a new user signs up in `auth.users`.

#### 2. `contacts`
- `id` (UUID, Primary Key, DEFAULT `gen_random_uuid()`).
- `user_id` (UUID, NOT NULL): References `auth.users(id)` with `ON DELETE CASCADE`.
- `name` (TEXT, NOT NULL): Contact name.
- `phone` (TEXT, NOT NULL): Contact phone number.
- `relationship` (TEXT): Relationship label (e.g., "Sister", "Friend").
- `is_primary` (BOOLEAN, DEFAULT `false`).
- `email` (TEXT).
- `created_at` & `updated_at` (TIMESTAMPTZ).
- **Constraint**: `uq_contacts_id_user UNIQUE (id, user_id)` guarantees contact ownership can be validated via composite foreign keys.

#### 3. `trips`
- `id` (UUID, Primary Key, DEFAULT `gen_random_uuid()`).
- `user_id` (UUID, NOT NULL): References `auth.users(id)` with `ON DELETE CASCADE`.
- `trip_name` (TEXT): User-defined journey title.
- `start_location` (JSONB): Origin details.
- `destination` (JSONB, NOT NULL): Destination name or coordinates.
- `departure_time` & `estimated_arrival` (TIMESTAMPTZ).
- `trusted_contact_id` (UUID): References `contacts(id)`.
- `location_sharing_consent` (BOOLEAN, DEFAULT `false`).
- `status` (TEXT, DEFAULT `'planned'`): CHECK `status IN ('planned', 'active', 'completed', 'cancelled')`.
- `transport_mode` (TEXT, DEFAULT `'transit'`).
- `emergency_notes` (TEXT).
- `initial_battery` (INTEGER).
- `started_at`, `completed_at`, `last_check_in_at` (TIMESTAMPTZ).
- `created_at` & `updated_at` (TIMESTAMPTZ).
- **Constraint**: `FOREIGN KEY (trusted_contact_id, user_id) REFERENCES contacts(id, user_id) ON DELETE SET NULL` ensures the selected trusted contact belongs to the exact same user.
- **Trigger**: `trg_validate_trip_status` validates status transitions at the PostgreSQL level:
  - Completed and Cancelled trips are terminal states and cannot be re-opened.
  - Planned trips cannot jump directly to Completed without being started.
  - Active trips cannot be reverted to Planned.
  - Trip ownership (`user_id`) cannot be modified.

#### 4. `trip_checkins`
- `id` (UUID, Primary Key, DEFAULT `gen_random_uuid()`).
- `trip_id` (UUID, NOT NULL): References `trips(id)`.
- `user_id` (UUID, NOT NULL): References `auth.users(id)`.
- `checked_in_at` (TIMESTAMPTZ, DEFAULT `now()`).
- `location_consent` (BOOLEAN, NOT NULL, DEFAULT `false`).
- `latitude` & `longitude` (DOUBLE PRECISION): Coordinates stored only when consensual.
- `accuracy` (DOUBLE PRECISION).
- `location` (JSONB).
- `message` (TEXT).
- `type` (TEXT): CHECK `type IN ('manual', 'auto', 'im_safe', 'location_update', 'low_battery_warning', 'sos_alert', 'safe_arrival', 'status_update')`.
- `battery_level` (INTEGER).
- `is_charging` (BOOLEAN).
- `created_at` (TIMESTAMPTZ).
- **Constraint**: `FOREIGN KEY (trip_id, user_id) REFERENCES trips(id, user_id) ON DELETE CASCADE` guarantees check-ins belong to a trip owned by the same user.
- **Constraint**: `chk_checkin_location_consent CHECK (location_consent = true OR (latitude IS NULL AND longitude IS NULL))` enforces that non-consensual check-ins cannot store location coordinates.

### How to Apply SQL Migrations

You can apply the database migrations in either of two ways:

#### Option A: Supabase Dashboard SQL Editor (Recommended)
1. Open your Supabase Dashboard: [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project and navigate to **SQL Editor** in the left sidebar.
3. Click **New query**.
4. Open the file [supabase-schema.sql](file:///c:/Users/USER/Desktop/WaySafe/supabase-schema.sql) in your code editor, copy its entire contents, paste it into the Supabase SQL Editor query window.
5. Click **Run** (green button).
6. Verify that the query completes with `Success. No rows returned`.

#### Option B: Supabase CLI
If you have the Supabase CLI installed locally:
```bash
supabase link --project-ref your-project-id
supabase db push
```

---

## 🔒 Row-Level Security (RLS) & Protection

Row-Level Security is strictly enabled on every public table. Anonymous/public access is revoked (`REVOKE ALL FROM anon, public`).

- **Profiles**:
  - `SELECT`: `auth.uid() = id`
  - `INSERT`: `auth.uid() = id`
  - `UPDATE`: `auth.uid() = id`
- **Contacts**:
  - `SELECT`, `INSERT`, `UPDATE`, `DELETE`: `auth.uid() = user_id`
- **Trips**:
  - `SELECT`, `DELETE`: `auth.uid() = user_id`
  - `INSERT`, `UPDATE`: `auth.uid() = user_id AND (trusted_contact_id IS NULL OR EXISTS (SELECT 1 FROM contacts WHERE id = trips.trusted_contact_id AND user_id = auth.uid()))`
- **Trip Check-ins**:
  - `SELECT`: `auth.uid() = user_id`
  - `INSERT`: `auth.uid() = user_id AND EXISTS (SELECT 1 FROM trips WHERE id = trip_checkins.trip_id AND user_id = auth.uid() AND status = 'active') AND (location_consent = true OR (latitude IS NULL AND longitude IS NULL))`

---

## ⚙️ Environment Configuration

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:
```env
PORT=5000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000,http://127.0.0.1:5500,http://localhost:5000

# Supabase Credentials (from Supabase Dashboard -> Project Settings -> API)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Allow mock tokens during offline automated test runs
ALLOW_DEV_MOCK_AUTH=true
```

### Frontend (`frontend/js/supabase-config.js`)

Ensure `frontend/js/supabase-config.js` contains your public Project URL and Anon Key:
```javascript
export const SUPABASE_URL = 'https://your-project-id.supabase.co';
export const SUPABASE_ANON_KEY = 'your-supabase-anon-key';
```

---

## 🚀 How to Run Locally

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Start the Backend & Serve Frontend
```bash
npm start
```
The server starts on port `5000` and serves both the REST API and the frontend assets:
- **Web App**: [http://localhost:5000](http://localhost:5000) or [http://localhost:5000/index.html](http://localhost:5000/index.html)
- **API Health**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🌐 REST API Documentation

All protected endpoints require an `Authorization: Bearer <token>` header with a verified Supabase access token.

### Health
- `GET /api/health` — Service health and database provider status.

### User Profile
- `GET /api/profile` — Fetch authenticated user profile.
- `POST /api/profile` — Upsert user profile (`{ full_name }`).

### Emergency Contacts
- `GET /api/contacts` — List authenticated user's contacts.
- `POST /api/contacts` — Create contact (`{ name, phone, relationship, isPrimary }`).
- `PATCH /api/contacts/:id` — Update contact details.
- `DELETE /api/contacts/:id` — Delete contact.

### Trips
- `GET /api/trips?status=planned|active|completed|cancelled&sort=created_at&order=desc` — List trips with validated status filtering, safe sorting, and aggregated check-in counts.
- `GET /api/trips/active` — Retrieve current active trip.
- `GET /api/trips/:id` — Get trip details by ID.
- `POST /api/trips` — Create planned or active trip.
- `PATCH /api/trips/:id` — Update trip details (with status transition guards).
- `POST /api/trips/:id/start` — Start a planned trip (sets status to `active`).
- `POST /api/trips/:id/end` — Conclude an active trip (sets status to `completed`, records completion timestamp and safe arrival log).
- `DELETE /api/trips/:id` — Delete trip record.

### Check-ins
- `POST /api/trips/:id/checkins` — Record consensual check-in with server-generated timestamp.
- `GET /api/trips/:id/checkins` — Retrieve check-in timeline and coordinates for a trip.

---

## ✅ Test Checklist & Verification Results

Run the full automated test suite from the `backend/` directory:

```bash
npm run test:all
```

| Test Area | Suite File | Tests | Status |
| :--- | :--- | :---: | :---: |
| **Supabase Final Integration & RLS Isolation** | `test-supabase-final-integration.js` | 66/66 | ✅ PASSED |
| **Trip Completion & History Retrieval** | `test-trip-completion-history.js` | 58/58 | ✅ PASSED |
| **Active Trip & Check-in Logging** | `test-active-trip-checkins.js` | 32/32 | ✅ PASSED |
| **Emergency Contacts Management** | `test-contacts-module.js` | 33/33 | ✅ PASSED |
| **Hardware Battery & Location Validation** | `test-battery-location.js` | 50/50 | ✅ PASSED |
| **Total Automated Tests** | | **239/239** | **100% SUCCESS** |

### Verified Test Cases:
- [x] **Missing & Malformed Access Tokens**: Rejects with `401 Unauthorized`.
- [x] **User Identity Derivation**: User ID strictly extracted from verified JWT, never trusting client-supplied parameters.
- [x] **Profile Creation & Sync**: Protected profile creation via `POST /api/profile`.
- [x] **Contact CRUD**: Full lifecycle with server-side validation.
- [x] **Trip Lifecycle & Status Transitions**:
  - `planned` ➔ `active` ➔ `completed`.
  - Blocks starting completed/cancelled trips (`400 Bad Request`).
  - Blocks completing unstarted planned trips (`400 Bad Request`).
  - Blocks reverting active trips to planned (`400 Bad Request`).
  - Blocks re-opening completed trips (`400 Bad Request`).
- [x] **Consensual Location Privacy**: Coordinates saved only when explicit consent is provided; suppressed otherwise.
- [x] **History & Validated Filtering**: Queries with `?status=...` filtered accurately; invalid status strings rejected with `400`.
- [x] **Cross-User Access Isolation**: User B receives `404 Not Found` when attempting to access, edit, end, check in on, or delete User A's records.
- [x] **Database Error Handling**: Database write failures return `500 Internal Server Error` instead of false successes.
- [x] **Empty States**: Returns structured empty arrays allowing frontend UI to display helpful zero-state cards.

---

### Pending Manual Verification (In Your Supabase Project):
If you have not already executed the master SQL migration in your Supabase project:
1. Open **Supabase Dashboard** ➔ **SQL Editor**.
2. Run [supabase-schema.sql](file:///c:/Users/USER/Desktop/WaySafe/supabase-schema.sql) to apply the latest composite foreign key constraints and status transition triggers.
