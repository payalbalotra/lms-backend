// Shared error type for service-layer throws. Controllers catch and translate to HTTP.
//
// Usage in a service:
//   throw new ServiceError(404, 'STATION_NOT_FOUND', 'Station not found');
//
// Usage in a controller:
//   try { ... } catch (err) {
//     if (err instanceof ServiceError) {
//       res.status(err.status).json({ error: { code: err.code, message: err.message } });
//       return;
//     }
//     throw err;
//   }

export class ServiceError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
  }
}