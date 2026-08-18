export interface EnvironmentVariableItem {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

export interface FetchEnvironmentVariablesOptions {
  shareToken?: string;
}

export async function fetchEnvironmentVariablesList(
  environmentId: string,
  options: FetchEnvironmentVariablesOptions = {}
): Promise<EnvironmentVariableItem[]> {
  const { shareToken } = options;

  if (shareToken) {
    return await $fetch<EnvironmentVariableItem[]>(
      `/api/shared-workspace/${shareToken}/environments/${environmentId}/variables`,
      { credentials: 'include' }
    );
  }

  return await $fetch<EnvironmentVariableItem[]>(
    `/api/admin/environments/${environmentId}/variables`,
    { credentials: 'include' }
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
