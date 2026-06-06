import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import createBookingDto from './dto/createBooking.dto';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('bookings')
export class BookingController {
  constructor(private bookingService: BookingService) {}

  @Post('')
  @UseGuards(JwtAuthGuard)
  createBooking(@Body() data: createBookingDto, @Req() req: any) {
    return this.bookingService.createBooking(data, req.user.id);
  }
  // acquire lock
  @Post('slots/:slotId/lock')
  @UseGuards(JwtAuthGuard)
  lockSlot(@Param('slotId') slot_id: string, @Req() req: any) {
    return this.bookingService.lockSlot(Number(slot_id), req.user.id);
  }

  @Delete('slots/:slotId/lock')
  @UseGuards(JwtAuthGuard)
  releaseLock(@Param('slotId') slot_id: string, @Req() req: any) {
    return this.bookingService.releaseLock(Number(slot_id), req.user.id);
  }
  // get bookings for logged in user
  @Get('')
  @UseGuards(JwtAuthGuard)
  getBookings(@Req() req: any) {
    return this.bookingService.getBooking(req.user);
  }

  // cancel/delete booking
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteBooking(@Param('id') id: string, @Req() req: any) {
    return this.bookingService.deleteBooking(Number(id), req.user.id);
  }
}
