import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import { RoomDto } from './dto/room.dto';
import { GetSlotsDto } from './dto/GetSlotsDto.dto';
import { RedisService } from 'src/redis/redis.service';
import { RedisClientType } from 'redis';

type Slot = {
  id: number;
  startTime: string;
  endTime: string;
};
@Injectable()
export class RoomService {
  constructor(
    private db: DbService,
    private rs: RedisService,
  ) {}

  /**
   * Pauses the current async flow for `ms` milliseconds without blocking the
   * event loop. Used by cache-miss waiters to space out their cache polls.
   * @param ms - milliseconds to wait before the returned promise resolves
   */
  private sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
  /**
   * Reads all rooms from the database, repopulates the `rooms:all` cache, and
   * releases `rooms:lock`. Invoked by the request that won the lock, and as the
   * fallback when a waiter times out or Redis is unavailable.
   *
   * Redis failures (cache write / lock release) are swallowed so a cache outage
   * never fails the request — the DB result is still returned. A DB failure
   * releases the lock and rethrows.
   *
   * @throws {InternalServerErrorException} when the database query fails
   */
  private async roomsDBCall() {
    const redisClient: RedisClientType = this.rs.getClient();
    let result;
    try {
      result = await this.db.query(`select * from "Room" order by "price"`);
    } catch (error) {
      await redisClient.del('rooms:lock');
      console.log('Db is down');
      throw new InternalServerErrorException('Db Down');
    }
    const rowsReturned = result.rows;
    if (rowsReturned.length > 0) {
      try {
        await redisClient.set('rooms:all', JSON.stringify(rowsReturned), {
          EX: 3600,
        });
      } catch (error) {
        console.log('Redis is unreachable', error);
      } finally {
        try {
          await redisClient.del('rooms:lock');
        } catch (error) {
          console.log('Redis is down');
        }
      }

      return {
        success: true,
        data: rowsReturned,
        message: 'Rooms exist',
      };
    } else {
      return { success: true, data: [], message: 'No rooms exist' };
    }
  }

  /**
   * Returns all rooms, served from the Redis `rooms:all` cache when warm.
   *
   * On a cache miss it uses a `rooms:lock` (SET NX EX 5s) to prevent a cache
   * stampede: the one request that acquires the lock rebuilds the cache from the
   * DB, while concurrent requests poll the cache (~200ms x 26 ≈ 5s) before
   * falling back to a direct DB read. If Redis is unreachable, it degrades to a
   * direct DB read so the endpoint keeps working.
   *
   * @returns the room list; `data` is `[]` when no rooms exist
   */
  async getRooms(): Promise<{
    success: boolean;
    data?: RoomDto[];
    message?: string;
  }> {
    try {
      //cache hit
      const redisClient: RedisClientType = this.rs.getClient();
      try {
        const cachedRooms: string | null = await redisClient.get('rooms:all');
        if (cachedRooms) {
          return {
            success: true,
            data: JSON.parse(cachedRooms),
            message: 'Rooms exist',
          };
        }
      } catch (error) {
        console.log('Redis is unreachable ', error);
      }
      //cache miss
      try {
        let lock: string | null = await redisClient.set('rooms:lock', 1, {
          NX: true,
          EX: 5,
        });

        if (lock === 'OK') {
          //i got the lock
          return await this.roomsDBCall();
        } else {
          //i did not get it

          let count: number = 0;
          while (true) {
            if (count > 25) {
              return await this.roomsDBCall();
            } else {
              await this.sleep(200);
              try {
                const cachedRooms: string | null =
                  await redisClient.get('rooms:all');

                if (cachedRooms) {
                  return {
                    success: true,
                    data: JSON.parse(cachedRooms),
                    message: 'Rooms exist',
                  };
                }
              } catch (error) {
                console.log('Redis is down', error);
              }
            }
            count++;
          }
        }
      } catch (error) {
        console.log('Redis is down', error);
        return await this.roomsDBCall();
      }
    } catch (error) {
      throw error;
    }
  }
  //to fetch room details using id
  async getRoomById(id: string) {
    type apiPayload = {
      image_url: string[];
      room_name: string;
      room_price: number;
      room_description: string;
      room_location: string;
      amenities: string[];
    };
    try {
      const checkID = await this.db.query(
        `Select id from "Room" where id = $1`,
        [id],
      );
      if (checkID.rowCount === 1) {
        const roomImageDetails = await this.db.query(
          `select image_url from roomimages where room_id = $1`,
          [id],
        );
        const roomDetails = await this.db.query(
          `select title, price, description, location from "Room" where id = $1`,
          [id],
        );
        const amenities = await this.db.query(
          `select t1.name,t1."Icon_Url" from "Amenities" t1 inner join room_amenities t2 
        on t1.id = t2.amenity_id 
        where t2.room_id = $1`,
          [id],
        );

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
          const room_location: string = roomDetailsInfo
            .map((val) => {
              return val.location;
            })
            .join();
          // const amenities:string[] =

          const payload: apiPayload = {
            image_url: imageUrl,
            room_name: room_name,
            room_price: Number(room_price),
            room_description: room_description,
            room_location: room_location,
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
        throw new NotFoundException('Room Not Found');
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Failed');
      }
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

      const now = new Date();
      const currTime = istTimeFormatter.format(now);
      const currDate = istDateFormatter.format(now);
      console.log('current time:', currTime);
      console.log('coming from db time:', res.rows);

      console.log("Today's date server", currDate);
      const filteredSlots = res.rows.filter((slot) => {
        // Remove past slots (only if today)
        if (data.date === currDate) {
          return currTime <= slot.endTime;
        }
        return true;
      });

      return { success: true, data: filteredSlots };
    } catch (error) {
      throw new InternalServerErrorException('Failed');
    }
  }
}
