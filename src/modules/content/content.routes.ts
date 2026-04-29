import { Router }         from 'express'; // FIX: was `import Router from "express"` — Router is a named export
import { authenticate }   from '../../middleware/authenticate';
import { validate }       from '../../middleware/validate';
import { ContentSchema }  from './content.schema';
import controller         from './content.controller';

const contentroutes = Router();

contentroutes.post(
  '/generate',
  authenticate,
  validate(ContentSchema),
  controller.generateContent
);

export default contentroutes;