/**
 * Services index file
 * Exports all service modules for easy importing
 */

// Core entity services
export * as taskService from './task.service';
export * as userService from './user.service';
export * as projectService from './project.service';
export * as teamService from './team.service';
export * as workspaceService from './workspace.service';
export * as commentService from './comment.service';

// Supporting services
export * as notificationService from './notification.service';
export * as activityService from './activity.service';
export * as invitationService from './invitation.service';

// Specialized services
export * as recurringTaskService from './recurring-task.service';
export * as taskTemplateService from './task-template.service';
export * as calendarService from './calendar.service';
export * as emailService from './email.service';
export * as websocketService from './websocket.service';
export * as analyticsService from './analytics.service';
export * as dashboardService from './dashboard.service';
export * as exportImportService from './export-import.service';
export * as feedbackService from './feedback.service';
export * as monitoringService from './monitoring.service';
