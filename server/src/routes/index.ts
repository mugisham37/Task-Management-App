import { Router } from 'express';
import healthRoutes from './health.routes';
// Import other routes as they are created
// import authRoutes from './auth.routes';
// import userRoutes from './user.routes';
// import taskRoutes from './task.routes';
// import projectRoutes from './project.routes';
// etc.

const router = Router();

// Health routes
router.use('/health', healthRoutes);

// Other routes
// router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
// router.use('/tasks', taskRoutes);
// router.use('/projects', projectRoutes);
// etc.

export default router;
