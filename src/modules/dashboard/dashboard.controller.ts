import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendPaginated } from '../../utils/api-response';
import { ApiError } from '../../utils/api-error';
import * as dashboardService from './dashboard.service';
async function stats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const result = await dashboardService.getDashboardStats(req.user.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
async function history(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10) || 10));
    const result = await dashboardService.getPostHistory(req.user.id, { page, limit, status: req.query.status as string | undefined, platform: req.query.platform as string | undefined, date_from: req.query.date_from as string | undefined, date_to: req.query.date_to as string | undefined, });
    sendPaginated(res, result.data, result.meta);
  } catch (err) {
    next(err);
  }
}

export default { stats, history };