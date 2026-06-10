/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.sql(`-- 1. User
CREATE TABLE "User" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  CONSTRAINT email_unique UNIQUE (email)
);

-- 2. Room
CREATE TABLE "Room" (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  price INTEGER NOT NULL,
  image_url TEXT,
  description TEXT,
  location TEXT
);

-- 3. Amenities
CREATE TABLE "Amenities" (
  id INTEGER PRIMARY KEY,
  name TEXT,
  "Icon_Url" TEXT,
  CONSTRAINT unique_amenity UNIQUE (name)
);

-- 4. RoomSlot (depends on Room)
CREATE TABLE "RoomSlot" (
  id SERIAL PRIMARY KEY,
  "roomId" INTEGER NOT NULL REFERENCES "Room"(id),
  "startTime" TIME NOT NULL,
  "endTime" TIME NOT NULL,
  "slotDate" DATE NOT NULL
);

-- 5. Booking (depends on User, Room, RoomSlot)
CREATE TABLE "Booking" (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"(id),
  "roomId" INTEGER NOT NULL REFERENCES "Room"(id),
  "slotId" INTEGER NOT NULL REFERENCES "RoomSlot"(id),
  booking_date DATE NOT NULL,
  final_price INTEGER NOT NULL,
  CONSTRAINT "slotId_unique" UNIQUE ("slotId")
);

-- 6. cancelled_bookings (depends on User, Room, RoomSlot)
CREATE TABLE cancelled_bookings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES "User"(id),
  room_id INTEGER REFERENCES "Room"(id),
  slot_id INTEGER REFERENCES "RoomSlot"(id),
  booking_date DATE NOT NULL,
  final_price INTEGER NOT NULL
);

-- 7. room_amenities (depends on Room, Amenities)
CREATE TABLE room_amenities (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES "Room"(id),
  amenity_id INTEGER REFERENCES "Amenities"(id)
);

-- 8. roomimages (depends on Room)
CREATE TABLE roomimages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES "Room"(id),
  image_url TEXT
);

-- 9. slot_locks (depends on User, RoomSlot)
CREATE TABLE slot_locks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES "User"(id),
  slot_id INTEGER REFERENCES "RoomSlot"(id),
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT slot_locks_slot_id_key UNIQUE (slot_id)
);
`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS slot_locks;
DROP TABLE IF EXISTS roomimages;
DROP TABLE IF EXISTS room_amenities;
DROP TABLE IF EXISTS cancelled_bookings;
DROP TABLE IF EXISTS "Booking";
DROP TABLE IF EXISTS "RoomSlot";
DROP TABLE IF EXISTS "Amenities";
DROP TABLE IF EXISTS "Room";
DROP TABLE IF EXISTS "User";
`);
};
