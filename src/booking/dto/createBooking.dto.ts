import { IsNumber, IsString } from 'class-validator';

class createBookingDto {
  @IsNumber()
  user_id: number;
  @IsNumber()
  roomId: number;
  @IsNumber()
  slotId: number;
  @IsString()
  date: string;
  @IsNumber()
  final_price: number;
}
export default createBookingDto;
