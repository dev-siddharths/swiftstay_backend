import { Controller, Get, UseGuards } from '@nestjs/common';
import { StudentsService } from './students.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}
  @UseGuards(AuthGuard('jwt'))
  @Get()
  getStudents() {
    return this.studentsService.getAllStudents();
  }
}
