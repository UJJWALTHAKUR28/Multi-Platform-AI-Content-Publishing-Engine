import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import controller from './dashboard.controller';

const dashboardRoutes = Router();
dashboardRoutes.get('/stats', authenticate, controller.stats);
dashboardRoutes.get('/posts', authenticate, controller.history);

export default dashboardRoutes;