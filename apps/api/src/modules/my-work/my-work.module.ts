import { Module } from '@nestjs/common';
import { MyWorkController } from './my-work.controller.js';
import { MyWorkService } from './my-work.service.js';

/** "My work": run cases waiting for the signed-in user and a day / week summary of their results. */
@Module({
  controllers: [MyWorkController],
  providers: [MyWorkService],
})
export class MyWorkModule {}
