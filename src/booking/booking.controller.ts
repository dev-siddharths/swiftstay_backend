import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import createBookingDto from './dto/createBooking.dto';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';
import deleteBooking from './dto/deleteBooking.dto';

@Controller('booking')
export class BookingController {
  constructor(private bookingService: BookingService) {}
  @Post('createBooking')
  @UseGuards(JwtAuthGuard)
  createBooking(@Body() data: createBookingDto, @Req() currentUserId: any) {
    return this.bookingService.createBooking(data, currentUserId.user.id);
  }
  //get bookings for that specific user
  @Get('getBooking')
  @UseGuards(JwtAuthGuard)
  getBookings(@Req() req: any) {
    return this.bookingService.getBooking(req.user);
  }

  @Post('deleteBooking')
  @UseGuards(JwtAuthGuard)
  deleteBooking(@Body() data: deleteBooking, @Req() user: any) {
    return this.bookingService.deleteBooking(data.booking_id, user.user.id);
  }
}
