/** Response body of `GET /api/health`. */
export interface HealthResponse {
  status: 'ok';
  /** Server time as an ISO 8601 string, read from the API's injected clock. */
  time: string;
}
