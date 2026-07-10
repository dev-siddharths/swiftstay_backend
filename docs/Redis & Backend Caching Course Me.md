# Redis & Backend Caching Course Memory

## Student
Sid

## Project
SwiftStay

Stack:
- NestJS
- PostgreSQL
- Raw pg
- JWT
- Redis (to be implemented)

---

# Course Goal

The goal is NOT to simply learn Redis.

The goal is to think like a Backend Engineer when designing caching systems.

Every concept should first be understood from first principles.

Implementation always comes after understanding.

---

# Estimated Duration

~30 Hours

---

# Overall Progress

Course Progress:
6%

Current Day:
Day 1 (Paused)

Day 1 Status:
Not Finished

---

# Topics Completed

## Module 1
- Why caching exists
- Database bottlenecks
- Why repeated reads are expensive
- Database load
- RAM vs Database (intro)
- Cache invalidation introduction

---

## Module 2

Backend Request Lifecycle

Browser
↓
Router
↓
Controller
↓
Service
↓
PostgreSQL
↓
Service
↓
Controller
↓
Client

---

Service Layer Responsibilities

- Business logic
- Database access
- Redis access
- Cache decisions

Controller should never know whether data came from:
- PostgreSQL
- Redis
- API
- MongoDB

---

## Cache Fundamentals

Covered:

- Cache Hit
- Cache Miss
- Cache Aside (Concept Only)

Not Yet Covered:

- Cache Aside Implementation
- TTL
- Cache Keys
- Cache Invalidation Deep Dive

---

## Advanced Topics Introduced

Cache Stampede

Only the problem has been discussed.

Solutions have NOT been discussed.

---

# Backend Engineering Principles Learned

1.
Caching is not about making one query faster.

It is about preventing millions of unnecessary queries.

2.

Controllers should not know where data comes from.

Services own data access decisions.

3.

Invalidate cache when data changes.

TTL is only a safety net.

4.

Cache Hit

Redis serves data.

Database is never touched.

5.

Cache Miss

Database is queried.

Redis is updated.

Response is returned.

---

# Next Lesson

Continue Day 1.

Topic:

Cache Stampede

Discuss:
- Why it happens
- Why simple Cache Aside is insufficient under high concurrency
- Industry solutions

Do NOT move to Day 2 until Day 1 is fully completed.
