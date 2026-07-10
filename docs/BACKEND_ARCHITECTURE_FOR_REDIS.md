# SwiftStay — Backend Architecture Overview (for Redis Caching)

> Purpose: a structured map of the SwiftStay backend to plan a Redis caching layer.
> Stack: **NestJS 11 + raw `pg` (node-postgres) Pool + PostgreSQL + JWT/Passport + bcrypt**. No ORM, no cache, no queue, no rate limiter today.
> Scope: analysis only. Nothing is implemented here.

---

## 1. Project Overview

### What the application does
SwiftStay is a **short-stay / time-slot room booking platform**. Rooms are listed with a price, images, location and amenities. Each room exposes bookable **time slots** on specific dates (`RoomSlot`). A logged-in user picks a slot, holds it briefly with a **lock**, then confirms a **booking**. Users can view and cancel their bookings.

The frontend (Next.js app router) has these pages, which mirror the backend surface:
`/` (home) · `/login` · `/signup` · `/rooms` (list) · `/rooms/[id]` (detail) · `/bookings` (my bookings).

### Main business flow
1. **Sign up** → create account (`POST /signup`).
2. **Log in** → receive a JWT (`POST /login`). All room/booking routes require this token.
3. **Browse rooms** → list (`GET /rooms`) and detail (`GET /rooms/:id`).
4. **Check availability** → fetch free slots for a room on a date (`POST /rooms/slots`).
5. **Hold the slot** → acquire a 60-second lock (`POST /bookings/slots/:slotId/lock`).
6. **Confirm** → create the booking (`POST /bookings`). Uniqueness on `slotId` prevents double-booking.
7. **Manage** → list own bookings with computed status (`GET /bookings`), cancel one (`DELETE /bookings/:id`).

### User journey
```
Visitor → Signup → Login (JWT)
   → Browse room list → Open room detail (images, amenities)
   → Pick a date → See available slots
   → Lock a slot (60s hold) → Confirm booking
   → View "My Bookings" (Upcoming / Ongoing / Completed / Cancelled)
   → Optionally cancel a booking
```

---

## 2. API Inventory

All routes are served from the `pg` connection pool via `DbService.query()`. **Every `/rooms/*` and `/bookings/*` route is protected by `JwtAuthGuard`.** `/signup`, `/login`, and `/` are public.

Complexity legend: **Low** = single simple query / no query · **Medium** = multiple queries or joins or post-processing · **High** = multi-query transactions, locking, or heavy per-row computation.

---

**GET /**
- **Controller:** `AppController.getHello`
- **Service:** `AppService.getHello`
- **Reads:** No
- **Writes:** No
- **Tables:** none
- **Complexity:** Low
- **Description:** Health/hello string (`"Hello World From NestJs!"`). No DB, no auth.

---

**POST /signup**
- **Controller:** `SignupController.createUser`
- **Service:** `SignupService.createUser`
- **Reads:** Yes (email existence check)
- **Writes:** Yes (insert user)
- **Tables:** `User`
- **Complexity:** Medium
- **Description:** Checks if email exists; if not, bcrypt-hashes password (10 salt rounds) and inserts. Returns success/`ConflictException`. Cost is dominated by **bcrypt hashing** (CPU), not the DB.

---

**POST /login**
- **Controller:** `LoginController.checkLogin`
- **Service:** `LoginService.checkLogin`
- **Reads:** Yes (fetch user by email)
- **Writes:** No
- **Tables:** `User`
- **Complexity:** Medium
- **Description:** Looks up user by email, `bcrypt.compare` the password, signs a JWT (`{id, email, naam}`) on success. Cost is dominated by **bcrypt compare** (CPU).

---

**GET /auth/me**
- **Controller:** `AuthController.me`
- **Service:** — (none; returns `req.user`)
- **Reads:** No
- **Writes:** No
- **Tables:** none
- **Complexity:** Low
- **Description:** Returns the decoded JWT payload attached by `JwtStrategy.validate`. Pure token echo — no DB round-trip.

---

**GET /rooms**
- **Controller:** `RoomController.getRooms`
- **Service:** `RoomService.getRooms`
- **Reads:** Yes
- **Writes:** No
- **Tables:** `Room`
- **Complexity:** Low
- **Description:** `SELECT * FROM "Room" ORDER BY price`. Returns the full catalog. Same result for every user — **prime cache candidate**.

---

**GET /rooms/:id**
- **Controller:** `RoomController.getRoomById`
- **Service:** `RoomService.getRoomById`
- **Reads:** Yes
- **Writes:** No
- **Tables:** `Room`, `roomimages`, `Amenities`, `room_amenities`
- **Complexity:** Medium
- **Description:** Runs **4 sequential queries**: (1) verify room id exists, (2) fetch all images, (3) fetch room fields, (4) join `Amenities ⋈ room_amenities`. Assembles a single payload (images array + amenities array). Read-heavy, rarely changes — **prime cache candidate**.

---

**POST /rooms/slots**
- **Controller:** `RoomController.getSlotByRoomId`
- **Service:** `RoomService.getSlotsBy_RoomId_And_Date`
- **Reads:** Yes
- **Writes:** No
- **Tables:** `RoomSlot`, `Booking` (subquery)
- **Complexity:** Medium
- **Description:** Returns slots for a `roomId` + `slotDate` that are **not** already in `Booking` for that date (`NOT IN` subquery), then filters out past slots in JS using IST (`Asia/Kolkata`) time. **Availability check** — changes as bookings happen; cache only with short TTL.

---

**POST /bookings**
- **Controller:** `BookingController.createBooking`
- **Service:** `BookingService.createBooking`
- **Reads:** Yes (lock check, slot date/time check)
- **Writes:** Yes (insert booking)
- **Tables:** `slot_locks`, `RoomSlot`, `Booking`
- **Complexity:** High
- **Description:** Confirms the user holds a lock on the slot, re-validates in SQL that the slot has not ended (IST), then inserts the booking (`booking_date` pulled from the slot inside SQL). Relies on the **unique constraint on `Booking.slotId`** to reject double-booking (`23505` → "Slot already booked").

---

**POST /bookings/slots/:slotId/lock**
- **Controller:** `BookingController.lockSlot`
- **Service:** `BookingService.lockSlot`
- **Reads:** Yes
- **Writes:** Yes (insert lock)
- **Tables:** `Booking`, `RoomSlot`, `slot_locks`
- **Complexity:** High
- **Description:** Meant to be a transaction: `BEGIN` → check slot not already booked → `SELECT ... FOR UPDATE` on the slot row → delete stale locks → check for existing lock → insert a lock valid for `NOW() + 60s` → `COMMIT`. This is a **DB-backed distributed lock with TTL** — the single strongest Redis candidate in the codebase. ⚠️ See §11 for a transaction-correctness caveat.

---

**DELETE /bookings/slots/:slotId/lock**
- **Controller:** `BookingController.releaseLock`
- **Service:** `BookingService.releaseLock`
- **Reads:** No
- **Writes:** Yes (delete lock)
- **Tables:** `slot_locks`
- **Complexity:** Low
- **Description:** Deletes the caller's lock on the slot. Reports if 0, 1, or >1 locks were removed.

---

**GET /bookings**
- **Controller:** `BookingController.getBookings`
- **Service:** `BookingService.getBooking`
- **Reads:** Yes
- **Writes:** No
- **Tables:** `Booking`, `Room`, `RoomSlot`, `cancelled_bookings`
- **Complexity:** High
- **Description:** Two joined queries per call — active bookings (`Room ⋈ Booking ⋈ RoomSlot`) and cancelled bookings (`Room ⋈ cancelled_bookings ⋈ RoomSlot`) — then computes a per-row **status** (`Upcoming`/`Ongoing`/`Completed`) in JS against IST time. Per-user, moderately dynamic.

---

**DELETE /bookings/:id**
- **Controller:** `BookingController.deleteBooking`
- **Service:** `BookingService.deleteBooking`
- **Reads:** Yes (fetch booking)
- **Writes:** Yes (insert into cancelled, delete from booking)
- **Tables:** `Booking`, `cancelled_bookings`
- **Complexity:** High
- **Description:** Proper transaction using a single dedicated client (`getClient()`): fetch booking → ownership check (`ForbiddenException`) → copy row into `cancelled_bookings` → delete from `Booking` → `COMMIT`. Frees the slot for re-booking.

---

### Endpoint summary table

| Method | Route | Service method | R/W | Auth | Complexity |
|---|---|---|---|---|---|
| GET | `/` | `getHello` | — | public | Low |
| POST | `/signup` | `createUser` | R+W | public | Medium (bcrypt) |
| POST | `/login` | `checkLogin` | R | public | Medium (bcrypt) |
| GET | `/auth/me` | — | — | JWT | Low |
| GET | `/rooms` | `getRooms` | R | JWT | Low |
| GET | `/rooms/:id` | `getRoomById` | R | JWT | Medium (4 queries) |
| POST | `/rooms/slots` | `getSlotsBy_RoomId_And_Date` | R | JWT | Medium |
| POST | `/bookings` | `createBooking` | R+W | JWT | High |
| POST | `/bookings/slots/:slotId/lock` | `lockSlot` | R+W | JWT | High (txn/lock) |
| DELETE | `/bookings/slots/:slotId/lock` | `releaseLock` | W | JWT | Low |
| GET | `/bookings` | `getBooking` | R | JWT | High |
| DELETE | `/bookings/:id` | `deleteBooking` | R+W | JWT | High (txn) |

---

## 3. Database Overview

9 tables, defined in `migrations/1781073671140_initial-schema.js`. PostgreSQL, quoted PascalCase names for core entities.

### `User`
- **Purpose:** Accounts. `id, name, email (unique), password (bcrypt hash)`.
- **Frequently read?** Yes — every login and signup.
- **Frequently written?** No — only at signup.
- **Size:** Small→medium (one row per user).
- **Relationships:** Referenced by `Booking.userId`, `cancelled_bookings.user_id`, `slot_locks.user_id`.

### `Room`
- **Purpose:** Room catalog. `id, title, price, image_url, description, location`.
- **Frequently read?** **Very** — every list and detail view.
- **Frequently written?** No — admin/seed only (no write endpoint exists).
- **Size:** Small (bounded number of rooms).
- **Relationships:** Parent of `RoomSlot`, `roomimages`, `room_amenities`, `Booking`, `cancelled_bookings`.

### `Amenities`
- **Purpose:** Master list of amenities. `id (INTEGER PK), name (unique), Icon_Url`.
- **Frequently read?** Yes — on every room-detail view (joined).
- **Frequently written?** No — static reference data.
- **Size:** Very small.
- **Relationships:** Linked to `Room` via `room_amenities`.

### `RoomSlot`
- **Purpose:** Bookable time slots. `id, roomId → Room, startTime, endTime, slotDate`.
- **Frequently read?** **Very** — availability checks and booking joins.
- **Frequently written?** No via API (seeded/admin); read-dominant.
- **Size:** Medium→large (grows with rooms × dates × slots-per-day).
- **Relationships:** Child of `Room`; referenced by `Booking.slotId`, `cancelled_bookings.slot_id`, `slot_locks.slot_id`.

### `Booking`
- **Purpose:** Confirmed bookings. `id, userId → User, roomId → Room, slotId → RoomSlot (UNIQUE), booking_date, final_price`.
- **Frequently read?** Yes — "my bookings", availability subquery.
- **Frequently written?** Yes — created on confirm, deleted on cancel.
- **Size:** Large over time (grows unbounded with activity).
- **Relationships:** Joins `User`, `Room`, `RoomSlot`. **`UNIQUE(slotId)` is the core double-booking guard.**

### `cancelled_bookings`
- **Purpose:** Archive of cancelled bookings (same shape as `Booking`, keeps original id). `id (INTEGER PK), user_id, room_id, slot_id, booking_date, final_price`.
- **Frequently read?** Moderate — included in "my bookings".
- **Frequently written?** On each cancellation.
- **Size:** Grows over time.
- **Relationships:** References `User`, `Room`, `RoomSlot`.

### `room_amenities`
- **Purpose:** Many-to-many join between `Room` and `Amenities`. `id, room_id, amenity_id`.
- **Frequently read?** Yes — every room-detail view.
- **Frequently written?** No.
- **Size:** Small→medium.
- **Relationships:** Bridge table (`Room` ⋈ `Amenities`).

### `roomimages`
- **Purpose:** Multiple images per room. `id, room_id → Room, image_url`.
- **Frequently read?** Yes — every room-detail view.
- **Frequently written?** No.
- **Size:** Small→medium.
- **Relationships:** Child of `Room`.

### `slot_locks`
- **Purpose:** Temporary hold on a slot during checkout. `id, user_id, slot_id (UNIQUE), locked_until (TIMESTAMP), created_at`.
- **Frequently read?** Yes — checked on lock and on booking confirm.
- **Frequently written?** **Very** — insert on lock, delete on release/booking, delete-stale on each lock attempt.
- **Size:** Small (ephemeral — should stay near the count of in-flight checkouts).
- **Relationships:** References `User` and `RoomSlot`. **This table is effectively a TTL key-value store implemented in Postgres — the #1 thing to move to Redis.**

### Relationship map
```
User ──< Booking >── Room ──< RoomSlot
  │         │                    │
  │         └── slotId (UNIQUE) ─┘
  ├──< cancelled_bookings >── Room / RoomSlot
  ├──< slot_locks >── RoomSlot
Room ──< roomimages
Room ──< room_amenities >── Amenities
```

---

## 4. Data Flow (key features)

### A. Login
```
POST /login {email, password}
        ↓
LoginController.checkLogin
        ↓
LoginService.checkLogin
        ↓
DB: SELECT id,name,email,password FROM "User" WHERE email = $1
        ↓
bcrypt.compare(password, hash)   → CPU-bound
        ↓
jwtService.sign({id,email,naam})
        ↓
Response { success, token }
```

### B. Room list
```
GET /rooms   (JWT required)
        ↓
RoomController.getRooms
        ↓
RoomService.getRooms
        ↓
DB: SELECT * FROM "Room" ORDER BY price
        ↓
Response { success, data: Room[] }        ← identical for all users
```

### C. Room detail
```
GET /rooms/:id   (JWT required)
        ↓
RoomController.getRoomById
        ↓
RoomService.getRoomById
        ↓
DB #1: SELECT id FROM "Room" WHERE id=$1              (existence)
DB #2: SELECT image_url FROM roomimages WHERE room_id=$1
DB #3: SELECT title,price,description,location FROM "Room" WHERE id=$1
DB #4: SELECT a.name,a."Icon_Url" FROM "Amenities" a
       JOIN room_amenities ra ON a.id=ra.amenity_id WHERE ra.room_id=$1
        ↓
Assemble { image_url[], room_name, room_price, room_description, room_location, amenities[] }
        ↓
Response { success, data }                 ← changes rarely
```

### D. Availability (slots)
```
POST /rooms/slots {id, date}   (JWT required)
        ↓
RoomService.getSlotsBy_RoomId_And_Date
        ↓
DB: SELECT id,startTime,endTime FROM "RoomSlot"
    WHERE roomId=$1 AND slotDate=$2
    AND id NOT IN (SELECT slotId FROM "Booking" WHERE booking_date=$2)
        ↓
JS: drop past slots using IST (Asia/Kolkata) current time
        ↓
Response { success, data: Slot[] }         ← changes as bookings occur
```

### E. Lock → Confirm booking
```
POST /bookings/slots/:slotId/lock
        ↓
BookingService.lockSlot  (intended txn)
   BEGIN
   SELECT id FROM "Booking" WHERE slotId=$1         (already booked?)
   SELECT id FROM "RoomSlot" WHERE id=$1 FOR UPDATE (pessimistic lock)
   DELETE FROM slot_locks WHERE slot_id=$1 AND locked_until < NOW()   (stale)
   SELECT id FROM slot_locks WHERE slot_id=$1       (existing lock?)
   INSERT INTO slot_locks (...) VALUES (..., NOW()+60s)
   COMMIT
        ↓
POST /bookings {roomId, slotId, final_price}
        ↓
BookingService.createBooking
   SELECT ... FROM slot_locks WHERE user_id=$1 AND slot_id=$2   (owns lock?)
   SELECT slotDate,startTime,endTime, (ended?) FROM "RoomSlot" WHERE id=$1
   INSERT INTO "Booking" (...)   → UNIQUE(slotId) guards double-book
        ↓
Response { success, message }
```

### F. My bookings
```
GET /bookings   (JWT required)
        ↓
BookingService.getBooking
        ↓
DB #1: Room ⋈ Booking ⋈ RoomSlot WHERE userId=$1        (active)
DB #2: Room ⋈ cancelled_bookings ⋈ RoomSlot WHERE user_id=$1  (cancelled)
        ↓
JS: compute status per row (Upcoming/Ongoing/Completed) in IST
        ↓
Response { success, data, cancelled_booking }
```

### G. Cancel booking
```
DELETE /bookings/:id
        ↓
BookingService.deleteBooking  (real txn on one client)
   BEGIN
   SELECT ... FROM "Booking" WHERE id=$1
   (ownership check → ForbiddenException)
   INSERT INTO cancelled_bookings (...)
   DELETE FROM "Booking" WHERE id=$1
   COMMIT
        ↓
Response { success, message }
```

---

## 5. Expensive Operations

| Operation | Where | Why it's expensive |
|---|---|---|
| **bcrypt hash / compare** | `signup`, `login` | Deliberately slow CPU work (10 salt rounds). Dominates request time; blocks the event loop briefly per call. Not cacheable, but repeated logins repeat the cost. |
| **Room detail = 4 sequential queries** | `getRoomById` | Four DB round-trips per view (existence + images + fields + amenities join) instead of one. Latency = sum of all four; runs on every detail open. |
| **Amenities join** | `getRoomById` | `Amenities ⋈ room_amenities` per room per view. |
| **Availability `NOT IN` subquery** | `getSlotsBy_RoomId_And_Date` | Correlated `NOT IN (SELECT slotId FROM "Booking" ...)` over `RoomSlot`; scans bookings for the date. Grows with booking volume; runs on every date change in the UI. |
| **"My bookings" double 3-table join** | `getBooking` | Two `Room ⋈ (Booking|cancelled) ⋈ RoomSlot` joins per request, plus per-row status computation in JS. |
| **Lock transaction with `FOR UPDATE`** | `lockSlot` | Multi-statement transaction with a pessimistic row lock and 3–5 queries; serializes concurrent lock attempts on the same slot. High-contention path during popular-slot rushes. |
| **Booking confirm** | `createBooking` | Lock check + slot re-validation + insert; contends on `UNIQUE(slotId)`. |
| **Sorting** | `getRooms` (`ORDER BY price`), availability | Cheap now (small tables), but unindexed sorts/filters degrade as data grows. |
| **`SELECT *`** | `getRooms` | Pulls every column of every room including long text; wasteful over the wire. |
| **No external APIs / file uploads / search** | — | None present. Images are stored as URLs (`image_url` text), not uploaded through the backend. No full-text search or recommendation engine exists yet. |

---

## 6. Frequently Repeated Data

Endpoints most likely to receive the **same response repeatedly across many users** (best cache ROI at top):

1. **`GET /rooms`** — The catalog is identical for every user and reloaded on every visit to the listing page. Highest hit rate, lowest volatility.
2. **`GET /rooms/:id`** — Popular rooms are opened repeatedly by many users; the payload (fields + images + amenities) changes rarely. Costs 4 queries each time.
3. **`POST /rooms/slots`** — Many users check the **same room + same popular date** (e.g., today/this weekend). Response is shared across users but changes when a booking lands on that date → short TTL.
4. **`GET /auth/me`** — Repeated by the same user across page loads. Currently free (no DB), but repeated JWT verification adds up; could be short-cached per token if it ever hits the DB.
5. **Amenities / room images** — Reference-ish data joined on every detail view; effectively static.

Per-user data (`GET /bookings`) repeats for the *same* user but not *across* users — cache per-user with invalidation on their writes.

---

## 7. Data Freshness

| Endpoint | Classification | Why |
|---|---|---|
| `GET /rooms` | **Mostly Static** | No write path exists; only changes on admin/seed edits. Safe to cache for minutes–hours. |
| `GET /rooms/:id` | **Mostly Static** | Room fields, images, and amenities change rarely. |
| Amenities data (inside detail) | **Mostly Static** | Reference data. |
| `POST /rooms/slots` | **Moderately Dynamic** | Slot definitions are static, but availability drops the moment someone books that date. Short TTL (seconds). |
| `GET /bookings` | **Moderately Dynamic** | Changes only when *that* user books/cancels; status labels shift with wall-clock time (Ongoing→Completed). Cache per user, invalidate on their writes, keep TTL small so status stays fresh. |
| `GET /auth/me` | **Mostly Static** (per token) | Payload is fixed for a token's lifetime (24h). |
| `POST /bookings`, `lock`, `releaseLock`, `DELETE /bookings/:id` | **Very Dynamic** | Mutations — never cache the response; they are cache *invalidation triggers*. |
| `POST /login`, `POST /signup` | **Very Dynamic** | Auth mutations / credential checks — never cache. |

---

## 8. Candidate Redis Cache Locations

> Naming convention below uses `swiftstay:<domain>:<key>`. TTLs are starting suggestions, tune with real traffic.

### 8.1 Room catalog — `GET /rooms`
- **Cache:** Full room list JSON (`{success, data, message}`).
- **Key:** `swiftstay:rooms:all`
- **TTL:** 1–6 hours (data is near-static).
- **Invalidation:** Delete key whenever a room is created/updated/deleted (add on the future admin path). Manual bust acceptable until then.
- **Expected gain:** Eliminates a DB hit + sort on the hottest read path; sub-millisecond responses; big DB-load reduction at scale.

### 8.2 Room detail — `GET /rooms/:id`
- **Cache:** Assembled detail payload (fields + images[] + amenities[]).
- **Key:** `swiftstay:room:{id}`
- **TTL:** 1–6 hours.
- **Invalidation:** Delete `swiftstay:room:{id}` (and `swiftstay:rooms:all`) on any edit to that room, its images, or its amenity links.
- **Expected gain:** Collapses **4 sequential queries → 1 Redis GET**. Largest per-request latency win among reads.

### 8.3 Slot availability — `POST /rooms/slots`
- **Cache:** Filtered available-slots list for a room+date.
- **Key:** `swiftstay:slots:{roomId}:{date}`
- **TTL:** 10–30 seconds (short; availability is volatile).
- **Invalidation:** Delete `swiftstay:slots:{roomId}:{date}` on any successful **booking create**, **cancel**, or **lock/release** touching that room+date. (Note: the past-slot JS filter is time-dependent — short TTL keeps it honest.)
- **Expected gain:** Absorbs bursts of many users checking the same popular date; avoids the `NOT IN` subquery on every keystroke/date change.

### 8.4 Slot locks — replace `slot_locks` table (highest-value change)
- **Cache/store:** The lock itself, not a cache of a query.
- **Key:** `swiftstay:lock:slot:{slotId}` → value `userId`
- **TTL:** 60s via native `SET key value NX EX 60` (matches the current `locked_until`).
- **Invalidation:** Redis auto-expires the key (no more "delete stale locks" query); `releaseLock` does `DEL` (guarded by user match); booking confirm checks/consumes it.
- **Expected gain:** Removes a hot write table, the `FOR UPDATE` transaction, and stale-lock cleanup. `SET NX EX` is **atomic** and fixes the current cross-connection transaction hazard (see §11). Massive contention + write-load reduction.

### 8.5 My bookings — `GET /bookings`
- **Cache:** Per-user bookings response (active + cancelled + statuses).
- **Key:** `swiftstay:bookings:user:{userId}`
- **TTL:** 30–60 seconds (short — status labels are time-sensitive).
- **Invalidation:** Delete `swiftstay:bookings:user:{userId}` on that user's booking create / cancel.
- **Expected gain:** Removes two 3-table joins per dashboard refresh. Because status is computed from wall-clock time, keep TTL short or compute status at read time from cached raw rows.

### 8.6 User lookup for auth — `login`
- **Cache:** `User` row by email (id, name, email, hash) to skip the SELECT (bcrypt still runs).
- **Key:** `swiftstay:user:email:{email}`
- **TTL:** 5–15 minutes.
- **Invalidation:** Delete on password/profile change (future). Low priority — the DB read is cheap; bcrypt is the real cost and isn't cacheable.
- **Expected gain:** Minor; include only if login volume is high.

### 8.7 Reference data — amenities
- **Cache:** Amenities master list (if a standalone endpoint is added).
- **Key:** `swiftstay:amenities:all`
- **TTL:** 12–24 hours.
- **Invalidation:** On amenity edits (rare).
- **Expected gain:** Small but free — static reference data.

**Priority order:** 8.4 (locks) → 8.2 (room detail) → 8.1 (room list) → 8.3 (availability) → 8.5 (my bookings) → 8.6/8.7.

---

## 9. Authentication

### JWT flow
- **Login** (`LoginService.checkLogin`) verifies credentials and signs a JWT with payload `{ id, email, naam }`, secret `JWT_SECRET`, expiry `JWT_EXPIRES_IN` (default `24h`), configured in `AuthModule` via `JwtModule.registerAsync`.
- **Protected routes** use `@UseGuards(JwtAuthGuard)` → Passport `JwtStrategy` extracts the token from the `Authorization: Bearer` header, verifies the signature and expiry (`ignoreExpiration: false`), and returns the payload. `validate()` passes the payload straight through to `req.user` — **no DB lookup on protected requests**.
- `GET /auth/me` simply echoes `req.user`.

### Sessions
- **None.** Fully **stateless JWT**. No server-side session store, no cookies.

### Rate limiting
- **None.** No `@nestjs/throttler` or equivalent. `/login` and `/signup` are unthrottled → open to brute-force/credential-stuffing and bcrypt-driven CPU exhaustion.

### Refresh tokens
- **None.** Single 24h access token; no refresh/rotation/blacklist. Logout is client-side only (drop the token); a stolen token is valid until it expires.

### Login process (step by step)
1. `POST /login {email, password}` → validated by `CheckUserDto` (email format, password ≥ 8).
2. `SELECT ... FROM "User" WHERE email=$1`.
3. `bcrypt.compare(password, hash)`.
4. On success, `jwtService.sign(payload)` → `{ success:true, token }`. On failure, `{ success:false, message }`.

### Where Redis fits in auth
- **Rate limiting:** Redis-backed throttle (fixed/sliding window or token bucket) on `/login` and `/signup`, keyed by IP and/or email — e.g. `swiftstay:rl:login:{ip}`. **Highest-value auth addition.**
- **Token revocation / logout:** A Redis **denylist** of `jti`s or a per-user "tokens-valid-after" timestamp (checked in `JwtStrategy.validate`) enables real logout and "log out everywhere" without abandoning stateless JWTs.
- **Refresh tokens:** Store refresh-token → user mappings (with TTL and rotation) in Redis if refresh flow is added.
- **Login-attempt lockout:** Track consecutive failures per email in Redis with a TTL-based cooldown.
- **User cache:** §8.6.

---

## 10. Background Jobs

**Current state: there are none.**
- **Email sending:** None (no signup confirmation, no booking receipt, no cancellation email).
- **Notifications:** None (no push/SMS/in-app).
- **Scheduled tasks / cron:** None. Notably, **expired `slot_locks` are cleaned lazily** — only when the next `lockSlot` on that slot runs the `DELETE ... WHERE locked_until < NOW()`. Stale rows for other slots linger until someone touches them.
- **Queues:** None. All work is synchronous inside the request.

### Where Redis could help
- **Lock expiry → free:** Moving locks to Redis (§8.4) makes expiry automatic (native TTL), removing the entire "lazy cleanup" concern and the need for a cron sweeper on `slot_locks`.
- **Job/queue backbone:** Introduce **BullMQ (Redis-backed)** for async work as the app grows — booking-confirmation emails, cancellation notices, reminder-before-slot messages, and analytics events — so `POST /bookings` / `DELETE /bookings/:id` return without waiting on I/O.
- **Scheduled sweeps:** A repeatable BullMQ job could archive old `Booking` rows or purge expired data on a schedule.

---

## 11. Current Performance Bottlenecks

1. **`slot_locks` transaction runs across multiple pooled connections (correctness + perf risk).** `DbService.query()` calls `pool.connect()` and `release()` **per statement**. In `lockSlot`, the `BEGIN`, `SELECT ... FOR UPDATE`, `INSERT`, and `COMMIT`/`ROLLBACK` are issued through **separate `query()` calls**, so each may land on a *different* physical connection. The `BEGIN`/`FOR UPDATE`/`COMMIT` therefore don't reliably wrap the inserts, and a `ROLLBACK` in the catch may run on an unrelated connection. The real safety net today is the `UNIQUE(slot_id)` constraint on `slot_locks` and `UNIQUE(slotId)` on `Booking`, not the transaction. (`deleteBooking` does this correctly via a single `getClient()` client.) **Moving locks to Redis `SET NX EX` removes this hazard entirely.**
2. **Room detail issues 4 sequential queries** instead of one round-trip or a cache hit — 4× latency on a hot read path (§8.2).
3. **bcrypt on every login/signup** is CPU-bound and unthrottled — a burst of logins can saturate CPU and stall the event loop; no rate limit to contain it.
4. **Availability `NOT IN` subquery** re-scans `Booking` for the date on every check; unindexed as bookings grow.
5. **Likely missing indexes.** Only unique constraints create indexes (`User.email`, `Booking.slotId`, `slot_locks.slot_id`, `Amenities.name`). Frequent lookups are **not** indexed: `Booking.userId`, `Booking.booking_date`, `RoomSlot(roomId, slotDate)`, `roomimages.room_id`, `room_amenities.room_id`, `cancelled_bookings.user_id`. These become sequential scans at volume.
6. **`SELECT *` on `Room`** ships all columns (including long text) to every list consumer.
7. **Connection acquisition churn:** grabbing and releasing a pooled connection per statement adds overhead under load and multiplies during multi-statement operations.
8. **Per-row status computed in JS** for `/bookings` scales linearly with a user's history and re-runs on every request (no cache).

---

## 12. Future Scaling Challenges (at ~100,000 users)

What breaks first, roughly in order:

1. **Slot-lock contention on popular slots.** Flash demand for the same slot funnels many requests through the pessimistic `FOR UPDATE` path and a single `UNIQUE(slot_id)` row. Lock waits and rollbacks spike; the multi-connection transaction issue (§11.1) gets riskier under concurrency. → **Redis atomic locks** are close to mandatory here.
2. **DB read load from rooms/detail/availability.** These hot, highly-repeated reads (§6) hit Postgres directly with no cache. At 100k users the room list, detail, and availability queries dominate DB CPU. → **Redis caching (§8.1–8.3)** offloads the majority of reads.
3. **`Booking` table growth + missing indexes.** As `Booking` and `cancelled_bookings` grow into millions of rows, the unindexed `userId` / `booking_date` filters and the availability subquery degrade to seq-scans. `GET /bookings` and `POST /rooms/slots` slow down. → **Add indexes; cache per-user bookings.**
4. **Auth CPU + no rate limiting.** Concurrent logins multiply bcrypt cost; without throttling, a credential-stuffing wave (or organic login storm) can exhaust CPU. → **Redis rate limiting** + horizontal scaling.
5. **Connection pool saturation.** Per-statement connect/release plus multi-statement operations exhaust the pool under concurrency, queuing requests. → Right-size the pool, reduce round-trips (single-query detail, caching), consider a pooler like PgBouncer.
6. **Synchronous side-effects.** The moment emails/notifications/receipts are added inline, `POST /bookings` latency balloons and failures cascade. → **Move to a Redis-backed queue (BullMQ)** before adding such features.
7. **Stateless-JWT operational gaps.** No revocation, no refresh — at scale, compromised tokens and 24h validity become a real security/ops problem. → **Redis denylist / refresh-token store.**
8. **Single-instance assumptions.** Any move to multiple backend instances (needed at 100k users) breaks the DB-in-process assumptions least gracefully around locking and lazy cleanup. → Redis provides the shared, atomic coordination layer (locks, cache, rate limits, queues) that multi-instance scaling requires.

---

### TL;DR — Where Redis delivers the most, fastest
1. **Distributed slot locks** (`SET NX EX`) — replaces `slot_locks`, fixes a transaction hazard, kills contention.
2. **Cache room list + room detail** — biggest read-latency and DB-load win (4 queries → 1 GET).
3. **Short-TTL availability cache** — absorbs same-date bursts.
4. **Rate limiting on `/login` + `/signup`** — closes the biggest security/CPU gap.
5. **Per-user bookings cache + BullMQ queue** — as history and side-effects grow.
