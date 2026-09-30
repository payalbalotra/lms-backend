export default class ApiResponse {
  static success<T>(message: string, data: T = null as T) {
    return { success: true as const, message, data };
  }

  static error(message: string, statusCode: number = 500) {
    return { success: false, message, statusCode };
  }
}
