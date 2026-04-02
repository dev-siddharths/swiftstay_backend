import { Injectable } from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import createBookingDto from './dto/createBooking.dto';

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
      console.log(data);
      const res = await this.db.query(
        `insert into "Booking"("userId","roomId","slotId","booking_date","final_price") values($1,$2,$3,$4,$5)`,
        [data.user_id, data.roomId, data.slotId, data.date, data.final_price],
      );
      if (res.rowCount === 1) {
        return { success: true, message: 'Booking Successfull' };
      } else {
        return { success: false, message: 'Booking Unsuccessfull' };
      }
    } catch (error) {
      return { success: false, message: 'Internal Server Error' };
    }
  }

  async getBooking(user: any) {
    try {
      console.log(user.id);
      const res = await this.db.query(
        `
      SELECT b.id as "Booking_Id", r.title as "Room_Name", r.image_url as "Room_Img", r.location as "Room_Location", 
       b.final_price as "Final_Price", b.booking_date as "Booking_Date", 
       rs."startTime" as "StartTime", rs."endTime" as "EndTime"
      FROM "Room" r
      INNER JOIN "Booking" b ON r.id = b."roomId"
      INNER JOIN "RoomSlot" rs ON b."slotId" = rs.id
      WHERE b."userId" = $1;`,
        [user.id],
      );
      const allBookingDates: string[] = res.rows.map((val) => {
        const date = new Date(val.Booking_Date).toLocaleDateString('en-CA');
        return date;
      });

      const startTime: string[] = res.rows.map((val) => {
        return val.StartTime;
      });

      const endTime: string[] = res.rows.map((val) => {
        return val.EndTime;
      });

      console.log('Start', startTime);
      console.log('End', endTime);

      const now = new Date();
      const currDate = now.toLocaleDateString('en-CA'); // "YYYY-MM-DD"
      const currTime = now.toLocaleTimeString('en-CA', { hour12: false });
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

      const data: BookingResponse[] = res.rows.map((val, i) => {
        return {
          ...val,
          status: statusArray[i],
        };
      });

      return { success: true, data };
    } catch (error) {
      return { success: false, message: 'Internal Server Error' };
    }
  }

  async deleteBooking(booking_id: number) {
    try {
      const res = await this.db.query(`delete from "Booking" where id = $1`, [
        booking_id,
      ]);
      if (res.rowCount === 1) {
        return { success: true, message: 'Your Booking has been cancelled' };
      } else {
        return {
          success: false,
          message: 'There is some issue, Please try again later',
        };
      }
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: 'Internal Server Error',
      };
    }
  }
}
