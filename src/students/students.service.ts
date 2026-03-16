import { Injectable } from '@nestjs/common';

@Injectable()
export class StudentsService {
  private students = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }];

  getAllStudents() {
    return this.students;
  }
}
