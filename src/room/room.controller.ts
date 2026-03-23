import { Controller, Get, UseGuards } from '@nestjs/common';
import { RoomService } from './room.service';
import { RoomDto } from './dto/room.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('room')
export class RoomController {
  constructor(private roomService: RoomService) {}
  @Get('getRooms')
  @UseGuards(JwtAuthGuard)
  getRooms(): Promise<{
    success: boolean;
    data?: RoomDto[];
    message?: string;
  }> {
    return this.roomService.getRooms();
  }
}
