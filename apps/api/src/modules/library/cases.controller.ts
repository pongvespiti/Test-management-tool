import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  bulkCasesSchema,
  createCaseSchema,
  listCasesQuerySchema,
  searchCasesQuerySchema,
  updateCaseSchema,
  type BulkCasesInput,
  type CaseRunHistoryItem,
  type CaseSearchResultDTO,
  type CaseVersionDTO,
  type CreateCaseInput,
  type ListCasesQuery,
  type Paged,
  type SearchCasesQuery,
  type TestCaseDTO,
  type UpdateCaseInput,
} from '@tmt/shared';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { CaseBulkService } from './case-bulk.service.js';
import { CasesService } from './cases.service.js';

/** Test cases: list, CRUD, clone, bulk actions, version and run history. */
@ApiTags('Library')
@Controller('projects/:projectId')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly bulkActions: CaseBulkService,
  ) {}

  @Get('suites/:suiteId/cases')
  @ProjectPermission('read')
  @ApiErrorCodes('SUITE_NOT_FOUND', 'SECTION_NOT_FOUND')
  list(
    @CurrentProject() ctx: ProjectContext,
    @Param('suiteId', ID) suiteId: number,
    @Query({ schema: listCasesQuerySchema }) q: ListCasesQuery,
  ): Promise<Paged<TestCaseDTO>> {
    return this.cases.list(ctx.id, suiteId, q);
  }

  @Post('suites/:suiteId/cases')
  @ProjectPermission('writeLibrary')
  @ApiErrorCodes(
    'SUITE_NOT_FOUND',
    'CASE_CODE_TAKEN',
    'BAD_SECTION',
    'BAD_SHARED_STEP',
    'USE_REVIEW_ENDPOINT',
    'UNKNOWN_FIELD',
    'INVALID_OPTION',
  )
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('suiteId', ID) suiteId: number,
    @Body({ schema: createCaseSchema }) body: CreateCaseInput,
  ): Promise<TestCaseDTO> {
    return this.cases.create(ctx, me, suiteId, body);
  }

  @Post('suites/:suiteId/cases/bulk')
  @HttpCode(200)
  @ProjectPermission('writeLibrary')
  @ApiErrorCodes(
    'SUITE_NOT_FOUND',
    'BAD_SECTION',
    'BAD_REVIEWER',
    'REVIEW_REQUIRED',
    'USE_REVIEW_ENDPOINT',
  )
  bulk(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('suiteId', ID) suiteId: number,
    @Body({ schema: bulkCasesSchema }) body: BulkCasesInput,
  ): Promise<{ affected: number }> {
    return this.bulkActions.run(ctx, me, suiteId, body);
  }

  // Declared before `cases/:caseId` so that "search" is not read as a case id.
  @Get('cases/search')
  @ProjectPermission('read')
  search(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: searchCasesQuerySchema }) q: SearchCasesQuery,
  ): Promise<CaseSearchResultDTO> {
    return this.cases.search(ctx.id, q);
  }

  @Get('cases/:caseId')
  @ProjectPermission('read')
  @ApiErrorCodes('CASE_NOT_FOUND')
  get(
    @CurrentProject() ctx: ProjectContext,
    @Param('caseId', ID) caseId: number,
  ): Promise<TestCaseDTO> {
    return this.cases.get(ctx.id, caseId);
  }

  @Patch('cases/:caseId')
  @ProjectPermission('writeLibrary')
  @ApiErrorCodes(
    'CASE_NOT_FOUND',
    'VERSION_CONFLICT',
    'CASE_CODE_TAKEN',
    'BAD_SECTION',
    'BAD_SHARED_STEP',
    'USE_REVIEW_ENDPOINT',
    'REVIEW_REQUIRED',
    'UNKNOWN_FIELD',
    'INVALID_OPTION',
  )
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('caseId', ID) caseId: number,
    @Body({ schema: updateCaseSchema }) body: UpdateCaseInput,
  ): Promise<TestCaseDTO> {
    return this.cases.update(ctx, me, caseId, body);
  }

  @Delete('cases/:caseId')
  @HttpCode(204)
  @ProjectPermission('deleteLibrary')
  @ApiErrorCodes('CASE_NOT_FOUND')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('caseId', ID) caseId: number,
  ): Promise<void> {
    return this.cases.remove(ctx, me, caseId);
  }

  @Post('cases/:caseId/clone')
  @ProjectPermission('writeLibrary')
  @ApiErrorCodes('CASE_NOT_FOUND')
  clone(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('caseId', ID) caseId: number,
  ): Promise<TestCaseDTO> {
    return this.cases.clone(ctx, me, caseId);
  }

  @Get('cases/:caseId/versions')
  @ProjectPermission('read')
  @ApiErrorCodes('CASE_NOT_FOUND')
  versions(
    @CurrentProject() ctx: ProjectContext,
    @Param('caseId', ID) caseId: number,
  ): Promise<CaseVersionDTO[]> {
    return this.cases.versions(ctx.id, caseId);
  }

  @Get('cases/:caseId/runs')
  @ProjectPermission('read')
  @ApiErrorCodes('CASE_NOT_FOUND')
  runs(
    @CurrentProject() ctx: ProjectContext,
    @Param('caseId', ID) caseId: number,
  ): Promise<CaseRunHistoryItem[]> {
    return this.cases.runs(ctx.id, caseId);
  }
}
