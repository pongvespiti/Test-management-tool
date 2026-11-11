import { Module } from '@nestjs/common';
import { HttpClient } from './http-client.js';
import { IntegrationsController } from './integrations.controller.js';
import { JiraClientFactory } from './jira-client.js';
import { JiraIssuesController } from './jira-issues.controller.js';
import { JiraIssuesService } from './jira-issues.service.js';
import { JiraSettingsService } from './jira-settings.service.js';
import { SecretBox } from './secret-box.js';

/**
 * Integrations (ADR-008): per-project Jira settings with a sealed token, connection test and
 * defect ↔ Jira issue actions. Outbound HTTP and secret sealing are injectable providers.
 */
@Module({
  controllers: [IntegrationsController, JiraIssuesController],
  providers: [SecretBox, HttpClient, JiraClientFactory, JiraSettingsService, JiraIssuesService],
  exports: [SecretBox, JiraSettingsService],
})
export class IntegrationsModule {}
