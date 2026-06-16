import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import createBookingDto from './dto/createBooking.dto';
import { QueryResult } from 'pg';
import { DatabaseError } from 'pg';
type BookingResponse = {
  Booking_Id: number;
  Room_Name: string;
  Room_Img: string;
  Room_Location: string;
  Final_Price: number;
  Booking_Date: string;
  StartTime: string;
  EndTime: string;
  status: string;
};

@Injectable()
export class BookingService {
  constructor(private db: DbService) {}
  async createBooking(data: createBookingDto, currentUserId: number) {
    try {
      console.log('userId', currentUserId);
      const checkLock = await this.db.query(
        `select user_id, slot_id from slot_locks where user_id = $1 and slot_id = $2`,
        [currentUserId, data.slotId],
      );
      if (checkLock.rows.length === 0) {
        return {
          success: false,
          message: 'Lock for this slot and userId does not exist',
        };
      } else {
        // Fetch the slot's own date/time and compute (in IST) whether it has
        // already started or ended. Never trust a date from the client.
        const slotRes = await this.db.query(
          `SELECT "slotDate", "startTime", "endTime",
             ("slotDate" + "endTime") < (NOW() AT TIME ZONE 'Asia/Kolkata') AS ended
           FROM "RoomSlot" WHERE id = $1`,
          [data.slotId],
        );

        if (slotRes.rows.length === 0) {
          return { success: false, message: 'Slot not found' };
        }

        const slot = slotRes.rows[0];

        // Validate slotDate + endTime before creating a booking. A slot that has
        // started but not yet ended is still bookable.
        if (slot.ended) {
          throw new ConflictException({
            success: false,
            message: 'This slot has already ended and can no longer be booked',
          });
        }

        // Pull booking_date straight from the slot in SQL so the DATE never
        // round-trips through a JS Date (which can shift it by a day via TZ).
        const res = await this.db.query(
          `INSERT INTO "Booking" ("userId", "roomId", "slotId", "booking_date", "final_price")
       VALUES ($1, $2, $3, (SELECT "slotDate" FROM "RoomSlot" WHERE id = $3), $4)`,
          [currentUserId, data.roomId, data.slotId, data.final_price],
        );

        return { success: true, message: 'Booking Successful' };
      }
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof DatabaseError && error.code === '23505') {
        return { success: false, message: 'Slot already booked' };
      }

      console.log(error);
      return { success: false, message: 'Internal Server Error' };
    }
  }

  // lock slot

  async lockSlot(slotNo: number, currentUserId: number) {
    try {
      //start
      await this.db.query('BEGIN');
      //middle
      //check if slot is already booked
      const checkBooked = await this.db.query(
        `SELECT id FROM "Booking" WHERE "slotId" = $1`,
        [slotNo],
      );
      if (checkBooked.rows.length > 0) {
        await this.db.query('ROLLBACK');
        throw new ConflictException('This slot has already been booked');
      }

      //lock the the slot row with pessimistic lock
      await this.db.query(
        `SELECT id FROM "RoomSlot" WHERE id = $1 FOR UPDATE`,
        [slotNo],
      );

      //delete stale locks on the selected slot
      await this.db.query(
        `DELETE FROM slot_locks WHERE slot_id = $1 AND locked_until < NOW()`,
        [slotNo],
      );

      //check for prexisting locks
      const checkLock = await this.db.query(
        `select id from slot_locks where slot_id =$1`,
        [slotNo],
      );
      if (checkLock.rows.length > 0) {
        await this.db.query('ROLLBACK');
        throw new ConflictException(
          "Sorry this slot isn't available for some time. Try again later",
        );
      }

      //no lock then acquire one
      await this.db.query(
        `INSERT INTO slot_locks (user_id, slot_id, locked_until) 
   VALUES ($1, $2, NOW() + INTERVAL '60 seconds')`,
        [currentUserId, slotNo],
      );
      //end
      await this.db.query('COMMIT');

      return { success: true, message: 'lock acquired' };
    } catch (err) {
      await this.db.query('ROLLBACK');
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(
        'Something went wrong. Please try again later',
      );
    }
  }

  //releaseLock
  async releaseLock(slotNo: number, currentUserId: number) {
    try {
      const deleteLock = await this.db.query(
        'delete from slot_locks where slot_id = $1 and user_id = $2',
        [slotNo, currentUserId],
      );
      if (deleteLock.rowCount === 1) {
        return {
          success: true,
          message: 'Slot lock deleted',
        };
      } else if (deleteLock.rowCount === 0) {
        return {
          success: false,
          message: 'Slot lock not found',
        };
      } else {
        return {
          success: true,
          message: 'Suspicious User, had 2 locks',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Sorry! Lock not deleted',
      };
    }
  }

  async getBooking(user: any) {
    try {
      // console.log(user.id);
      const res = await this.db.query(
        `
      SELECT b.id as "Booking_Id", r.title as "Room_Name", r.image_url as "Room_Img", r.location as "Room_Location", 
       b.final_price as "Final_Price", b.booking_date as "Booking_Date", 
       rs."startTime" as "StartTime", rs."endTime" as "EndTime"
      FROM "Room" r
      INNER JOIN "Booking" b ON r.id = b."roomId"
      INNER JOIN "RoomSlot" rs ON b."slotId" = rs.id
      WHERE b."userId" = $1`,
        [user.id],
      );
      // console.log(
      //   'DEBUG types:',
      //   typeof res.rows[0]?.StartTime,
      //   res.rows[0]?.Booking_Date,
      // );
      const istDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const istTimeFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const allBookingDates: string[] = res.rows.map((val) => {
        const date = new Date(val.Booking_Date);
        return istDateFormatter.format(date);
      });

      const startTime: string[] = res.rows.map((val) => {
        return val.StartTime;
      });

      const endTime: string[] = res.rows.map((val) => {
        return val.EndTime;
      });

      // console.log('Start', startTime);
      // console.log('End', endTime);

      const now = new Date();

      const currDate = istDateFormatter.format(now); // "YYYY-MM-DD"
      const currTime = istTimeFormatter.format(now);
      let statusArray: string[] = [];

      for (let i = 0; i < allBookingDates.length; i++) {
        if (allBookingDates[i] === currDate) {
          // Booking is today
          if (currTime < startTime[i]) {
            statusArray.push('Upcoming'); // starts later today
          } else if (currTime >= startTime[i] && currTime <= endTime[i]) {
            statusArray.push('Ongoing'); // currently happening
          } else if (currTime > endTime[i]) {
            statusArray.push('Completed'); // already finished today
          }
        } else if (allBookingDates[i] > currDate) {
          // Booking in future
          statusArray.push('Upcoming');
        } else if (allBookingDates[i] < currDate) {
          // Booking in past
          statusArray.push('Completed');
        }
      }
      const checkCancelled = await this.db.query(
        `SELECT 
        cb.id as "Booking_Id",
        r.title as "Room_Name",
        r.image_url as "Room_Img",
        r.location as "Room_Location",
        cb.final_price as "Final_Price",
        cb.booking_date as "Booking_Date",
        rs."startTime" as "StartTime",
        rs."endTime" as "EndTime"
        FROM "Room" r
        INNER JOIN "cancelled_bookings" cb ON r.id = cb."room_id"
        INNER JOIN "RoomSlot" rs ON cb."slot_id" = rs.id
        WHERE cb."user_id" = $1;`,
        [user.id],
      );
      console.log(checkCancelled.rows);

      const data: BookingResponse[] = res.rows.map((val, i) => {
        return {
          ...val,
          status: statusArray[i],
        };
      });

      return { success: true, data, cancelled_booking: checkCancelled.rows };
    } catch (error) {
      console.log(error);
      return { success: false, message: 'Internal Server Error', error: error };
    }
  }

  async deleteBooking(booking_id: number, user_id: number) {
    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      // 1. Get booking details
      const bookingRes = await client.query(
        `SELECT "userId", "roomId", "slotId","booking_date","final_price" FROM "Booking" WHERE id = $1`,
        [booking_id],
      );
      const booking: booking = bookingRes.rows[0];

      if (bookingRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Booking not found' };
      } else if (booking.userId !== user_id) {
        throw new ForbiddenException('You cannot cancel this booking');
      }
      type booking = {
        id: number;
        userId: number;
        roomId: number;
        slotId: number;
        booking_date: string;
        final_price: number;
      };

      // 2. Insert into cancelled_bookings
      await client.query(
        `INSERT INTO "cancelled_bookings" (id, user_id, room_id, slot_id, booking_date, final_price)
       VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          booking_id,
          booking.userId,
          booking.roomId,
          booking.slotId,
          booking.booking_date,
          booking.final_price,
        ],
      );

      // 3. Delete from Booking
      await client.query(`DELETE FROM "Booking" WHERE id = $1`, [booking_id]);

      await client.query('COMMIT');

      return { success: true, message: 'Your Booking has been cancelled' };
    } catch (error) {
      await client.query('ROLLBACK');
      console.log(error);
      throw error;
    } finally {
      client.release();
    }
  }
}
