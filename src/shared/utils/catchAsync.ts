import { type Request, type Response, type NextFunction } from 'express';

/**
 * A utility function to wrap async controllers to handle errors automatically.
 * @param fn - The async controller function to wrap.
 */
const catchAsync = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

export default catchAsync;
