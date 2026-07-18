import { IsNumber, IsString } from 'class-validator';

// Shape of a single room row returned by the admin listing.
// This is a response DTO (describes what we send back), so it is a plain
// typed shape — no class-validator decorators, which only apply to
// incoming request payloads.
export class AdminRoomDto {
  id: number;
  title: string;
  price: number;
  image_url: string | null;
  description: string | null;
  location: string | null;
}

// Incoming payload for editing a room. This IS a request DTO, so the
// class-validator decorators are meaningful (enforced when a global
// ValidationPipe is enabled).
export class EditRoomDto {
  @IsString()
  title: string;

  @IsNumber()
  price: number;

  @IsString()
  image_url: string;

  @IsString()
  description: string;

  @IsString()
  location: string;
}

// Incoming payload for creating a room. Same fields as EditRoomDto minus the
// id (the DB generates it on insert).
export class CreateRoomDto {
  @IsString()
  title: string;

  @IsNumber()
  price: number;

  @IsString()
  image_url: string;

  @IsString()
  description: string;

  @IsString()
  location: string;
}
