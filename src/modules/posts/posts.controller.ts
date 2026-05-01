import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendPaginated } from '../../utils/api-response';
import { extractRequestMeta } from '../../utils/request-meta.util';
import { ApiError } from '../../utils/api-error';
import * as postService from './posts.service';
import type { PublishPostInput, SchedulePostInput, ListPostsQuery } from './posts.schema';
async function publish(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const meta   = extractRequestMeta(req);
    const result = await postService.publishPost(req.user.id, req.body as PublishPostInput, meta);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}
async function schedule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const meta   = extractRequestMeta(req);
    const result = await postService.schedulePost(req.user.id, req.body as SchedulePostInput, meta);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}
async function listPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const result = await postService.listPosts(req.user.id,req.query as unknown as ListPostsQuery,);
    sendPaginated(res, result.data, result.meta);
  } catch (err) {
    next(err);
  }
}
async function getPost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const post = await postService.getPostById(req.user.id, req.params.id as string);
    sendSuccess(res, post);
  } catch (err) {
    next(err);
  }
}
async function retryPost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const meta   = extractRequestMeta(req);
    const result = await postService.retryFailedPlatforms(
      req.user.id,req.params.id as string,meta,);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
async function cancelPost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const meta   = extractRequestMeta(req);
    const result = await postService.cancelScheduledPost(req.user.id,req.params.id as string,meta,);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
export default { publish, schedule, listPosts, getPost, retryPost, cancelPost };