import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoomService } from './room.service';
import { RoomDto } from './dto/room.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import { GetSlotsDto } from './dto/GetSlotsDto.dto';

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

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getRoomById(@Param('id') id: string) {
    return this.roomService.getRoomById(id);
  }

  @Post('getSlot')
  @UseGuards(JwtAuthGuard)
  getSlotByRoomId(@Body() data: GetSlotsDto) {
    return this.roomService.getSlotsBy_RoomId_And_Date(data);
  }
}
