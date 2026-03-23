import { Injectable } from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import { RoomDto } from './dto/room.dto';

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
}
