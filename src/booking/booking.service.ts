import { Injectable } from '@nestjs/common';
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
  async createBooking(data: createBookingDto) {
    try {
      const res = await this.db.query(
        `INSERT INTO "Booking" ("userId", "roomId", "slotId", "booking_date", "final_price")
       VALUES ($1, $2, $3, $4, $5)`,
        [data.user_id, data.roomId, data.slotId, data.date, data.final_price],
      );

      return { success: true, message: 'Booking Successful' };
    } catch (error) {
      if (error instanceof DatabaseError && error.code === '23505') {
        return { success: false, message: 'Slot already booked' };
      }

      console.log(error);
      return { success: false, message: 'Internal Server Error' };
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

  async deleteBooking(booking_id: number) {
    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      // 1. Get booking details
      const bookingRes = await client.query(
        `SELECT "userId", "roomId", "slotId","booking_date","final_price" FROM "Booking" WHERE id = $1`,
        [booking_id],
      );

      if (bookingRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Booking not found' };
      }
      type booking = {
        id: number;
        userId: number;
        roomId: number;
        slotId: number;
        booking_date: string;
        final_price: number;
      };
      const booking: booking = bookingRes.rows[0];

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

      return {
        success: false,
        message: 'Internal Server Error',
      };
    } finally {
      client.release();
    }
  }
}
