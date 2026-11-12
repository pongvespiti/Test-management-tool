import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

/** Test device registry: what exists, in what state and who holds it. */
@Module({
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
