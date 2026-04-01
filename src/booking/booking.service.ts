import { Injectable } from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import createBookingDto from './dto/createBooking.dto';

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
    // const res = await this.db.query("")
  }
}
