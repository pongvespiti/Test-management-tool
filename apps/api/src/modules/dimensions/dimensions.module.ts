import { Module } from '@nestjs/common';
import { DimensionsController } from './dimensions.controller.js';
import { DimensionsService } from './dimensions.service.js';

/** Lists of values for the run environment labels (Platform → OS version, Unit model …). */
@Module({
  controllers: [DimensionsController],
  providers: [DimensionsService],
  exports: [DimensionsService],
})
export class DimensionsModule {}
