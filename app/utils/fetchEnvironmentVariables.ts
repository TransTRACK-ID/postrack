export interface EnvironmentVariableItem {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

export interface FetchEnvironmentVariablesOptions {
  shareToken?: string;
  /**
   * Saved request id — when set (non-shared path), the response merges the
   * request's collection variables under the environment variables so {{var}}
   * resolution matches Postman scope ordering.
   */
  requestId?: string;
}

export async function fetchEnvironmentVariablesList(
  environmentId: string,
  options: FetchEnvironmentVariablesOptions = {}
): Promise<EnvironmentVariableItem[]> {
  const { shareToken, requestId } = options;

  if (shareToken) {
    return await $fetch<EnvironmentVariableItem[]>(
      `/api/shared-workspace/${shareToken}/environments/${environmentId}/variables`,
      { credentials: 'include' }
    );
  }

  return await $fetch<EnvironmentVariableItem[]>(
    `/api/admin/environments/${environmentId}/variables`,
    {
      credentials: 'include',
      query: requestId ? { requestId } : undefined
    }
  );
}

export async function fetchEnvironmentVariableMap(
  environmentId: string,
  options: FetchEnvironmentVariablesOptions = {}
): Promise<Record<string, string>> {
  const variables = await fetchEnvironmentVariablesList(environmentId, options);
  return variables.reduce((acc, variable) => {
    acc[variable.key] = variable.value;
    return acc;
  }, {} as Record<string, string>);
}
