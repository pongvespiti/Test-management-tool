/** Example commands for API tokens (origin = this server, as the browser sees it). */
export function apiOrigin(): string {
  return window.location.origin;
}

export function whoAmICommand(token = '<token>'): string {
  return `curl -H "Authorization: Bearer ${token}" ${apiOrigin()}/api/v1/auth/me`;
}

export function junitUploadCommand(): string {
  return [
    `curl -H "Authorization: Bearer $TMT_TOKEN" \\`,
    `  -F "file=@results.xml" \\`,
    `  "${apiOrigin()}/api/v1/projects/<projectId>/runs/<runId>/junit?matchBy=auto"`,
  ].join('\n');
}
