import { IsNumber, IsString } from 'class-validator';

export class GetSlotsDto {
  @IsNumber()
  id: number;
  @IsString()
  date: string;
}
