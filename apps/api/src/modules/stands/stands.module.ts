import { Module } from '@nestjs/common';
import { StandsController } from './stands.controller.js';
import { StandsService } from './stands.service.js';

/** Test stands of the lab: layout, bookings and install / uninstall requests to technicians. */
@Module({
  controllers: [StandsController],
  providers: [StandsService],
})
export class StandsModule {}
