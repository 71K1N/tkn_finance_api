import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('version', () => {
    it('should return the package version and commit', () => {
      expect(appController.getVersion()).toEqual({
        version: expect.stringMatching(/^\d+\.\d+\.\d+/),
        commit: expect.any(String),
      });
    });
  });
});
