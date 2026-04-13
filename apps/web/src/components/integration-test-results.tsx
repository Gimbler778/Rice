import { useIntegrationTest } from '@/hooks/use-integrations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

export function IntegrationTestResults() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useIntegrationTest();

  const handleTestNow = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.integrations.test() });
    refetch();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integration Tests</CardTitle>
          <CardDescription>Testing OAuth providers...</CardDescription>
        </CardHeader>
        <CardContent className='flex items-center justify-center py-8'>
          <Spinner className='h-6 w-6' />
          <span className='ml-3'>Running integration tests...</span>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integration Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='border border-red-300 bg-red-50 rounded-lg p-4'>
            <div className='flex items-start gap-3'>
              <AlertCircle className='h-5 w-5 text-red-600 mt-0.5' />
              <div>
                <h3 className='font-semibold text-red-900'>Failed to run tests</h3>
                <p className='text-sm text-red-700 mt-1'>
                  {error instanceof Error ? error.message : 'An unexpected error occurred'}
                </p>
              </div>
            </div>
          </div>
          <Button onClick={handleTestNow} className='mt-4' variant='outline'>
            <RefreshCw className='h-4 w-4 mr-2' />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integration Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground'>No test results available</p>
          <Button onClick={handleTestNow} className='mt-4'>
            Run Tests
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { testResults, allTestsPassed, testedAt } = data;

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>Integration Health Check</CardTitle>
              <CardDescription>
                OAuth provider data accessibility test · Last checked:{' '}
                {new Date(testedAt).toLocaleTimeString()}
              </CardDescription>
            </div>
            <Button onClick={handleTestNow} variant='outline' size='sm'>
              <RefreshCw className='h-4 w-4 mr-2' />
              Run Tests
            </Button>
          </div>
        </CardHeader>
      </Card>

      {allTestsPassed ? (
        <div className='border border-green-300 bg-green-50 rounded-lg p-4'>
          <div className='flex items-start gap-3'>
            <CheckCircle2 className='h-5 w-5 text-green-600 mt-0.5' />
            <div>
              <h3 className='font-semibold text-green-900'>All tests passed</h3>
              <p className='text-sm text-green-800 mt-1'>
                Your OAuth integrations are working correctly and can access data from all connected providers.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className='border border-red-300 bg-red-50 rounded-lg p-4'>
          <div className='flex items-start gap-3'>
            <AlertCircle className='h-5 w-5 text-red-600 mt-0.5' />
            <div>
              <h3 className='font-semibold text-red-900'>Some tests failed</h3>
              <p className='text-sm text-red-800 mt-1'>
                Check the details below to troubleshoot integration issues.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className='grid gap-4'>
        {testResults.map((provider: any) => (
          <Card key={provider.providerName}>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <CardTitle className='text-lg'>{provider.providerName}</CardTitle>
                  <Badge variant={provider.isConnected ? 'default' : 'secondary'}>
                    {provider.isConnected ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>
              </div>
              {provider.expiresAt && (
                <CardDescription>
                  Token expires: {new Date(provider.expiresAt).toLocaleString()}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                {provider.tests.map((test: any, idx: number) => (
                  <div key={idx} className='flex items-start gap-3 p-2 rounded border'>
                    <div className='mt-1'>
                      {test.passed ? (
                        <CheckCircle2 className='h-4 w-4 text-green-600 shrink-0' />
                      ) : (
                        <XCircle className='h-4 w-4 text-red-600 shrink-0' />
                      )}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className={test.passed ? 'font-medium text-green-900' : 'font-medium text-red-900'}>
                        {test.name}
                      </p>
                      {test.error && (
                        <p className='text-sm text-red-700 mt-1 whitespace-pre-wrap'>{test.error}</p>
                      )}
                      {test.data && (
                        <pre className='text-xs bg-muted p-2 mt-2 rounded overflow-auto'>
                          {((data) => JSON.stringify(data, null, 2))(test.data)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='border border-blue-300 bg-blue-50 rounded-lg p-4'>
        <div className='flex items-start gap-3'>
          <AlertCircle className='h-5 w-5 text-blue-600 mt-0.5' />
          <div>
            <h3 className='font-semibold text-blue-900'>What this test does</h3>
            <ul className='text-sm text-blue-800 list-disc list-inside mt-2 space-y-1'>
              <li>Verifies OAuth token validity and expiration</li>
              <li><strong>Atlassian:</strong> Fetches accessible resources and Jira issues</li>
              <li><strong>Bitbucket:</strong> Fetches user profile, repositories, commits, and pull requests</li>
              <li>Automatically attempts token refresh if expired</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
