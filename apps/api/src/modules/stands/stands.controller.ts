import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  acceptStandRequestSchema,
  completeStandRequestSchema,
  createStandBookingSchema,
  createStandRequestSchema,
  createStandSchema,
  createStandZoneSchema,
  listStandBookingsQuerySchema,
  listStandEventsQuerySchema,
  technicianWorkQuerySchema,
  type ListStandEventsQuery,
  type StandEventDTO,
  type TechnicianWorkDTO,
  type TechnicianWorkQuery,
  listStandRequestsQuerySchema,
  rejectStandRequestSchema,
  standBoardQuerySchema,
  standImportFieldsSchema,
  updateStandBookingSchema,
  updateStandSchema,
  updateStandZoneSchema,
  type AcceptStandRequestInput,
  type CompleteStandRequestInput,
  type CreateStandBookingInput,
  type CreateStandInput,
  type CreateStandRequestInput,
  type CreateStandZoneInput,
  type ListStandBookingsQuery,
  type ListStandRequestsQuery,
  type RejectStandRequestInput,
  type StandBoardDTO,
  type StandBoardQuery,
  type StandBookingDTO,
  type StandDTO,
  type StandImportFields,
  type StandImportResultDTO,
  type StandRequestDTO,
  type StandZoneDTO,
  type UpdateStandBookingInput,
  type UpdateStandInput,
  type UpdateStandZoneInput,
  type UserRef,
} from '@tmt/shared';
import type { Request } from 'express';
import { ApiErrorCodes, TechnicianAllowed } from '../../common/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { badRequest } from '../../common/errors/app.exception.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser } from '../../common/types/auth.js';
import { FileUpload } from '../storage/upload.decorator.js';
import type { MultipartFile } from '../storage/upload.service.js';
import { extensionOf } from '../storage/mime.js';
import { readStandWorkbook } from './stand-sheet.js';
import { StandsService } from './stands.service.js';

const UPLOAD_ERRORS = ['MULTIPART_REQUIRED', 'FILE_REQUIRED', 'FILE_TOO_LARGE'] as const;

/**
 * Test stands of the lab (shared by every project): which AC model is on which stand in which
 * zone, bookings, and install / uninstall requests to technicians. Technician accounts use only
 * these routes.
 */
@ApiTags('Test stands')
@Controller('stands')
@TechnicianAllowed()
export class StandsController {
  constructor(private readonly stands: StandsService) {}

  /** All zones and stands with the model installed, today's and the next booking. */
  @Get()
  board(
    @CurrentUser() me: AuthUser,
    @Query({ schema: standBoardQuerySchema }) q: StandBoardQuery,
  ): Promise<StandBoardDTO> {
    return this.stands.board(me, q);
  }

  @Get('technicians')
  technicians(): Promise<UserRef[]> {
    return this.stands.technicians();
  }

  // ------------------------------------------------------------ history

  /** Installs, uninstalls and replacements on the stands, newest first. */
  @Get('events')
  listEvents(
    @Query({ schema: listStandEventsQuerySchema }) q: ListStandEventsQuery,
  ): Promise<StandEventDTO[]> {
    return this.stands.listEvents(q);
  }

  /** What a technician did in a year, for the year-end report. */
  @Get('work')
  @ApiErrorCodes('USER_NOT_FOUND')
  technicianWork(
    @Query({ schema: technicianWorkQuerySchema }) q: TechnicianWorkQuery,
  ): Promise<TechnicianWorkDTO> {
    return this.stands.technicianWork(q);
  }

  // ------------------------------------------------------------ zones

  @Post('zones')
  @ApiErrorCodes('STAND_ZONE_NAME_TAKEN')
  createZone(
    @CurrentUser() me: AuthUser,
    @Body({ schema: createStandZoneSchema }) body: CreateStandZoneInput,
  ): Promise<StandZoneDTO> {
    return this.stands.createZone(me, body);
  }

  @Patch('zones/:zoneId')
  @ApiErrorCodes('STAND_ZONE_NOT_FOUND', 'STAND_ZONE_NAME_TAKEN')
  updateZone(
    @CurrentUser() me: AuthUser,
    @Param('zoneId', ID) zoneId: number,
    @Body({ schema: updateStandZoneSchema }) body: UpdateStandZoneInput,
  ): Promise<StandZoneDTO> {
    return this.stands.updateZone(me, zoneId, body);
  }

  @Delete('zones/:zoneId')
  @HttpCode(204)
  @ApiErrorCodes('STAND_ZONE_NOT_FOUND', 'STAND_ZONE_NOT_EMPTY')
  removeZone(@CurrentUser() me: AuthUser, @Param('zoneId', ID) zoneId: number): Promise<void> {
    return this.stands.removeZone(me, zoneId);
  }

  // ------------------------------------------------------------ bookings

  @Get('bookings')
  listBookings(
    @Query({ schema: listStandBookingsQuerySchema }) q: ListStandBookingsQuery,
  ): Promise<StandBookingDTO[]> {
    return this.stands.listBookings(q);
  }

  @Post('bookings')
  @ApiErrorCodes(
    'STAND_NOT_FOUND',
    'PROJECT_NOT_FOUND',
    'STAND_BOOKED',
    'BAD_TESTER',
    'TECHNICIAN_NOT_ALLOWED',
  )
  createBooking(
    @CurrentUser() me: AuthUser,
    @Body({ schema: createStandBookingSchema }) body: CreateStandBookingInput,
  ): Promise<StandBookingDTO> {
    return this.stands.createBooking(me, body);
  }

  @Patch('bookings/:bookingId')
  @ApiErrorCodes('STAND_BOOKING_NOT_FOUND', 'STAND_BOOKED', 'BAD_TESTER')
  updateBooking(
    @CurrentUser() me: AuthUser,
    @Param('bookingId', ID) bookingId: number,
    @Body({ schema: updateStandBookingSchema }) body: UpdateStandBookingInput,
  ): Promise<StandBookingDTO> {
    return this.stands.updateBooking(me, bookingId, body);
  }

  @Delete('bookings/:bookingId')
  @HttpCode(204)
  @ApiErrorCodes('STAND_BOOKING_NOT_FOUND')
  removeBooking(
    @CurrentUser() me: AuthUser,
    @Param('bookingId', ID) bookingId: number,
  ): Promise<void> {
    return this.stands.removeBooking(me, bookingId);
  }

  // ------------------------------------------------------------ requests

  @Get('requests')
  listRequests(
    @CurrentUser() me: AuthUser,
    @Query({ schema: listStandRequestsQuerySchema }) q: ListStandRequestsQuery,
  ): Promise<StandRequestDTO[]> {
    return this.stands.listRequests(me, q);
  }

  @Post('requests')
  @ApiErrorCodes(
    'STAND_NOT_FOUND',
    'NOT_A_TECHNICIAN',
    'PROJECT_NOT_FOUND',
    'TECHNICIAN_NOT_ALLOWED',
  )
  createRequest(
    @CurrentUser() me: AuthUser,
    @Body({ schema: createStandRequestSchema }) body: CreateStandRequestInput,
  ): Promise<StandRequestDTO> {
    return this.stands.createRequest(me, body);
  }

  @Get('requests/:requestId')
  @ApiErrorCodes('STAND_REQUEST_NOT_FOUND')
  getRequest(@Param('requestId', ID) requestId: number): Promise<StandRequestDTO> {
    return this.stands.getRequest(requestId);
  }

  @Post('requests/:requestId/accept')
  @HttpCode(200)
  @ApiErrorCodes('STAND_REQUEST_NOT_FOUND', 'STAND_REQUEST_CLOSED')
  accept(
    @CurrentUser() me: AuthUser,
    @Param('requestId', ID) requestId: number,
    @Body({ schema: acceptStandRequestSchema }) body: AcceptStandRequestInput,
  ): Promise<StandRequestDTO> {
    return this.stands.accept(me, requestId, body);
  }

  @Post('requests/:requestId/reject')
  @HttpCode(200)
  @ApiErrorCodes('STAND_REQUEST_NOT_FOUND', 'STAND_REQUEST_CLOSED')
  reject(
    @CurrentUser() me: AuthUser,
    @Param('requestId', ID) requestId: number,
    @Body({ schema: rejectStandRequestSchema }) body: RejectStandRequestInput,
  ): Promise<StandRequestDTO> {
    return this.stands.reject(me, requestId, body);
  }

  @Post('requests/:requestId/done')
  @HttpCode(200)
  @ApiErrorCodes('STAND_REQUEST_NOT_FOUND', 'STAND_REQUEST_CLOSED')
  complete(
    @CurrentUser() me: AuthUser,
    @Param('requestId', ID) requestId: number,
    @Body({ schema: completeStandRequestSchema }) body: CompleteStandRequestInput,
  ): Promise<StandRequestDTO> {
    return this.stands.complete(me, requestId, body);
  }

  @Post('requests/:requestId/cancel')
  @HttpCode(200)
  @ApiErrorCodes('STAND_REQUEST_NOT_FOUND', 'STAND_REQUEST_CLOSED')
  cancel(
    @CurrentUser() me: AuthUser,
    @Param('requestId', ID) requestId: number,
  ): Promise<StandRequestDTO> {
    return this.stands.cancel(me, requestId);
  }

  // ------------------------------------------------------------ import

  /** Reads the lab's stand sheet (.xlsx). `dryRun=true` (default) only shows what would change. */
  @Post('import')
  @HttpCode(200)
  @FileUpload({ dryRun: { type: 'string', description: 'true (default) = preview only' } })
  @ApiErrorCodes(...UPLOAD_ERRORS, 'UNSUPPORTED_FILE_TYPE', 'INVALID_WORKBOOK')
  async importSheet(
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @UploadedFile() file: MultipartFile | undefined,
    @Body({ schema: standImportFieldsSchema }) fields: StandImportFields,
  ): Promise<StandImportResultDTO> {
    if (!req.is('multipart/form-data')) {
      throw badRequest('MULTIPART_REQUIRED', 'Send the file as multipart/form-data');
    }
    if (!file) throw badRequest('FILE_REQUIRED', 'Choose a file to upload');
    if (extensionOf(file.originalname) !== 'xlsx') {
      throw badRequest('UNSUPPORTED_FILE_TYPE', 'Choose an Excel file (.xlsx)');
    }
    let sheet;
    try {
      sheet = await readStandWorkbook(file.buffer);
    } catch {
      throw badRequest('INVALID_WORKBOOK', 'The file could not be read as an Excel workbook');
    }
    return this.stands.importSheet(me, sheet, !fields.dryRun);
  }

  // ------------------------------------------------------------ stands

  @Post()
  @ApiErrorCodes('STAND_ZONE_NOT_FOUND', 'STAND_CODE_TAKEN')
  createStand(
    @CurrentUser() me: AuthUser,
    @Body({ schema: createStandSchema }) body: CreateStandInput,
  ): Promise<StandDTO> {
    return this.stands.createStand(me, body);
  }

  @Get(':standId')
  @ApiErrorCodes('STAND_NOT_FOUND')
  get(@CurrentUser() me: AuthUser, @Param('standId', ID) standId: number): Promise<StandDTO> {
    return this.stands.get(me, standId);
  }

  @Patch(':standId')
  @ApiErrorCodes('STAND_NOT_FOUND', 'STAND_ZONE_NOT_FOUND', 'STAND_CODE_TAKEN')
  updateStand(
    @CurrentUser() me: AuthUser,
    @Param('standId', ID) standId: number,
    @Body({ schema: updateStandSchema }) body: UpdateStandInput,
  ): Promise<StandDTO> {
    return this.stands.updateStand(me, standId, body);
  }

  @Delete(':standId')
  @HttpCode(204)
  @ApiErrorCodes('STAND_NOT_FOUND')
  removeStand(@CurrentUser() me: AuthUser, @Param('standId', ID) standId: number): Promise<void> {
    return this.stands.removeStand(me, standId);
  }
}
