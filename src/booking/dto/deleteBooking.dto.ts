import { IsNumber } from 'class-validator';

class deleteBooking {
  @IsNumber()
  booking_id: number;
}

export default deleteBooking;
