import { IsNumber, IsString } from 'class-validator';

class createBookingDto {
  @IsNumber()
  roomId!: number;
  @IsNumber()
  slotId!: number;
  // @IsString()
  // date!: string;
  @IsNumber()
  final_price!: number;
}
export default createBookingDto;
