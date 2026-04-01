import { Injectable } from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import { RoomDto } from './dto/room.dto';
import { GetSlotsDto } from './dto/GetSlotsDto.dto';
type Slot = {
  id: number;
  startTime: string;
  endTime: string;
};
@Injectable()
export class RoomService {
  constructor(private db: DbService) {}
  async getRooms(): Promise<{
    success: boolean;
    data?: RoomDto[];
    message?: string;
  }> {
    const result = await this.db.query(`select * from "Room" order by "price"`);
    const rowsReturned = result.rows;
    if (rowsReturned.length > 0) {
      return { success: true, data: rowsReturned };
    } else {
      return { success: false, message: 'No rooms exist' };
    }
  }
  //to fetch room details using id
  async getRoomById(id: string) {
    type apiPayload = {
      image_url: string[];
      room_name: string;
      room_price: number;
      room_description: string;
      amenities: string[];
    };
    try {
      const checkID = await this.db.query(
        `Select id from "Room" where id = ${id}`,
      );
      if (checkID.rowCount === 1) {
        const roomImageDetails = await this.db.query(
          `select image_url from roomimages where room_id = ${id}`,
        );
        const roomDetails = await this.db.query(
          `select title, price, description from "Room" where id = ${id}`,
        );
        const amenities = await this.db
          .query(`select t1.name,t1."Icon_Url" from "Amenities" t1 inner join room_amenities t2 
        on t1.id = t2.amenity_id 
        where t2.room_id = ${id}`);

        const roomDetailsInfo = roomDetails.rows;
        if (roomImageDetails.rows.length > 0 && roomDetails.rows.length > 0) {
          const imageUrl: string[] = roomImageDetails.rows.map((room) => {
            return room.image_url;
          });
          const room_name: string = roomDetailsInfo
            .map((val) => {
              return val.title;
            })
            .join();
          let room_price: string = roomDetailsInfo
            .map((val) => {
              return val.price;
            })
            .join();

          const room_description: string = roomDetailsInfo
            .map((val) => {
              return val.description;
            })
            .join();

          // const amenities:string[] =

          const payload: apiPayload = {
            image_url: imageUrl,
            room_name: room_name,
            room_price: Number(room_price),
            room_description: room_description,
            amenities: amenities.rows,
          };
          return {
            success: true,
            data: payload,
          };
        } else {
          return { status: false, message: 'Error in generating payload' };
        }
      } else {
        return { status: false, message: `Room Doesn't Exist` };
      }
    } catch (error) {
      return { status: false, message: 'Failed' };
    }
  }

  //get Slots by roomId and for the selected date

  async getSlotsBy_RoomId_And_Date(
    data: GetSlotsDto,
  ): Promise<{ success: boolean; data?: Slot[]; message?: string }> {
    try {
      const res = await this.db.query(
        `SELECT id, "startTime", "endTime"
        FROM "RoomSlot"
        WHERE "roomId" = $1
        AND "slotDate" = $2
        AND id NOT IN (
        SELECT "slotId" FROM "Booking" WHERE "booking_date" = $2
        );`,
        [data.id, data.date],
      );

      const payload: Slot[] = res.rows;
      return { success: true, data: payload };
    } catch (error) {
      return { success: false, message: 'Try after sometime....' };
    }
  }
}
