import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { CreateRoomDto, EditRoomDto } from './dto/rooms.dto';

@Controller('admin/rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @Get()
  getRooms() {
    return this.roomsService.getRooms();
  }

  @Patch()
  editRooms(
    @Body('room_id') room_id: number,
    @Body('data') editData: EditRoomDto,
  ) {
    return this.roomsService.editRooms(room_id, editData);
  }

  @Post()
  createRoom(@Body('data') createData: CreateRoomDto) {
    return this.roomsService.createRoom(createData);
  }

  @Delete()
  deleteRoom(@Body('room_id') room_id: number) {
    return this.roomsService.deleteRoom(room_id);
  }
}
