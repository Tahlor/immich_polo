export interface HealthResponse {
  ok: boolean;
  service: string;
}

export const POLO_API_URL = (process.env.EXPO_PUBLIC_POLO_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${POLO_API_URL}/health`, { signal });
  if (!response.ok) {
    throw new Error(`Polo API returned ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
