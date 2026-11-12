import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createDeviceSchema,
  listDevicesQuerySchema,
  updateDeviceSchema,
  type CreateDeviceInput,
  type DeviceDTO,
  type ListDevicesQuery,
  type UpdateDeviceInput,
} from '@tmt/shared';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { DevicesService } from './devices.service.js';

/** Test devices (units, phones, routers) and who holds them. */
@ApiTags('Devices')
@Controller('projects/:projectId/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @ProjectPermission('read')
  list(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Query({ schema: listDevicesQuerySchema }) q: ListDevicesQuery,
  ): Promise<DeviceDTO[]> {
    return this.devices.list(ctx, me, q);
  }

  @Post()
  @ProjectPermission('writeDevices')
  @ApiErrorCodes('DEVICE_NAME_TAKEN')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: createDeviceSchema }) body: CreateDeviceInput,
  ): Promise<DeviceDTO> {
    return this.devices.create(ctx, me, body);
  }

  @Patch(':deviceId')
  @ProjectPermission('writeDevices')
  @ApiErrorCodes('DEVICE_NOT_FOUND', 'DEVICE_NAME_TAKEN', 'DEVICE_IN_USE')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('deviceId', ID) deviceId: number,
    @Body({ schema: updateDeviceSchema }) body: UpdateDeviceInput,
  ): Promise<DeviceDTO> {
    return this.devices.update(ctx, me, deviceId, body);
  }

  @Delete(':deviceId')
  @HttpCode(204)
  @ProjectPermission('deleteDevices')
  @ApiErrorCodes('DEVICE_NOT_FOUND')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('deviceId', ID) deviceId: number,
  ): Promise<void> {
    return this.devices.remove(ctx, me, deviceId);
  }

  /** The caller takes the device. */
  @Post(':deviceId/check-out')
  @HttpCode(200)
  @ProjectPermission('writeDevices')
  @ApiErrorCodes('DEVICE_NOT_FOUND', 'DEVICE_NOT_AVAILABLE')
  checkOut(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('deviceId', ID) deviceId: number,
  ): Promise<DeviceDTO> {
    return this.devices.checkOut(ctx, me, deviceId);
  }

  /** The holder (or a lead) gives the device back. */
  @Post(':deviceId/return')
  @HttpCode(200)
  @ProjectPermission('writeDevices')
  @ApiErrorCodes('DEVICE_NOT_FOUND', 'DEVICE_NOT_IN_USE', 'NOT_DEVICE_HOLDER')
  giveBack(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('deviceId', ID) deviceId: number,
  ): Promise<DeviceDTO> {
    return this.devices.giveBack(ctx, me, deviceId);
  }
}
