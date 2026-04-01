import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import createBookingDto from './dto/createBooking.dto';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth/jwt-auth.guard';

@Controller('booking')
export class BookingController {
  constructor(private bookingService: BookingService) {}
  @Post()
  @UseGuards(JwtAuthGuard)
  createBooking(@Body() data: createBookingDto) {
    return this.bookingService.createBooking(data);
  }
  //get bookings for that specific user
  @Get()
  @UseGuards(JwtAuthGuard)
  getBookings(@Req() req: any) {
    return this.bookingService.getBooking(req.user);
  }
}
