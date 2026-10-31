import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Counter } from './entities/counter.entity';
import { UserService } from './user.service';
import { AuthConfigModule } from '../config/auth-config.module';
import { UserSeeder } from './user.seeder';

@Module({
  imports: [TypeOrmModule.forFeature([User, Counter]), AuthConfigModule],
  providers: [UserService, UserSeeder],
  exports: [UserService],
})
export class UserModule {}
