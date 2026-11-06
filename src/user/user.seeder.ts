import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AUTH_CONFIG, AuthConfig } from '../config/auth.config';
import { UserService } from './user.service';

@Injectable()
export class UserSeeder implements OnModuleInit {
  constructor(
    private readonly userService: UserService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  onModuleInit() {
    return this.userService.seed(this.config.heirEmail);
  }
}
