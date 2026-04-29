import {Router} from 'express';
import controller from './user.controller';
import {authenticate} from '../../middleware/authenticate';
import {validate} from '../../middleware/validate';
import {updateProfileSchema,addSocialaccountSchema,addApikeys} from './user.schema'
const user =Router()
user.get('/profile',authenticate,controller.getProfile);
user.put('/profile',authenticate,validate(updateProfileSchema),controller.updateProfile);
user.post('/social-accounts',authenticate,validate(addSocialaccountSchema),controller.addSocialaccount);
user.get('/social-account',authenticate,controller.getAllsocialaccount)
user.delete('/social-account/:id', authenticate, controller.disconnectsocialaccount)
user.put('/ai-keys',authenticate,validate(addApikeys),controller.addAIapikeys);
export default user;