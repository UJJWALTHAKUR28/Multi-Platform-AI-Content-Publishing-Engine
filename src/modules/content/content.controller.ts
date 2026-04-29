import { Request, Response, NextFunction } from 'express';
import { generate } from './content.service';
import { sendSuccess as sendSuccess }from '../../utils/api-response';
import { ApiError } from "../../utils/api-error";
export const generateContent = async (req: Request,res: Response,next: NextFunction): Promise<void> => {
  try {
     if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    const result = await generate(req.user.id, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export default { generateContent };