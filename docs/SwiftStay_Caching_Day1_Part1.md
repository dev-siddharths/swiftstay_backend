# Backend Caching & Redis — Day 1 (Part 1)

> **Project-based notes using the SwiftStay booking platform.**
> Stack: **NestJS 11 + raw `pg` (node-postgres) + PostgreSQL + JWT**.
> Focus today: *the mental model of caching* — why it exists, where it lives, and the core vocabulary (Hit, Miss, Cache-Aside, Invalidation, Stampede).
> **No Redis code yet** — today is about understanding, not implementation.

---

## Table of Contents

1. [Why Caching Exists](#1-why-caching-exists)
2. [Backend Request Lifecycle](#2-backend-request-lifecycle)
3. [Where Caching Belongs](#3-where-caching-belongs)
4. [Cache Hit](#4-cache-hit)
5. [Cache Miss](#5-cache-miss)
6. [Cache-Aside Strategy (Concept Only)](#6-cache-aside-strategy-concept-only)
7. [Cache Invalidation (Introduction)](#7-cache-invalidation-introduction)
8. [Cache Stampede (Introduction)](#8-cache-stampede-introduction)
9. [Backend Engineering Principles Learned Today](#9-backend-engineering-principles-learned-today)
10. [Interview Notes (Consolidated)](#10-interview-notes-consolidated)
11. [Important Takeaways](#11-important-takeaways)
12. [Glossary](#12-glossary)

---

## 1. Why Caching Exists

### 1.1 The beginner picture

Imagine SwiftStay's home page shows a list of rooms. Every time *anyone* opens `/rooms`, the backend runs this query against PostgreSQL:

```
SELECT * FROM "Room" ORDER BY "price";
```

If 1 person visits, that's 1 query. Fine.

But SwiftStay is meant to grow. If **10,000 people** open the room list in a minute, that is **10,000 identical queries** asking the database the *exact same question* and getting the *exact same answer* — because the room catalog barely changes. The database does a full amount of real work 10,000 times to produce a result it already produced a millisecond ago.

That is wasteful. **Caching** is the idea of *remembering the answer* the first time, and handing out the remembered copy to everyone else — until the answer actually changes.

> **Plain definition:** A cache is a small, very fast store that keeps a *copy* of an answer close to where it's needed, so you don't have to redo the expensive work to get that answer again.

### 1.2 Why databases become bottlenecks

A database like PostgreSQL is not "slow" — it is *doing a lot* on every query. For a single `SELECT`, it may:

```
   Your query
       │
       ▼
 ┌─────────────────────────────────────────────────────┐
 │  1. Acquire a connection from the pool               │
 │  2. Parse the SQL text                               │
 │  3. Plan the query (which index? which scan?)        │
 │  4. Execute: read pages from disk / shared buffers   │
 │  5. Apply ORDER BY (sort rows)                        │
 │  6. Serialize rows into the wire protocol            │
 │  7. Send bytes back over the network                 │
 │  8. Release the connection                           │
 └─────────────────────────────────────────────────────┘
```

Every one of those steps costs **CPU, memory, disk I/O, and network**. None of it is free.

Now here is the crucial architectural fact: a backend can be scaled *horizontally* very easily. Need more capacity to handle HTTP requests? Start more NestJS instances behind a load balancer — they are **stateless**, so you can run 2, 10, or 100 copies.

The **database cannot be cloned that easily.** It holds the single source of truth. You usually have *one* primary PostgreSQL instance that must stay consistent. You can add read-replicas, but that adds complexity, replication lag, and cost. So:

```
  App servers:   [App] [App] [App] [App]  ← cheap to add more (stateless)
                    \     |     |     /
                     \    |     |    /
                      ▼   ▼     ▼   ▼
  Database:            [ PostgreSQL ]      ← ONE shared, precious resource
                       (hard to clone)
```

Because everything funnels into one shared database, **the database is the first thing to run out of capacity.** It becomes the *bottleneck* — the narrowest point in the pipe that limits the whole system's throughput.

### 1.3 Why repeated reads are wasteful

There are two kinds of database load:

| Type | Example in SwiftStay | Is the work justified? |
|---|---|---|
| **Necessary work** | Inserting a new booking, updating a price | Yes — the data actually changed |
| **Repeated reads** | 10,000 users loading the same room list | No — the answer is identical each time |

Repeated reads are wasteful because **the input didn't change, the output didn't change, but you paid the full cost anyway.** You bought the same answer 10,000 times.

Caching attacks exactly this category. It does *nothing* for writes (those must still hit the DB), but it can eliminate the overwhelming majority of *reads* — which, in a read-heavy app like SwiftStay, is most of the traffic.

### 1.4 Why the database is the most expensive resource

"Expensive" here means several things at once:

- **Hardest to scale** — you can't just spin up 50 primaries the way you spin up app servers. State makes cloning hard.
- **Shared by everyone** — every feature (rooms, bookings, availability, auth) competes for the *same* database connections and CPU. When the DB is busy serving pointless repeated reads, it has less capacity for the writes that *actually matter* (like confirming a booking).
- **Financially costly** — managed database instances with more CPU/RAM/IOPS cost significantly more than a small cache.
- **Failure blast radius** — if the app server dies, the load balancer routes around it. If the database falls over under load, **the entire product is down.**

So protecting the database isn't just a performance nicety — it's about **survival and cost** of the whole system.

### 1.5 One fast query vs. millions of unnecessary queries

This is the single most important mental shift of the day.

A beginner optimizes like this: *"My query takes 40ms. Let me add an index and make it 8ms."* That's real, but it's linear — you made **one** query five times faster.

A backend engineer thinks: *"This query runs 2,000,000 times a day and returns the same answer. What if it ran **20** times instead?"*

```
 Without cache:                          With cache:
 ┌──────────────────────────┐           ┌──────────────────────────┐
 │ 2,000,000 queries/day    │           │ ~20 queries/day (misses) │
 │ each 40ms                │    vs     │ + 1,999,980 cache hits   │
 │ = massive DB load        │           │ each ~0.5ms, DB untouched│
 └──────────────────────────┘           └──────────────────────────┘
       Optimizing the query              Eliminating the query
       = make ONE thing faster           = make the work DISAPPEAR
```

> **The core idea:** Caching is not primarily about making *one* query faster. It's about **preventing millions of unnecessary queries from ever reaching the database.** Removing work always beats speeding up work you shouldn't be doing.

### 🎯 Interview Notes — Why Caching

- **Q: Why do we cache instead of just optimizing the query?** Query optimization makes one execution faster (linear gain); caching removes the execution entirely for repeated identical reads (multiplicative gain) and, critically, *protects the database* — the least-scalable, most-shared resource.
- **Q: What makes the database the bottleneck?** It's stateful and hard to scale horizontally, it's shared by every feature, and it has the largest failure blast radius. App servers are stateless and cheap to add.
- **Q: What kind of load does caching reduce?** Read load for repeated, rarely-changing data. It does not help writes.
- **Be able to say:** "Cache reads, not writes. Cache data that is read often and changes rarely."

### ✅ Key Takeaways — Section 1

1. A cache stores a *copy* of an answer in fast memory so you don't redo expensive work.
2. Databases become bottlenecks because they're stateful, shared, and hard to clone.
3. Repeated reads pay full cost for an answer that never changed.
4. The database is the most expensive resource: hardest to scale, shared, costly, and its failure takes down everything.
5. Caching's real win is *eliminating* work, not speeding up individual work.

---

## 2. Backend Request Lifecycle

Before we can decide *where* a cache goes, we have to understand the road a request travels. Let's trace a real SwiftStay request end-to-end: **`GET /rooms`**.

### 2.1 The full journey

```
   ┌─────────┐     HTTP GET /rooms      ┌──────────────────┐
   │ Browser │ ───────────────────────▶ │  NestJS Router   │
   └─────────┘   Authorization: Bearer  └──────────────────┘
        ▲                                         │  matches route
        │                                         ▼
        │                                ┌──────────────────┐
        │                                │  RoomController  │
        │                                │   .getRooms()    │
        │                                └──────────────────┘
        │                                         │  delegates
        │                                         ▼
        │                                ┌──────────────────┐
        │                                │   RoomService    │
        │                                │   .getRooms()    │
        │                                └──────────────────┘
        │                                         │  db.query(...)
        │                                         ▼
        │                                ┌──────────────────┐
        │                                │   PostgreSQL     │
        │                                │  SELECT * FROM   │
        │                                │  "Room" ORDER..  │
        │                                └──────────────────┘
        │                                         │  rows
        │                                         ▼
        │                                ┌──────────────────┐
        │                                │   RoomService    │  shapes result:
        │                                │  {success, data} │  {success, data, message}
        │                                └──────────────────┘
        │                                         │
        │                                         ▼
        │                                ┌──────────────────┐
        │       JSON response            │  RoomController  │  returns to framework
        └──────────────────────────────  │   (serializes)   │
                                         └──────────────────┘
```

The request goes **down** the stack (Browser → DB) and the response comes **back up** (DB → Browser). This is the exact path in SwiftStay today: `RoomController.getRooms()` simply calls `this.roomService.getRooms()`, which runs `SELECT * FROM "Room" ORDER BY "price"` and returns `{ success, data, message }`.

### 2.2 Responsibility of each layer

Each layer has **one job**. Keeping these jobs separate is what makes the system understandable and changeable.

#### Browser (Client)
- **Job:** Ask a question over HTTP and render the answer.
- **Knows about:** The URL, the HTTP method, and the auth token. Nothing about tables, SQL, or caches.
- **In SwiftStay:** The Next.js `/rooms` page sends `GET /rooms` with the JWT in the `Authorization` header and paints the returned rooms.

#### NestJS Router
- **Job:** Traffic control. Match the incoming URL + method to the right controller method. Run route-level middleware/guards along the way.
- **In SwiftStay:** Sees `GET /rooms`, runs the `JwtAuthGuard` (rejects if the token is missing/invalid), then dispatches to `RoomController.getRooms()`. The router is *plumbing* — it never contains business logic.

#### Controller
- **Job:** The **HTTP boundary**. Translate between "the web" and "the application." Read params/body/query, hand off to a service, and return the service's result so the framework can serialize it to JSON. A controller should be *thin*.
- **Knows about:** HTTP shapes — status codes, request/response, headers.
- **Does NOT know:** *How* or *where* the data is fetched. It doesn't know if the data came from PostgreSQL, a cache, a file, or a third-party API.
- **In SwiftStay:** `getRooms()` is literally one line — `return this.roomService.getRooms();`. That thinness is a feature, not laziness.

#### Service
- **Job:** The **brain** — business logic and *data-access decisions*. It decides what data is needed, where to get it, how to combine it, and what shape to return.
- **Knows about:** The domain (rooms, prices), and the data sources (the DB today; the cache tomorrow).
- **In SwiftStay:** `RoomService.getRooms()` runs the SQL, checks whether rows came back, and returns a consistent `{ success, data, message }` envelope. **This is the layer that will one day ask the cache first.**

#### PostgreSQL (Database)
- **Job:** The **source of truth**. Store data durably and answer queries correctly. It does not care who's asking or why.
- **In SwiftStay:** Executes `SELECT * FROM "Room" ORDER BY "price"` and returns rows through the `pg` pool (`DbService.query()`).

### 2.3 Why the "down then back up" shape matters

Notice the response *re-enters* the Service and Controller on the way out. That return path is important for caching: the moment data comes back from the DB **inside the Service**, that's the natural place to *also stash a copy in the cache* before returning it. The Controller never has to be involved. Hold that thought — it's the whole point of Section 3.

### 🎯 Interview Notes — Request Lifecycle

- **Q: Walk me through a request in a NestJS app.** Client → Router (route match + guards) → Controller (HTTP boundary, thin) → Service (business logic + data access) → DB (source of truth) → back up through Service (shape result) → Controller (serialize) → Client.
- **Q: What is a controller's responsibility?** Handle the HTTP concern only — parse the request, delegate, return a result. It should be thin and must not contain data-access logic.
- **Q: What belongs in a service?** Business rules and the decision of *where* data comes from.
- **Common trap:** Putting SQL or `fetch` calls directly in a controller. That mixes HTTP with data access and makes the code hard to test and cache.

### ✅ Key Takeaways — Section 2

1. A request flows **down** (Browser→DB) and the response flows **back up** (DB→Browser).
2. Router = traffic control; Controller = HTTP boundary (thin); Service = brain + data access; DB = source of truth.
3. Each layer has exactly one responsibility and hides its internals from the others.
4. The return path *through the Service* is where a cache write naturally fits.

---

## 3. Where Caching Belongs

### 3.1 The question

We can technically add caching in the Controller *or* the Service. Which is correct? **The Service.** Always the Service. Here's the deep reasoning.

### 3.2 The Controller must stay ignorant of data sources

A controller's contract is: *"Given an HTTP request, produce an HTTP response."* It should not know **where** data lives. If we put cache logic in the controller, it would look conceptually like:

```
Controller (WRONG place for this):
   if (cache has rooms) return cached
   else { rooms = service.getRooms(); cache.set(rooms); return rooms }
```

Now the controller suddenly knows there's a cache, knows the cache key, knows the TTL, and knows the fetch-from-DB fallback. It has been handed *data-access responsibility* that was never supposed to be its job. Two problems immediately follow:

1. **Duplication & drift.** If another controller (or a background job, or a different endpoint) also needs the room list, it must re-implement the same cache dance. Every copy can drift out of sync — different keys, different TTLs, someone forgets to invalidate.
2. **The abstraction leaks.** The whole benefit of the layered design was that the controller *doesn't care* where data comes from. Cache-in-controller destroys that. You can no longer swap the data source without touching HTTP code.

### 3.3 The Service owns data-access decisions

The Service already answers the question *"where does this data come from?"* Today the answer is "PostgreSQL." Caching simply makes the answer richer: *"first the cache, and only PostgreSQL on a miss."*

```
   Controller (thin, unchanged):
        return roomService.getRooms();

   Service (owns the decision):
        getRooms():
            1. look in cache
            2. if found → return it            (Cache Hit)
            3. if not → query PostgreSQL       (Cache Miss)
            4. store the answer in cache
            5. return it
```

The beautiful result: **the Controller never changes.** It called `roomService.getRooms()` before caching, and it calls `roomService.getRooms()` after caching. From the controller's point of view, *nothing happened* — the data just got faster. That is the sign of a correct abstraction boundary.

```
                 ┌───────────────────────────────────────────┐
                 │             CONTROLLER (HTTP)              │
                 │   "I don't care where data comes from."    │
                 │        return service.getRooms();          │
                 └───────────────────────────────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────────┐
                 │              SERVICE (brain)               │
                 │   "I decide: cache first, DB on a miss."   │
                 │                                             │
                 │     ┌─────────┐  miss   ┌──────────────┐   │
                 │     │  Cache  │────────▶ │  PostgreSQL  │   │
                 │     └─────────┘          └──────────────┘   │
                 │          ▲   hit               │            │
                 │          └───────── store ─────┘            │
                 └───────────────────────────────────────────┘
```

### 3.4 Separation of Concerns (SoC) — the principle underneath

**Separation of Concerns** is the design principle that *each part of a system should be responsible for one distinct concern, and should not be entangled with others.* A "concern" is just a category of responsibility:

| Concern | Owner in SwiftStay |
|---|---|
| HTTP handling (routing, status, serialization) | Controller |
| Business logic + data access (incl. caching) | Service |
| Durable storage & correctness | PostgreSQL |
| Auth / token verification | Guard / Strategy |

Why it matters, concretely:

- **Changeability:** You can introduce Redis to `RoomService` without editing a single controller, route, or the frontend. The change is *contained* to the concern that owns it.
- **Testability:** You can unit-test the caching logic by testing the Service in isolation — no HTTP server needed.
- **Reasoning:** When something breaks, you know *where* to look. A caching bug is in the Service, not scattered across controllers.
- **Reuse:** Any caller of `getRooms()` automatically benefits from the cache, because the caching lives *behind* the service method, not in one HTTP handler.

> **Rule of thumb:** *"Controllers speak HTTP. Services speak data."* Caching is a data concern, therefore it belongs to the Service.

### 3.5 A note on "other" cache layers (context, not today's topic)

You may later hear about caching at *other* layers — HTTP caches (CDN, browser `Cache-Control`), or a reverse-proxy cache. Those are real and useful, but they cache *whole HTTP responses* at the edge and are a different concern. What we're learning — **application-level caching with Redis** — lives inside the app, in the **Service layer**, where we have fine-grained control over exactly what to cache and when to invalidate it. Keep them separate in your mind.

### 🎯 Interview Notes — Where Caching Belongs

- **Q: Where should cache logic live in a layered backend?** In the service/data-access layer, not the controller — because the service owns the decision of *where* data comes from.
- **Q: Why not cache in the controller?** It leaks the data-source abstraction into the HTTP layer, causes duplication across handlers, and couples HTTP code to cache keys/TTLs.
- **Q: What principle is this?** Separation of Concerns — each layer owns one responsibility; the controller handles HTTP, the service handles data.
- **Strong signal answer:** "If I add a cache correctly, the controller doesn't change at all."

### ✅ Key Takeaways — Section 3

1. Caching belongs in the **Service** layer.
2. The Controller must stay ignorant of *where* data comes from.
3. Correct caching means the Controller code is **unchanged** after you add the cache.
4. This is **Separation of Concerns**: controllers speak HTTP, services speak data.

---

## 4. Cache Hit

### 4.1 Definition

A **Cache Hit** happens when the data you asked for is **already present in the cache**, so you return the cached copy and **never touch the database.**

> A hit means: "I remembered this answer — here it is instantly."

### 4.2 Flow

```
   Request for data
        │
        ▼
   ┌──────────────┐
   │  Is it in    │
   │  the cache?  │
   └──────────────┘
        │ YES  ✅  CACHE HIT
        ▼
   Return cached copy
        │
        ▼
   Response  (PostgreSQL was NEVER queried)
```

Notice what's **missing** from that diagram: PostgreSQL. On a hit, the database does *zero* work. That's the entire point.

### 4.3 SwiftStay example — `GET /rooms` on a hit

Assume we've already cached the room list under a key like `swiftstay:rooms:all`.

```
User B opens /rooms  (User A already loaded it a moment ago)
        │
        ▼
RoomController.getRooms()      ← thin, unchanged
        │
        ▼
RoomService.getRooms()
        │
        ├─ look up "swiftstay:rooms:all" in cache
        │        │
        │        ▼
        │   FOUND ✅  (User A's request populated it)
        │
        ▼
Return the cached room list         ← ~0.5 ms, in-memory
        │
        ▼
Response { success, data: [...rooms], message }

   PostgreSQL: idle.  No SELECT ran.  No sort ran.  No connection used.
```

If 9,999 more users open `/rooms` in the next few minutes, **all 9,999 are hits.** The database served the list *once* (for User A) and then rested. That's the multiplicative win from Section 1 made concrete.

### 🎯 Interview Notes — Cache Hit

- **One-liner:** A hit is when requested data is found in the cache and returned without querying the database.
- **Q: What's the performance profile of a hit?** Sub-millisecond, in-memory, zero DB load. It's the "happy path" we design for.
- **Q: What metric tracks this?** The **cache hit ratio** = hits / (hits + misses). Higher is better; a good read cache aims for a high hit ratio (often 90%+ for hot, stable data).

### ✅ Key Takeaways — Section 4

1. Cache Hit = data found in cache → return it → **PostgreSQL is never touched.**
2. Hits are fast (in-memory) and cost the database nothing.
3. In SwiftStay, once one user warms `swiftstay:rooms:all`, every subsequent visitor is a hit until it expires or is invalidated.

---

## 5. Cache Miss

### 5.1 Definition

A **Cache Miss** happens when the data you asked for is **not in the cache**. You must then fall back to the **database**, get the answer, and **store a copy in the cache** so the *next* request becomes a hit.

> A miss means: "I don't remember this yet — let me fetch it, answer you, and remember it for next time."

### 5.2 Flow

```
   Request for data
        │
        ▼
   ┌──────────────┐
   │  Is it in    │
   │  the cache?  │
   └──────────────┘
        │ NO  ❌  CACHE MISS
        ▼
   Query PostgreSQL  (do the real work)
        │
        ▼
   Store the answer in the cache   ← so the next request is a HIT
        │
        ▼
   Return the answer
        │
        ▼
   Response
```

A miss is *more* expensive than having no cache at all for that one request (you check the cache, miss, then hit the DB, then write the cache — a little extra work). But it's a one-time cost that "pays it forward": it turns the *next* N requests into cheap hits.

### 5.3 When do misses happen?

- **Cold start / first request** — nothing is cached yet (the very first `/rooms` load after deploy).
- **After expiry (TTL)** — the cached copy timed out and was removed.
- **After invalidation** — we deliberately deleted the cached copy because the underlying data changed (see Section 7).
- **Eviction** — the cache ran low on memory and dropped this key to make room.

### 5.4 SwiftStay example — `GET /rooms` on a miss

This is the **first** visitor after the cache is empty (fresh deploy, or the key just expired).

```
User A opens /rooms   (cache is empty for this key)
        │
        ▼
RoomController.getRooms()       ← thin, unchanged
        │
        ▼
RoomService.getRooms()
        │
        ├─ look up "swiftstay:rooms:all" in cache
        │        │
        │        ▼
        │   NOT FOUND ❌  CACHE MISS
        │
        ├─ query PostgreSQL:
        │     SELECT * FROM "Room" ORDER BY "price"
        │        │
        │        ▼
        │   rows returned
        │
        ├─ store rows in cache under "swiftstay:rooms:all"
        │
        ▼
Return { success, data: [...rooms], message }
        │
        ▼
Response

   PostgreSQL: queried ONCE.  Cache: now warm for everyone after User A.
```

User A "paid" for the miss (a real DB query). Every user after them (until expiry/invalidation) rides for free on hits. This is the natural, self-healing rhythm of a read cache: **one miss, then many hits.**

### 5.5 Hit vs. Miss side by side

```
        CACHE HIT ✅                        CACHE MISS ❌
   ┌────────────────────┐            ┌────────────────────────┐
   │ 1. check cache     │            │ 1. check cache         │
   │ 2. found → return  │            │ 2. not found           │
   │                    │            │ 3. query PostgreSQL    │
   │  DB untouched      │            │ 4. store in cache      │
   │  ~0.5 ms           │            │ 5. return              │
   │                    │            │  DB queried once       │
   └────────────────────┘            └────────────────────────┘
        the goal                       the (necessary) cost
                                       that creates future hits
```

### 🎯 Interview Notes — Cache Miss

- **One-liner:** A miss is when data isn't in the cache, so you query the DB, populate the cache, and return the result.
- **Q: Is a miss bad?** A single miss is unavoidable and healthy — it's how the cache gets warm. A *high miss ratio* is bad (means the cache isn't helping).
- **Q: What causes misses?** Cold start, TTL expiry, invalidation, or eviction.
- **Q: What's the sequence on a miss?** check → miss → DB → **write cache** → return. Forgetting step 4 (write cache) means you never get hits.

### ✅ Key Takeaways — Section 5

1. Cache Miss = not in cache → **query PostgreSQL** → **store in cache** → return.
2. A miss costs slightly more for *that* request but creates cheap hits for all the following ones.
3. Misses come from cold start, expiry, invalidation, or eviction.
4. **Always repopulate on a miss** — that's what makes the next request a hit.

---

## 6. Cache-Aside Strategy (Concept Only)

### 6.1 What "Cache-Aside" means

**Cache-Aside** (also called **Lazy Loading**) is a caching *strategy* — a rule for who talks to the cache and when. In Cache-Aside, the **application code** (our Service) sits "beside" both the cache and the database and orchestrates them:

- The cache is treated as a *side store*, not the main path.
- The application checks the cache first, and only goes to the database on a miss.
- The application is responsible for putting data *into* the cache after a miss.

The name says it: the cache is *aside* — off to the side — and the app decides when to consult it. The cache does **not** automatically pull from the database on its own.

### 6.2 The flow (this is just Hit + Miss combined)

```
              ┌─────────────────────────────┐
              │   Service needs the data    │
              └─────────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
              1.   │  Check cache    │
                   └─────────────────┘
                     │             │
            HIT ✅   │             │  MISS ❌
                     ▼             ▼
         2. Return cached    3. Query PostgreSQL
            data                    │
            (DB untouched)          ▼
                            4. Store result in cache
                                    │
                                    ▼
                            5. Return response
```

Step by step, exactly as the topic lists it:

1. **Check the cache** for the key.
2. **Cache Hit → return** the cached value (done; DB never touched).
3. **Cache Miss → query the database** for the real answer.
4. **Store** that answer in the cache (so the next read is a hit).
5. **Return** the response to the caller.

That's the whole strategy. You've already learned it — Cache-Aside is simply *"Cache Hit and Cache Miss, formalized into a repeatable procedure that the Service follows every time."*

### 6.3 SwiftStay mental model

For `GET /rooms`, `RoomService.getRooms()` would follow Cache-Aside:

```
getRooms():
   check cache "swiftstay:rooms:all"
        HIT  → return it                      (Section 4)
        MISS → SELECT * FROM "Room" ORDER BY price
               store rows in "swiftstay:rooms:all"
               return rows                    (Section 5)
```

The same pattern applies to `GET /rooms/:id` (key `swiftstay:room:{id}`), where a miss triggers the **4 sequential queries** that assemble the detail payload, and a hit collapses all four into a single fast cache read.

### 6.4 Why Cache-Aside is the most common strategy

Cache-Aside dominates real-world backends for several compounding reasons:

- **Simple and explicit.** The logic lives in plain application code you can read top-to-bottom. No magic, no framework doing hidden writes. Easy to reason about and debug.
- **The cache only ever holds data that was actually requested.** You never pre-load rooms nobody looks at. Memory is spent only on *hot* data — the data users actually ask for. This is why it's also called *lazy* loading.
- **Resilient to cache failure.** If the cache (Redis) is down, every request is just a "miss" that falls through to the database. The app *degrades* to its current no-cache behavior instead of breaking. The database absorbs the load, but the product still works.
- **Works with any data source.** The Service can cache-aside over PostgreSQL, a third-party API, a computed result — anything. The strategy doesn't care what's behind the miss.
- **Decoupled from writes.** The read path (cache-aside) and the write path (which invalidates the cache) are separate and simple. Compare with strategies like *write-through* or *read-through*, where the cache itself sits inline with every read/write — more moving parts, tighter coupling, and the cache becomes a hard dependency you can't lose.

> **In one sentence:** Cache-Aside wins because it's simple, lazy (caches only what's used), and *fails safe* (a dead cache just means more DB reads, not an outage).

### 6.5 The trade-off to be aware of (for later)

Cache-Aside's main challenge is **staleness**: because the app writes to the DB and the cache separately, the cache can hold an *old* copy after the DB changes — until we invalidate it or it expires. That's precisely why the next section (Invalidation) exists. Cache-Aside and Invalidation are two halves of the same coin.

### 🎯 Interview Notes — Cache-Aside

- **Define it:** The application checks the cache first; on a miss it loads from the DB and populates the cache. The cache sits "aside" and the app orchestrates it (a.k.a. lazy loading).
- **Q: Why is it the most popular strategy?** Simplicity, laziness (only hot data cached), and fail-safe behavior (cache down ⇒ falls back to DB).
- **Q: What's its weakness?** Potential staleness between DB and cache → must be paired with an invalidation/TTL strategy.
- **Q: Cache-Aside vs. Read-Through?** In read-through, the cache layer itself fetches from the DB on a miss (inline); in cache-aside, the *application* does. Cache-aside keeps the cache optional and the logic explicit.
- **Q: Where does the write to the cache happen?** After a miss, in the application, *before* returning the response.

### ✅ Key Takeaways — Section 6

1. Cache-Aside = **check cache → hit returns / miss loads DB then stores → return.**
2. It's just Hit + Miss combined into a repeatable procedure the Service follows.
3. It's the most common strategy because it's **simple, lazy, and fail-safe.**
4. Its weakness is staleness → it must be paired with invalidation (Section 7).

---

## 7. Cache Invalidation (Introduction)

> *"There are only two hard things in Computer Science: cache invalidation and naming things."* — Phil Karlton
> We're now touching the first one.

### 7.1 The problem: the cache can go stale

Once we store a copy of data in the cache, the cache and the database can **disagree**. The database is the source of truth; the cache is a *copy* frozen at the moment we stored it. If the truth changes but the copy doesn't, the cache is **stale** — it's serving an answer that is now *wrong*.

**Invalidation** is the act of *removing (or refreshing) a cached copy so it stops serving stale data.* The most common form is simply: **delete the key.** The next read misses, reloads fresh data from the DB, and re-caches the correct value.

### 7.2 Two ways a cached copy stops being served

There are two fundamentally different triggers:

1. **TTL (Time To Live) — time-based, passive.** When we store a value, we attach an expiry (e.g., "live for 1 hour"). After that time, the cache drops it automatically. We don't have to *do* anything — we just *wait*.
2. **Explicit invalidation — event-based, active.** The moment the underlying data *changes*, our code proactively deletes the affected cache key. We don't wait — we react to the change.

### 7.3 Why relying only on long TTLs is a bad idea — the room price example

Suppose we cache the SwiftStay room list with a **long TTL of 1 hour** and *no* explicit invalidation. Now an admin updates a room's price:

```
   t = 0:00   Cache stores rooms.  "Deluxe Suite" price = ₹2000.  TTL = 1 hour.
   t = 0:10   Admin updates DB:     "Deluxe Suite" price = ₹2500.
              (Cache is NOT told. It still holds ₹2000.)
   t = 0:10 ─ 1:00   Every user sees the STALE price ₹2000  ❌
                     for up to 50 more minutes.
   t = 1:00   TTL finally expires. Next read misses → reloads ₹2500  ✅
```

For **50 minutes**, the app confidently shows the *wrong* price to every visitor. In a booking product this is serious: a user could try to book at a price the business no longer offers. The longer the TTL, the longer the window of wrongness.

So there's a painful tension if TTL is your *only* tool:

- **Short TTL** → data stays fresh, but you get lots of misses → more DB load → you lose much of the caching benefit.
- **Long TTL** → great hit ratio and low DB load, but data can be stale for a long time → correctness problems.

You can't win this trade-off with TTL alone. That's the whole point.

### 7.4 Why explicit invalidation is usually better

Explicit (event-driven) invalidation breaks the trade-off. Instead of *guessing* how long the data will stay valid, we **react to the actual change**:

```
   Admin updates "Deluxe Suite" price in PostgreSQL
        │
        ▼
   Same code path deletes the stale cache key(s):
        DELETE "swiftstay:rooms:all"
        DELETE "swiftstay:room:{id}"
        │
        ▼
   Next read → MISS → reloads fresh ₹2500 from DB → re-caches
```

The stale window shrinks from *"up to the whole TTL"* to *"essentially instant."* And crucially, we get this freshness **without** shortening the TTL — so between changes, we still enjoy long-lived, high-hit-ratio caching. Best of both worlds:

```
   TTL only:              freshness ✗   hit-ratio ✓   (stale for up to TTL)
   Short TTL only:        freshness ~   hit-ratio ✗   (too many misses)
   Invalidate on change:  freshness ✓   hit-ratio ✓   (fresh + long TTL)
```

Because data changes are usually **rare** compared to reads (SwiftStay's rooms are read constantly but edited seldom), invalidation is cheap: you pay a tiny cost (delete a key) only on the infrequent write, and enjoy long caching the rest of the time.

### 7.5 TTL as a safety net (not the primary mechanism)

If invalidation is better, why keep a TTL at all? Because **invalidation can fail or be forgotten:**

- A new write path (say, a future "edit room" endpoint) might forget to delete the key.
- A bug, a crash between the DB write and the cache delete, or a missed edge case can leave a stale entry orphaned in the cache *forever*.

A TTL is the **backstop**: even if every explicit invalidation fails, the entry can only be stale for *at most* the TTL, then it self-heals. So the mature pattern is:

> **Invalidate on change (primary) + a reasonable TTL (safety net).**
> Event-driven for correctness; time-based so nothing can be stale forever.

```
   ┌──────────────────────────────────────────────────────────┐
   │  PRIMARY:  delete cache key when the data changes         │  ← keeps it correct
   │  BACKSTOP: TTL expiry auto-drops the key eventually       │  ← bounds the damage
   └──────────────────────────────────────────────────────────┘
```

### 7.6 SwiftStay invalidation map (conceptual)

Which writes should bust which keys:

| When this happens | Invalidate these keys |
|---|---|
| A room's price/details/images/amenities change | `swiftstay:rooms:all`, `swiftstay:room:{id}` |
| A booking is created/cancelled on a date | `swiftstay:slots:{roomId}:{date}` (availability) |
| A user books or cancels | `swiftstay:bookings:user:{userId}` |

(We're only mapping the concept today — no Redis code yet.)

### 🎯 Interview Notes — Cache Invalidation

- **Define it:** Removing/refreshing a cached copy so it stops serving stale data — most commonly by deleting the key so the next read reloads fresh.
- **Q: Why not just use a long TTL?** It leaves data stale for up to the entire TTL after a change (the price example). Short TTLs fix freshness but kill the hit ratio. Neither is good alone.
- **Q: Why is invalidation better?** It reacts to the actual change, so data is fresh almost immediately *while still* allowing a long TTL and high hit ratio between changes.
- **Q: Then why keep a TTL?** As a safety net — if an invalidation is missed or fails, the TTL bounds how long staleness can last, so nothing is stale forever.
- **Best answer:** "Event-driven invalidation for correctness, TTL as a backstop. Writes are rare, reads are frequent, so busting on write is cheap."

### ✅ Key Takeaways — Section 7

1. A cache is a copy; when the DB changes, the copy can go **stale**.
2. **TTL alone is a bad primary mechanism**: long = long staleness, short = poor hit ratio.
3. **Explicit, event-driven invalidation** (delete the key on change) keeps data fresh *and* keeps a long TTL.
4. **TTL is the safety net** for missed/failed invalidations — so nothing is stale forever.
5. Pattern: **invalidate on write + reasonable TTL backstop.**

---

## 8. Cache Stampede (Introduction)

> *Introduction only — we describe the problem today. The solution is a later topic and is intentionally not covered here.*

### 8.1 The scenario

Picture the SwiftStay room list cached under `swiftstay:rooms:all` with a TTL. It's a hot key — **1,000 users per second** are reading it, all happily getting **cache hits**. The database is resting. Then the TTL expires.

```
   t < T:  key present → 1000 req/s all HIT ✅ → DB idle
   t = T:  key EXPIRES (TTL runs out) → key is gone
   t = T:  the next instant, 1000 concurrent requests arrive...
           every one checks the cache → NOT FOUND → MISS ❌
           every one independently decides to query PostgreSQL
```

Result:

```
   Cache: (empty for this key)
             ▲   ▲   ▲   ▲   ▲          all 1000 miss at once
             │   │   │   │   │
        ┌────┴─┬─┴─┬─┴─┬─┴─┬─┴────┐
        │ req1 │r2 │r3 │...│r1000 │     1000 simultaneous misses
        └───┬──┴─┬─┴─┬─┴─┬─┴──┬───┘
            ▼    ▼   ▼   ▼    ▼
        ┌───────────────────────────┐
        │        PostgreSQL          │  ← hit by 1000 identical
        │  SELECT * FROM "Room" ...  │     queries in the same instant
        └───────────────────────────┘
                  💥 overload
```

This is a **Cache Stampede** (also called a **thundering herd** or **dog-piling**): the sudden expiry of one hot key causes a *herd* of simultaneous requests to all miss and *stampede* the database at the same moment.

### 8.2 Why this happens

Trace the cause carefully:

1. **A single shared key** serves enormous traffic. Its value is identical for everyone, so everyone depends on that *one* cache entry.
2. **Expiry is a single instant.** TTL removes the key at one precise moment — not gradually. Before that instant: 100% hits. After it: 100% misses.
3. **Requests are concurrent and independent.** In that instant, hundreds or thousands of in-flight requests each run the Cache-Aside logic *at the same time*. None of them sees the others.
4. **Each miss independently triggers a DB query.** Cache-Aside says "on a miss, query the DB." With no coordination, *every* request obeys that rule simultaneously — so instead of **one** request refilling the cache while others wait, you get **1,000** requests all querying the DB for the same answer.
5. **The cache is momentarily empty**, so it can't absorb any of them until the *first* query returns and repopulates the key — but by then, hundreds have already fired.

In short: the very design that protected the DB (one hot cached key) becomes a liability at the exact moment that key vanishes. The higher the traffic on a key, the *worse* its stampede when it expires — popularity amplifies the spike. This can cause a latency spike, connection-pool exhaustion, or in the worst case a cascading failure where the DB slows down, requests pile up, and the whole system buckles.

### 8.3 SwiftStay framing

The most stampede-prone keys in SwiftStay are exactly the *hottest, most shared* ones:

- `swiftstay:rooms:all` — every visitor reads it; one key for the whole catalog.
- `swiftstay:slots:{roomId}:{date}` for a popular room on a popular date (e.g., this weekend) — many users checking the same date at once, and it uses a **short** TTL (so it expires often), making a stampede more likely.

### 8.4 Why we stop here (deliberately)

The important learning outcome today is to **recognize the failure mode**: understand *how* a stampede forms and *why* high-traffic single-key expiry is dangerous. There are well-known techniques to prevent it — but they belong to a later lesson. **We are not covering the solution yet**, because it hasn't been taught. For now, just be able to *see the stampede coming*.

### 🎯 Interview Notes — Cache Stampede

- **Define it:** When a hot cache key expires, many concurrent requests all miss simultaneously and hit the database at once (a.k.a. thundering herd / dog-piling).
- **Q: Why does it happen?** One heavily-shared key + instantaneous TTL expiry + independent concurrent requests each running "miss ⇒ query DB" with no coordination.
- **Q: Which keys are most at risk?** The hottest, most-shared keys, especially those with short TTLs.
- **Q: What's the danger?** A sudden spike of identical DB queries → latency spike, pool exhaustion, possible cascading failure.
- *(Solutions like locking/single-flight, staggered expiry/jitter, or refresh-ahead are a later topic — know the problem cold first.)*

### ✅ Key Takeaways — Section 8

1. A **Cache Stampede** = a hot key expires and a herd of concurrent requests all miss and hit the DB at once.
2. Cause: one shared key + single-instant TTL expiry + independent concurrent misses each querying the DB.
3. The more popular the key, the bigger the stampede when it expires.
4. Most at-risk SwiftStay keys: `swiftstay:rooms:all` and hot short-TTL availability keys.
5. **Solution deferred** — today's goal is only to recognize the failure mode.

---

## 9. Backend Engineering Principles Learned Today

These are the durable lessons — the ideas worth carrying into every backend you build, not just SwiftStay.

### Principle 1 — Caching is about *preventing* work, not *speeding up* work
> *"Caching is not about making one query faster. It is about preventing millions of unnecessary queries."*

The junior instinct is to speed up a slow query. The senior instinct is to ask *"why is this query running a million times to return the same answer?"* and make it run *once*. Eliminating repeated work scales multiplicatively; optimizing a single execution scales linearly. Protecting the database from pointless reads is the real prize.

### Principle 2 — Controllers shouldn't know where data comes from
> *"Services own data-access decisions."*

The controller's only concern is HTTP. *Where* the data lives — DB, cache, external API — is a data concern owned by the Service. Get this right and you can add Redis to `RoomService` without touching a single controller, route, or line of frontend code. If adding a cache forces you to edit controllers, your boundaries are wrong.

### Principle 3 — Invalidation is event-driven; TTL is a safety net
> *"Cache invalidation is usually event-driven, while TTL acts as a safety net."*

Don't rely on time to make data correct — react to *change*. Delete the affected key the moment the underlying data is written (event-driven), which keeps data fresh *and* lets you keep a long TTL for a high hit ratio. Keep a TTL anyway, as a backstop, so a missed or failed invalidation can never leave data stale forever.

### Principle 4 — A Cache Hit means PostgreSQL is never touched
> *"Cache Hit ⇒ the database does zero work."*

This is the outcome you're engineering toward. Every hit is a query that *didn't* run, a connection that *wasn't* used, a sort that *didn't* happen. Your design goal is a **high hit ratio** — make the overwhelming majority of reads never reach the database at all.

### Principle 5 — A Cache Miss means query PostgreSQL and repopulate the cache
> *"Cache Miss ⇒ query the DB, then store the result so the next read is a hit."*

A miss is not a failure — it's how the cache warms up and heals itself. The non-negotiable step is **repopulating** on the way out: check → miss → DB → **write cache** → return. Skip the write and you'll miss forever, gaining nothing. One miss should buy you many hits.

### The five principles as one flow

```
   ┌────────────────────────────────────────────────────────────┐
   │  Controller (HTTP only) ── delegates ──▶ Service (decides)  │  P2
   │                                              │              │
   │                                   check cache│              │
   │                            HIT ✅ ───────────┤              │  P4  (DB untouched)
   │                            │                 │              │
   │                            │            MISS ❌             │  P5
   │                            │                 │  query DB    │
   │                            │                 │  write cache │
   │                            ▼                 ▼              │
   │                        return            return            │
   │                                                            │
   │  On data change ▶ delete key (event-driven) + TTL backstop │  P3
   │  Net effect ▶ millions of repeated queries never run       │  P1
   └────────────────────────────────────────────────────────────┘
```

---

## 10. Interview Notes (Consolidated)

A quick-fire review sheet for the whole day.

| # | Question | Crisp answer |
|---|---|---|
| 1 | What is a cache? | A fast store holding a *copy* of an answer, so you skip redoing expensive work. |
| 2 | Why is the DB the bottleneck? | Stateful, shared by all features, hard to scale horizontally, biggest failure blast radius. |
| 3 | Why cache instead of optimizing the query? | Optimizing speeds up one execution (linear); caching removes repeated executions (multiplicative) and protects the DB. |
| 4 | Walk through a NestJS request. | Client → Router (match + guard) → Controller (HTTP boundary, thin) → Service (logic + data access) → DB → back up → response. |
| 5 | Where does cache logic belong? | The **Service** layer — it owns *where* data comes from. Controller stays unchanged. |
| 6 | What principle is that? | Separation of Concerns. |
| 7 | Define Cache Hit. | Data found in cache → returned → DB never touched. |
| 8 | Define Cache Miss. | Data not in cache → query DB → store in cache → return. |
| 9 | What is Cache-Aside? | App checks cache first; on miss, loads from DB and populates cache. Cache sits "aside." |
| 10 | Why is Cache-Aside popular? | Simple, lazy (only hot data cached), fail-safe (cache down ⇒ falls back to DB). |
| 11 | What is invalidation? | Removing a stale cached copy (usually deleting the key) so the next read reloads fresh. |
| 12 | TTL vs. invalidation? | Invalidation = event-driven, primary (correctness). TTL = time-based, safety net (bounds staleness). |
| 13 | Why not long TTL alone? | Data can be stale for the whole TTL after a change (room price example). |
| 14 | What is a cache stampede? | A hot key expires; many concurrent requests all miss and hit the DB at once (thundering herd). |
| 15 | Hit ratio? | hits / (hits + misses); high is the goal for hot, stable data. |

---

## 11. Important Takeaways

The ten things to remember from Day 1 (Part 1):

1. **Caching eliminates work; it doesn't just speed it up.** The win is preventing millions of unnecessary queries, not shaving milliseconds off one.
2. **The database is your most precious resource** — protect it. It's the shared, stateful, hard-to-scale part whose failure takes everything down.
3. **A request flows down and back up** through Router → Controller → Service → DB. Each layer has one job.
4. **Caching lives in the Service layer** because the Service owns data-access decisions. Do it right and the Controller never changes.
5. **Cache Hit → DB untouched.** That's the goal state; aim for a high hit ratio.
6. **Cache Miss → query DB, then repopulate the cache.** The repopulate step is what creates future hits.
7. **Cache-Aside is the default strategy:** check cache → hit returns / miss loads DB & stores → return. It's simple, lazy, and fail-safe.
8. **Invalidate on change; keep TTL as a backstop.** Event-driven for freshness, time-based so nothing is stale forever.
9. **Long-TTL-only caching serves stale data** (the room price problem). Short-TTL-only caching wastes the cache. You need invalidation to break the trade-off.
10. **Cache stampedes are a real failure mode:** hot key expiry → herd of concurrent misses → DB overload. Recognize it now; the fix comes later.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **Cache** | A fast (usually in-memory) store holding copies of answers to avoid redoing expensive work. |
| **Cache Hit** | Requested data is found in the cache; returned without querying the database. |
| **Cache Miss** | Requested data is not in the cache; must query the database and then store the result. |
| **Hit Ratio** | hits / (hits + misses). A measure of how effective the cache is. |
| **Cache-Aside (Lazy Loading)** | Strategy where the application checks the cache first and loads from the DB on a miss, populating the cache. |
| **TTL (Time To Live)** | An expiry duration after which the cache automatically drops a value. |
| **Invalidation** | Deliberately removing/refreshing a cached copy so it stops serving stale data. |
| **Stale Data** | A cached copy that no longer matches the current source of truth. |
| **Cache Stampede** | When a hot key expires and many concurrent requests all miss and hit the DB simultaneously (thundering herd / dog-piling). |
| **Separation of Concerns** | Design principle that each part of a system owns one distinct responsibility. |
| **Source of Truth** | The authoritative store of data (PostgreSQL here); the cache only holds copies of it. |
| **Bottleneck** | The narrowest, most limiting resource in a system — here, the database. |

---

> **End of Day 1 (Part 1).**
> **Next up (future lessons):** the actual Redis code for Cache-Aside, real TTL/invalidation implementation, and the *solution* to the cache stampede.
