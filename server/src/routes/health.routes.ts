import { Router, Request, Response } from 'express';
import asyncHandler from '../utils/async-handler';
import { version } from '../../package.json';

const router = Router();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the API is up and running
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-01-01T00:00:00.000Z
 *                 uptime:
 *                   type: number
 *                   example: 3600
 *                 environment:
 *                   type: string
 *                   example: development
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 database:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: connected
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    // Check database connection
    const dbStatus = req.app.locals.dbStatus || 'unknown';

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version,
      database: {
        status: dbStatus,
      },
    });
  }),
);

export default router;
