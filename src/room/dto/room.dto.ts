import { IsNumber, IsString } from 'class-validator';

export class RoomDto {
  @IsNumber()
  id: number;

  @IsString()
  title: string;

  @IsNumber()
  price: number;
}
