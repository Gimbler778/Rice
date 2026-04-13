# OAuth Integration Testing Guide

This guide explains how to verify that data is accessible from Bitbucket and Atlassian OAuth providers.

## Overview

Your application has two main integration endpoints plus a comprehensive test endpoint:

1. **Status Endpoint** (`/api/integrations/status`) - Checks connection status
2. **Timesheet Endpoint** (`/api/integrations/timesheet`) - Fetches actual data from OAuth providers
3. **Test Endpoint** (`/api/integrations/test`) - Comprehensive health check with detailed diagnostics

## What Data is Fetched

### Atlassian (Jira)
- ✅ Issues assigned to or created by the user
- ✅ Issue summary, time spent, and last updated timestamp
- ✅ Direct links to issues for navigation

### Bitbucket
- ✅ Repositories where user is a member
- ✅ Recent commits from each repository
- ✅ **NEW:** Pull requests (open and merged) from each repository
- ✅ User profile information
- ✅ Direct links to commits and PRs

## Testing Your Integration

### 1. Via Web UI (Recommended)

Add the integration test component to your dashboard:

```tsx
import { IntegrationTestResults } from "@/components/integration-test-results";

export function Dashboard() {
  return (
    <div>
      {/* ... other content ... */}
      <IntegrationTestResults />
    </div>
  );
}
```

The UI will:
- Show connection status for each provider
- Display test results with pass/fail indicators
- Show sample data fetched from each provider
- Display token expiration dates
- Auto-refresh token status
- Include error messages if tests fail

### 2. Via API

#### Check Connection Status
```bash
curl -X GET http://localhost:5000/api/integrations/status \
  -H "Cookie: auth.session_token=<your-token>"
```

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Integration status fetched successfully",
  "data": {
    "connectedProviders": ["atlassian", "bitbucket"],
    "atlassianConnected": true,
    "bitbucketConnected": true
  }
}
```

#### Run Comprehensive Test
```bash
curl -X GET http://localhost:5000/api/integrations/test \
  -H "Cookie: auth.session_token=<your-token>"
```

**Response includes:**
- Token validity and expiration
- Jira issues count and samples
- Bitbucket profile, repos, commits, and PRs
- Detailed pass/fail status for each test

#### Fetch Timesheet Data
```bash
curl -X GET http://localhost:5000/api/integrations/timesheet \
  -H "Cookie: auth.session_token=<your-token>"
```

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Timesheet entries fetched successfully",
  "data": {
    "connectedProviders": ["atlassian", "bitbucket"],
    "atlassianConnected": true,
    "bitbucketConnected": true,
    "entries": [
      {
        "id": "jira-PROJ-123",
        "source": "Jira",
        "description": "PROJ-123 - Fix login bug",
        "ref": "PROJ-123",
        "link": "https://your-instance.atlassian.net/browse/PROJ-123",
        "occurredAt": "2024-04-13T10:30:00Z",
        "timeSeconds": 3600,
        "time": "1h",
        "category": "Development"
      },
      {
        "id": "bitbucket-abc1234",
        "source": "Bitbucket",
        "description": "your-org/your-repo - abc1234 - Update dependencies",
        "ref": "abc1234",
        "link": "https://bitbucket.org/your-org/your-repo/commits/abc1234",
        "occurredAt": "2024-04-13T09:15:00Z",
        "timeSeconds": 1800,
        "time": "30m",
        "category": "Development"
      },
      {
        "id": "bitbucket-pr-42",
        "source": "Bitbucket",
        "description": "your-org/your-repo - PR #42 - Add dark mode (MERGED)",
        "ref": "#42",
        "link": "https://bitbucket.org/your-org/your-repo/pull-requests/42",
        "occurredAt": "2024-04-12T14:20:00Z",
        "timeSeconds": 3600,
        "time": "1h",
        "category": "Development"
      }
    ],
    "fetchedAt": "2024-04-13T11:00:00Z",
    "partialFailures": []
  }
}
```

## Troubleshooting

### "401 Unauthorized" on Bitbucket API calls

**Cause:** Expired or invalid access token

**Solution:**
- The system automatically attempts to refresh tokens using the `refresh_token` when:
  - The current token is expired
  - A 401 error is received
- Ensure your OAuth configuration includes `offline_access` scope (already configured)
- Check that the refresh token is still valid in the database

### "No Jira resource found in accessible resources"

**Cause:** User doesn't have Jira access or scopes are insufficient

**Solution:**
- Verify Jira scopes in auth.ts:
  - `read:jira-work`
  - `read:jira-user`
- User must have at least one Jira instance accessible in their Atlassian account

### "Unable to fetch Bitbucket repositories"

**Cause:** Token refresh failed or API rate limiting

**Solution:**
- Check Bitbucket API rate limits: https://developer.atlassian.com/cloud/bitbucket/rest/intro/#rate-limiting
- Verify Bitbucket OAuth credentials in environment variables
- Ensure `BITBUCKET_CLIENT_ID` and `BITBUCKET_CLIENT_SECRET` are correct

### Partial Failures

If the `partialFailures` array is non-empty:
- Some providers failed to fetch data
- Check error details in test endpoint output
- Other providers will still return data
- No user action needed, but investigate for better reliability

## OAuth Configuration Reference

### Scopes Required

**Atlassian:**
```
read:me
read:account
read:jira-work
read:jira-user
offline_access
repository
pullrequest
account
```

**Bitbucket:**
```
account
email
repository
pullrequest
offline_access
```

### Environment Variables

```env
ATLASSIAN_CLIENT_ID=<your-client-id>
ATLASSIAN_CLIENT_SECRET=<your-client-secret>

BITBUCKET_CLIENT_ID=<your-client-id>
BITBUCKET_CLIENT_SECRET=<your-client-secret>
BITBUCKET_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback/bitbucket
```

## API Endpoints Summary

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/integrations/status` | GET | Check provider connection status | Provider list and connection flags |
| `/api/integrations/timesheet` | GET | Fetch Jira issues and Bitbucket activities | Dashboard entries with metadata |
| `/api/integrations/test` | GET | Run comprehensive integration health test | Detailed test results for each provider |

## Response Handling in Frontend

The API response wrapper format:

```typescript
interface ApiSuccessResponse<T> {
  success: true;
  code: number;
  message: string;
  data: T;
}
```

Always unwrap the `data` field before using the typed payload:

```typescript
const response = await fetchIntegrationStatus();
// response is already unwrapped by the api client
// Use: response.data.connectedProviders
// NOT: response.data.data.connectedProviders
```

## Testing Checklist

- [ ] User can sign in with Atlassian OAuth
- [ ] User can sign in or link Bitbucket OAuth
- [ ] `/api/integrations/status` returns both providers connected
- [ ] `/api/integrations/test` shows all tests passing
- [ ] Jira issues are fetched and displayed
- [ ] Bitbucket commits are fetched and displayed
- [ ] Bitbucket pull requests are fetched and displayed
- [ ] Links to Jira, commits, and PRs are clickable and correct
- [ ] Token refresh works (test by waiting/forcing token expiration)
- [ ] Partial failures are gracefully handled

## Additional Resources

- [Atlassian OAuth Documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [Bitbucket OAuth Documentation](https://developer.atlassian.com/cloud/bitbucket/oauth-2/)
- [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Bitbucket REST API](https://developer.atlassian.com/cloud/bitbucket/rest/intro/)
