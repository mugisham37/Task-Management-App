import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { User } from '../models/user.model';

declare global {
  namespace Express {
    interface Request extends ExpressRequest {
      user?: User;
      id?: string;
      startTime?: number;
      language?: string;
    }

    interface Response extends ExpressResponse {
      locals: {
        user?: User;
        [key: string]: any;
      };
    }
  }
}
