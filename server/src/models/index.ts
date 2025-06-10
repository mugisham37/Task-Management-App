import User from './user.model';
import Task from './task.model';
import Project from './project.model';
import Team from './team.model';
import Workspace from './workspace.model';
import Comment from './comment.model';
import Notification from './notification.model';
import Activity from './activity.model';
import Invitation from './invitation.model';
import RecurringTask from './recurring-task.model';
import TaskTemplate from './task-template.model';
import CalendarEvent from './calendar-event.model';
import CalendarIntegration from './calendar-integration.model';
import Feedback from './feedback.model';

// Export all models
export {
  User,
  Task,
  Project,
  Team,
  Workspace,
  Comment,
  Notification,
  Activity,
  Invitation,
  RecurringTask,
  TaskTemplate,
  CalendarEvent,
  CalendarIntegration,
  Feedback,
};

// Export interfaces and types
export type { IUser, IUserDocument } from './user.model';
export type { ITask } from './task.model';
export type { IProject } from './project.model';
export type { ITeam, ITeamMember } from './team.model';
export type { IWorkspace } from './workspace.model';
export type { IComment } from './comment.model';
export type { INotification } from './notification.model';
export type { IActivity } from './activity.model';
export type { IInvitation, IInvitationDocument } from './invitation.model';
export type {
  IRecurringTask,
  ITaskTemplate as IRecurringTaskTemplate,
} from './recurring-task.model';
export type { ITaskTemplate, ITaskData } from './task-template.model';
export type { ICalendarEvent, IAttendee, IReminder } from './calendar-event.model';
export type {
  ICalendarIntegration,
  ICalendarIntegrationSettings,
} from './calendar-integration.model';
export type { IFeedback, IFeedbackDocument } from './feedback.model';

// Export enums
export { TaskStatus, TaskPriority } from './task.model';
export { TeamRole } from './team.model';
export { NotificationType } from './notification.model';
export { ActivityType } from './activity.model';
export { InvitationStatus, InvitationType } from './invitation.model';
export { RecurrenceFrequency, RecurrenceEndType } from './recurring-task.model';
export { EventType, AttendeeStatus } from './calendar-event.model';
export { CalendarProvider, SyncDirection } from './calendar-integration.model';
export { FeedbackType, FeedbackStatus, FeedbackPriority } from './feedback.model';

// Default export
export default {
  User,
  Task,
  Project,
  Team,
  Workspace,
  Comment,
  Notification,
  Activity,
  Invitation,
  RecurringTask,
  TaskTemplate,
  CalendarEvent,
  CalendarIntegration,
  Feedback,
};
