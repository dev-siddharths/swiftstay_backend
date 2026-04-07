# SwiftStay Backend 🚀

Backend service for **SwiftStay** — a room booking system built to explore real-world backend architecture using NestJS.

## 🛠️ Tech Stack
- NestJS
- PostgreSQL (Neon DB)
- TypeORM / Prisma (use whichever you used)
- JWT Authentication
- class-validator

## ⚙️ Features
- User authentication (Signup / Login)
- JWT-based authorization with guards
- Room listing & management
- Slot-based booking system (not just date-based)
- Booking management (view & cancel)
- Availability checks (prevents overlapping bookings)
- Transaction-safe booking cancellation
- DTO validation using global pipes

## 🧩 Architecture
- Modular structure:
  - Auth Module
  - User Module
  - Room Module
  - Booking Module
  - Database Module
- Clean separation of:
  - Controllers (request handling)
  - Services (business logic)
  - DTOs (validation layer)

## 🔐 Authentication Flow
- JWT tokens issued on login/signup
- Protected routes using guards
- Passwords hashed using bcrypt

## 📦 Installation
git clone https://github.com/dev-siddharths/swiftstay_backend.git
cd swiftstay_backend
npm install
⚡ Running the Server
npm run dev

## Env Format
DATABASE_URL=your_neon_db_url
JWT_SECRET=your_secret
PORT=3000
FRONTEND_URL=http://localhost:3001
```bash
