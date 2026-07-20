import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import { AdminRoomDto, CreateRoomDto, EditRoomDto } from './dto/rooms.dto';
import { RedisClientType } from '@redis/client';
import { RedisService } from 'src/redis/redis.service';

type getRooms = {
  success: boolean;
  data?: AdminRoomDto[];
  message?: string;
};

@Injectable()
export class RoomsService {
  constructor(
    private db: DbService,
    private rs: RedisService,
  ) {}

  // Admin listing: always reads fresh from the DB (no Redis cache) so the panel
  // reflects create/update/delete immediately.

  async getRooms(): Promise<getRooms> {
    try {
      const result = await this.db.query(
        `select id, title, price, image_url, description, location
         from "Room" order by "price"`,
      );
      const rowsReturned: AdminRoomDto[] = result.rows;
      if (rowsReturned.length > 0) {
        return { success: true, data: rowsReturned, message: 'Rooms exist' };
      } else {
        return { success: true, data: [], message: 'No rooms exist' };
      }
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch rooms');
    }
  }

  async editRooms(room_id: number, editData: EditRoomDto) {
    try {
      const room_res = await this.db.query(
        `select * from "Room" where id = $1`,
        [room_id],
      );
      if (room_res.rows.length === 1) {
        const res = await this.db.query(
          `update "Room" set title = $1, price = $2, image_url = $3, description= $4, location = $5 where id = $6`,
          [
            editData.title,
            editData.price,
            editData.image_url,
            editData.description,
            editData.location,
            room_id,
          ],
        );
        if (res.rowCount === 0) {
          //update failure
          return { success: false, message: 'Did not update' };
        } else {
          //update successfull
          const redisClient: RedisClientType = this.rs.getClient();
          try {
            await redisClient.del('rooms:all');
          } catch (error) {
            console.log('Redis cache invalidation failed:', error);
          }

          return { success: true, message: 'Update Successfull' };
        }
      } else {
        throw new NotFoundException({
          success: false,
          message: 'Room not found',
        });
      }
    } catch (error) {
      console.log(error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Sorry Something went wrong');
    }
  }

  async createRoom(createData: CreateRoomDto) {
    try {
      const res = await this.db.query(
        `insert into "Room" (title, price, image_url, description, location) values ($1, $2, $3, $4, $5)`,
        [
          createData.title,
          createData.price,
          createData.image_url,
          createData.description,
          createData.location,
        ],
      );
      if (res.rowCount === 0) {
        return { success: false, message: 'Did not create' };
      } else {
        const redisClient: RedisClientType = this.rs.getClient();
        try {
          await redisClient.del('rooms:all');
        } catch (error) {
          console.log('Redis is unreachable', error);
        }

        return { success: true, message: 'Create Successfull' };
      }
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Sorry Something went wrong');
    }
  }

  async deleteRoom(room_id: number) {
    try {
      const room_res = await this.db.query(
        `select * from "Room" where id = $1`,
        [room_id],
      );
      if (room_res.rows.length === 1) {
        const res = await this.db.query(`delete from "Room" where id = $1`, [
          room_id,
        ]);
        if (res.rowCount === 0) {
          return { success: false, message: 'Did not delete' };
        } else {
          const redisClient: RedisClientType = this.rs.getClient();
          try {
            await redisClient.del('rooms:all');
          } catch (error) {
            console.log('Redis is unreachable', error);
          }
          return { success: true, message: 'Delete Successfull' };
        }
      } else {
        throw new NotFoundException({
          success: false,
          message: 'Room not found',
        });
      }
    } catch (error) {
      console.log(error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Sorry Something went wrong');
    }
  }
}
