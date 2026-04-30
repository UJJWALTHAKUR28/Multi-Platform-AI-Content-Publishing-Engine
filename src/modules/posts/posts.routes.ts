import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { publishPostSchema, schedulePostSchema, listPostsQuerySchema } from './posts.schema';
import controller from './posts.controller';
const postRoutes = Router();
postRoutes.post('/publish', authenticate, validate(publishPostSchema), controller.publish);
postRoutes.post('/schedule', authenticate, validate(schedulePostSchema), controller.schedule);
postRoutes.get('/', authenticate, validate(listPostsQuerySchema, 'query'), controller.listPosts);
postRoutes.get('/:id', authenticate, controller.getPost);
postRoutes.post('/:id/retry', authenticate, controller.retryPost);
postRoutes.delete('/:id', authenticate, controller.cancelPost);

export default postRoutes;