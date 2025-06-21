import { Types } from 'mongoose';
import CalendarEvent, {
  type ICalendarEvent,
  type IAttendee,
  EventType,
} from '../models/calendar-event.model';
import CalendarIntegration, {
  type ICalendarIntegration,
  CalendarProvider,
  SyncDirection,
} from '../models/calendar-integration.model';
import Task from '../models/task.model';
import User from '../models/user.model';
import Project from '../models/project.model';
import Workspace from '../models/workspace.model';
import Team from '../models/team.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { APIFeatures } from '../utils/api-features';
import * as activityService from './activity.service';
import * as notificationService from './notification.service';
import { ActivityType } from '../models/activity.model';
import { NotificationType } from '../models/notification.model';
import logger from '../config/logger';
import * as cache from '../utils/cache';
import { startTimer } from '../utils/performance-monitor';
import { CalendarQueryParams } from '../types/activity.types';

/**
 * Create a new calendar event
 * @param userId User ID
 * @param eventData Calendar event data
 * @returns Newly created calendar event
 */
export const createCalendarEvent = async (
  userId: string,
  eventData: Partial<ICalendarEvent>,
): Promise<ICalendarEvent> => {
  const timer = startTimer('calendarService.createCalendarEvent');

  try {
    // Validate dates
    if (
      eventData.startDate &&
      eventData.endDate &&
      new Date(eventData.startDate) > new Date(eventData.endDate)
    ) {
      throw new ValidationError('End date must be after start date');
    }

    // Validate task if specified
    if (eventData.task) {
      const task = await Task.findById(eventData.task);
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // Check if task belongs to user
      if (task.user && task.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to create events for this task');
      }
    }

    // Validate project if specified
    if (eventData.project) {
      const project = await Project.findById(eventData.project);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check if project belongs to user
      if (project.user && project.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to create events for this project');
      }
    }

    // Validate workspace if specified
    if (eventData.workspace) {
      const workspace = await Workspace.findById(eventData.workspace);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      // Check if workspace belongs to user or user is a member of the team
      if (workspace.owner && workspace.owner.toString() !== userId) {
        if (workspace.team) {
          const team = await Team.findById(workspace.team);
          if (
            !team ||
            !team.members.some((member) => member.user && member.user.toString() === userId)
          ) {
            throw new ForbiddenError(
              'You do not have permission to create events for this workspace',
            );
          }
        } else {
          throw new ForbiddenError(
            'You do not have permission to create events for this workspace',
          );
        }
      }
    }

    // Validate team if specified
    if (eventData.team) {
      const team = await Team.findById(eventData.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      // Check if user is a member of the team
      if (!team.members.some((member) => member.user && member.user.toString() === userId)) {
        throw new ForbiddenError('You do not have permission to create events for this team');
      }
    }

    // Validate attendees if specified
    if (eventData.attendees && eventData.attendees.length > 0) {
      const validatedAttendees: IAttendee[] = [];

      for (const attendee of eventData.attendees) {
        // Check if user exists
        const user = await User.findById(attendee.user);
        if (!user) {
          throw new NotFoundError(`Attendee user not found: ${attendee.user}`);
        }

        validatedAttendees.push({
          user: attendee.user,
          status: attendee.status || 'pending',
        });
      }

      eventData.attendees = validatedAttendees;
    }

    // Set user ID
    eventData.user = new Types.ObjectId(userId);

    // Create calendar event
    const calendarEvent = await CalendarEvent.create(eventData);

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      task: eventData.task as Types.ObjectId,
      project: eventData.project as Types.ObjectId,
      workspace: eventData.workspace as Types.ObjectId,
      team: eventData.team as Types.ObjectId,
      data: {
        eventTitle: calendarEvent.title,
        eventType: calendarEvent.type,
        startDate: calendarEvent.startDate,
        endDate: calendarEvent.endDate,
        isCalendarEvent: true,
      },
    });

    // Create notifications for attendees
    if (calendarEvent.attendees && calendarEvent.attendees.length > 0) {
      for (const attendee of calendarEvent.attendees) {
        // Skip notification for the creator
        if (attendee.user.toString() === userId) continue;

        await notificationService.createNotification(attendee.user.toString(), {
          type: NotificationType.TASK_ASSIGNED,
          title: 'Calendar Event Invitation',
          message: `You have been invited to "${calendarEvent.title}"`,
          data: {
            eventId: calendarEvent._id?.toString(),
            eventTitle: calendarEvent.title,
            startDate: calendarEvent.startDate,
            endDate: calendarEvent.endDate,
            inviterId: userId,
          },
        });
      }
    }

    // Sync with external calendars if enabled
    if (calendarEvent._id) {
      await syncEventToExternalCalendars(calendarEvent);
    }

    return calendarEvent;
  } catch (error) {
    logger.error(`Error creating calendar event:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get all calendar events for a user
 * @param userId User ID
 * @param queryParams Query parameters
 * @returns Calendar events and pagination metadata
 */
export const getCalendarEvents = async (
  userId: string,
  queryParams: CalendarQueryParams = {},
): Promise<{
  data: ICalendarEvent[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> => {
  const timer = startTimer('calendarService.getCalendarEvents');

  try {
    // Create base query for user's events and events where user is an attendee
    const query = CalendarEvent.find({
      $or: [{ user: userId }, { 'attendees.user': userId }],
    });

    // Filter by date range if specified
    if (queryParams.startDate && queryParams.endDate) {
      query.find({
        $or: [
          // Events that start within the range
          {
            startDate: {
              $gte: new Date(queryParams.startDate),
              $lte: new Date(queryParams.endDate),
            },
          },
          // Events that end within the range
          {
            endDate: {
              $gte: new Date(queryParams.startDate),
              $lte: new Date(queryParams.endDate),
            },
          },
          // Events that span the entire range
          {
            startDate: { $lte: new Date(queryParams.startDate) },
            endDate: { $gte: new Date(queryParams.endDate) },
          },
        ],
      });
    } else if (queryParams.startDate) {
      query.find({
        startDate: { $gte: new Date(queryParams.startDate) },
      });
    } else if (queryParams.endDate) {
      query.find({
        startDate: { $lte: new Date(queryParams.endDate) },
      });
    }

    // Filter by type if specified
    if (queryParams.type) {
      query.find({ type: queryParams.type });
    }

    // Filter by task if specified
    if (queryParams.task) {
      query.find({ task: queryParams.task });
    }

    // Filter by project if specified
    if (queryParams.project) {
      query.find({ project: queryParams.project });
    }

    // Filter by workspace if specified
    if (queryParams.workspace) {
      query.find({ workspace: queryParams.workspace });
    }

    // Filter by team if specified
    if (queryParams.team) {
      query.find({ team: queryParams.team });
    }

    // Filter by attendance status if specified
    if (queryParams.attendanceStatus) {
      query.find({
        'attendees.user': userId,
        'attendees.status': queryParams.attendanceStatus,
      });
    }

    // Apply API features (filtering, sorting, pagination)
    const features = new APIFeatures(query, queryParams)
      .filter()
      .search(['title', 'description', 'location'])
      .sort()
      .limitFields()
      .paginate();

    // Execute query with pagination metadata
    return await features.execute();
  } catch (error) {
    logger.error(`Error getting calendar events for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get a calendar event by ID
 * @param eventId Calendar event ID
 * @param userId User ID
 * @returns Calendar event
 */
export const getCalendarEventById = async (
  eventId: string,
  userId: string,
): Promise<ICalendarEvent> => {
  const timer = startTimer('calendarService.getCalendarEventById');

  try {
    // Try to get from cache
    const cacheKey = `calendarEvent:${eventId}`;
    const cachedEvent = cache.get<ICalendarEvent>(cacheKey);
    if (cachedEvent) {
      return cachedEvent;
    }

    // Find calendar event by ID
    const calendarEvent = await CalendarEvent.findById(eventId)
      .populate('task', 'title status')
      .populate('project', 'name color')
      .populate('workspace', 'name')
      .populate('team', 'name')
      .populate('attendees.user', 'name email');

    // Check if calendar event exists
    if (!calendarEvent) {
      throw new NotFoundError('Calendar event not found');
    }

    // Check if user has access to the event
    const isOwner = calendarEvent.user.toString() === userId;
    const isAttendee = calendarEvent.attendees.some(
      (attendee) => attendee.user.toString() === userId,
    );

    if (!isOwner && !isAttendee) {
      throw new ForbiddenError('You do not have permission to access this calendar event');
    }

    // Cache calendar event
    cache.set(cacheKey, calendarEvent, 300); // Cache for 5 minutes

    return calendarEvent;
  } catch (error) {
    logger.error(`Error getting calendar event ${eventId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a calendar event
 * @param eventId Calendar event ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated calendar event
 */
export const updateCalendarEvent = async (
  eventId: string,
  userId: string,
  updateData: Partial<ICalendarEvent>,
): Promise<ICalendarEvent> => {
  const timer = startTimer('calendarService.updateCalendarEvent');

  try {
    // Find calendar event by ID
    const calendarEvent = await CalendarEvent.findById(eventId);

    // Check if calendar event exists
    if (!calendarEvent) {
      throw new NotFoundError('Calendar event not found');
    }

    // Check if user is the owner of the event
    if (calendarEvent.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this calendar event');
    }

    // Validate dates if updating
    if (
      (updateData.startDate || calendarEvent.startDate) &&
      (updateData.endDate || calendarEvent.endDate)
    ) {
      const startDate = updateData.startDate
        ? new Date(updateData.startDate)
        : calendarEvent.startDate;
      const endDate = updateData.endDate ? new Date(updateData.endDate) : calendarEvent.endDate;

      if (startDate && endDate && startDate > endDate) {
        throw new ValidationError('End date must be after start date');
      }
    }

    // Validate task if updating
    if (updateData.task) {
      const task = await Task.findById(updateData.task);
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // Check if task belongs to user
      if (task.user && task.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to use this task');
      }
    }

    // Validate project if updating
    if (updateData.project) {
      const project = await Project.findById(updateData.project);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check if project belongs to user
      if (project.user && project.user.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to use this project');
      }
    }

    // Validate workspace if updating
    if (updateData.workspace) {
      const workspace = await Workspace.findById(updateData.workspace);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      // Check if workspace belongs to user or user is a member of the team
      if (workspace.owner && workspace.owner.toString() !== userId) {
        if (workspace.team) {
          const team = await Team.findById(workspace.team);
          if (
            !team ||
            !team.members.some((member) => member.user && member.user.toString() === userId)
          ) {
            throw new ForbiddenError('You do not have permission to use this workspace');
          }
        } else {
          throw new ForbiddenError('You do not have permission to use this workspace');
        }
      }
    }

    // Validate team if updating
    if (updateData.team) {
      const team = await Team.findById(updateData.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      // Check if user is a member of the team
      if (!team.members.some((member) => member.user && member.user.toString() === userId)) {
        throw new ForbiddenError('You do not have permission to use this team');
      }
    }

    // Validate attendees if updating
    if (updateData.attendees && updateData.attendees.length > 0) {
      const validatedAttendees: IAttendee[] = [];

      for (const attendee of updateData.attendees) {
        // Check if user exists
        const user = await User.findById(attendee.user);
        if (!user) {
          throw new NotFoundError(`Attendee user not found: ${attendee.user}`);
        }

        validatedAttendees.push({
          user: attendee.user,
          status: attendee.status || 'pending',
        });
      }

      updateData.attendees = validatedAttendees;
    }

    // Update calendar event
    Object.assign(calendarEvent, updateData);
    await calendarEvent.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      task: calendarEvent.task,
      project: calendarEvent.project,
      workspace: calendarEvent.workspace,
      team: calendarEvent.team,
      data: {
        eventTitle: calendarEvent.title,
        eventType: calendarEvent.type,
        startDate: calendarEvent.startDate,
        endDate: calendarEvent.endDate,
        isCalendarEvent: true,
        updates: Object.keys(updateData),
      },
    });

    // Create notifications for new attendees
    if (updateData.attendees && updateData.attendees.length > 0) {
      const existingAttendeeIds = new Set(
        calendarEvent.attendees
          .filter((a) => a.user && a.status !== 'declined')
          .map((a) => a.user.toString()),
      );

      const newAttendees = updateData.attendees.filter(
        (a) => a.user && !existingAttendeeIds.has(a.user.toString()),
      );

      for (const attendee of newAttendees) {
        // Skip notification for the creator
        if (attendee.user.toString() === userId) continue;

        await notificationService.createNotification(attendee.user.toString(), {
          type: NotificationType.TASK_ASSIGNED,
          title: 'Calendar Event Invitation',
          message: `You have been invited to "${calendarEvent.title}"`,
          data: {
            eventId: calendarEvent._id?.toString(),
            eventTitle: calendarEvent.title,
            startDate: calendarEvent.startDate,
            endDate: calendarEvent.endDate,
            inviterId: userId,
          },
        });
      }
    }

    // Sync with external calendars if enabled
    if (calendarEvent._id) {
      await syncEventToExternalCalendars(calendarEvent);
    }

    // Invalidate cache
    cache.del(`calendarEvent:${eventId}`);

    return calendarEvent;
  } catch (error) {
    logger.error(`Error updating calendar event ${eventId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a calendar event
 * @param eventId Calendar event ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteCalendarEvent = async (
  eventId: string,
  userId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('calendarService.deleteCalendarEvent');

  try {
    // Find calendar event by ID
    const calendarEvent = await CalendarEvent.findById(eventId);

    // Check if calendar event exists
    if (!calendarEvent) {
      throw new NotFoundError('Calendar event not found');
    }

    // Check if user is the owner of the event
    if (calendarEvent.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to delete this calendar event');
    }

    // Get event details for activity log
    const eventTitle = calendarEvent.title;
    const taskId = calendarEvent.task;
    const projectId = calendarEvent.project;
    const workspaceId = calendarEvent.workspace;
    const teamId = calendarEvent.team;
    const attendees = [...calendarEvent.attendees];

    // Delete from external calendars if needed
    if (calendarEvent.externalCalendarId && calendarEvent.externalEventId) {
      await deleteEventFromExternalCalendars(calendarEvent);
    }

    // Delete calendar event
    await calendarEvent.deleteOne();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_DELETED,
      task: taskId,
      project: projectId,
      workspace: workspaceId,
      team: teamId,
      data: {
        eventTitle,
        eventType: calendarEvent.type,
        isCalendarEvent: true,
      },
    });

    // Create notifications for attendees
    for (const attendee of attendees) {
      // Skip notification for the creator
      if (attendee.user.toString() === userId) continue;

      await notificationService.createNotification(attendee.user.toString(), {
        type: NotificationType.SYSTEM,
        title: 'Calendar Event Cancelled',
        message: `The event "${eventTitle}" has been cancelled`,
        data: {
          eventId,
          eventTitle,
          cancelledBy: userId,
        },
      });
    }

    // Invalidate cache
    cache.del(`calendarEvent:${eventId}`);

    return {
      message: 'Calendar event deleted successfully',
    };
  } catch (error) {
    logger.error(`Error deleting calendar event ${eventId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update attendee status
 * @param eventId Calendar event ID
 * @param userId User ID
 * @param status Attendance status
 * @returns Updated calendar event
 */
export const updateAttendeeStatus = async (
  eventId: string,
  userId: string,
  status: 'pending' | 'accepted' | 'declined',
): Promise<ICalendarEvent> => {
  const timer = startTimer('calendarService.updateAttendeeStatus');

  try {
    // Find calendar event by ID
    const calendarEvent = await CalendarEvent.findById(eventId);

    // Check if calendar event exists
    if (!calendarEvent) {
      throw new NotFoundError('Calendar event not found');
    }

    // Check if user is an attendee
    const attendeeIndex = calendarEvent.attendees.findIndex(
      (attendee) => attendee.user && attendee.user.toString() === userId,
    );

    if (attendeeIndex === -1) {
      throw new ForbiddenError('You are not an attendee of this event');
    }

    // Update attendee status
    calendarEvent.attendees[attendeeIndex].status = status;
    await calendarEvent.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      task: calendarEvent.task,
      project: calendarEvent.project,
      workspace: calendarEvent.workspace,
      team: calendarEvent.team,
      data: {
        eventTitle: calendarEvent.title,
        eventType: calendarEvent.type,
        isCalendarEvent: true,
        attendanceStatus: status,
      },
    });

    // Create notification for event owner
    if (calendarEvent.user.toString() !== userId) {
      await notificationService.createNotification(calendarEvent.user.toString(), {
        type: NotificationType.SYSTEM,
        title: 'Calendar Event Response',
        message: `A user has ${status} your event "${calendarEvent.title}"`,
        data: {
          eventId: calendarEvent._id?.toString(),
          eventTitle: calendarEvent.title,
          responderId: userId,
          status,
        },
      });
    }

    // Invalidate cache
    cache.del(`calendarEvent:${eventId}`);

    return calendarEvent;
  } catch (error) {
    logger.error(`Error updating attendee status for event ${eventId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Add reminder to calendar event
 * @param eventId Calendar event ID
 * @param userId User ID
 * @param reminder Reminder data
 * @returns Updated calendar event
 */
export const addEventReminder = async (
  eventId: string,
  userId: string,
  reminder: { time: number },
): Promise<ICalendarEvent> => {
  const timer = startTimer('calendarService.addEventReminder');

  try {
    // Find calendar event by ID
    const calendarEvent = await CalendarEvent.findById(eventId);

    // Check if calendar event exists
    if (!calendarEvent) {
      throw new NotFoundError('Calendar event not found');
    }

    // Check if user has access to the event
    const isOwner = calendarEvent.user.toString() === userId;
    const isAttendee = calendarEvent.attendees.some(
      (attendee) => attendee.user.toString() === userId,
    );

    if (!isOwner && !isAttendee) {
      throw new ForbiddenError('You do not have permission to add reminders to this event');
    }

    // Validate reminder time
    if (reminder.time < 0) {
      throw new ValidationError('Reminder time must be a positive number');
    }

    // Add reminder
    if (!calendarEvent.reminders) {
      calendarEvent.reminders = [];
    }

    calendarEvent.reminders.push({
      time: reminder.time,
      sent: false,
    });

    await calendarEvent.save();

    // Invalidate cache
    cache.del(`calendarEvent:${eventId}`);

    return calendarEvent;
  } catch (error) {
    logger.error(`Error adding reminder to event ${eventId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Remove reminder from calendar event
 * @param eventId Calendar event ID
 * @param userId User ID
 * @param reminderIndex Reminder index
 * @returns Updated calendar event
 */
export const removeEventReminder = async (
  eventId: string,
  userId: string,
  reminderIndex: number,
): Promise<ICalendarEvent> => {
  const timer = startTimer('calendarService.removeEventReminder');

  try {
    // Find calendar event by ID
    const calendarEvent = await CalendarEvent.findById(eventId);

    // Check if calendar event exists
    if (!calendarEvent) {
      throw new NotFoundError('Calendar event not found');
    }

    // Check if user has access to the event
    const isOwner = calendarEvent.user.toString() === userId;
    const isAttendee = calendarEvent.attendees.some(
      (attendee) => attendee.user.toString() === userId,
    );

    if (!isOwner && !isAttendee) {
      throw new ForbiddenError('You do not have permission to remove reminders from this event');
    }

    // Check if reminder exists
    if (
      !calendarEvent.reminders ||
      reminderIndex < 0 ||
      reminderIndex >= calendarEvent.reminders.length
    ) {
      throw new NotFoundError('Reminder not found');
    }

    // Remove reminder
    calendarEvent.reminders.splice(reminderIndex, 1);
    await calendarEvent.save();

    // Invalidate cache
    cache.del(`calendarEvent:${eventId}`);

    return calendarEvent;
  } catch (error) {
    logger.error(`Error removing reminder from event ${eventId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Process event reminders
 * This should be run by a scheduled job
 * @returns Processing result
 */
export const processEventReminders = async (): Promise<{
  processed: number;
  sent: number;
  errors: number;
}> => {
  const timer = startTimer('calendarService.processEventReminders');

  let processed = 0;
  let sent = 0;
  let errors = 0;

  try {
    const now = new Date();

    // Find events with unsent reminders
    const events = await CalendarEvent.find({
      startDate: { $gt: now }, // Only future events
      reminders: { $elemMatch: { sent: false } },
    }).populate('user', 'name email');

    logger.info(`Processing reminders for ${events.length} events`);

    // Process each event
    for (const event of events) {
      processed++;

      try {
        let eventUpdated = false;

        // Check each reminder
        for (let i = 0; i < event.reminders.length; i++) {
          const reminder = event.reminders[i];

          if (reminder.sent) continue;

          // Calculate when the reminder should be sent
          const reminderTime = new Date(event.startDate);
          reminderTime.setMinutes(reminderTime.getMinutes() - reminder.time);

          // If it's time to send the reminder
          if (reminderTime <= now) {
            // Send notification to event owner
            await notificationService.createNotification(event.user.toString(), {
              type: NotificationType.TASK_DUE_SOON,
              title: 'Event Reminder',
              message: `Reminder: "${event.title}" starts in ${reminder.time} minutes`,
              data: {
                eventId: event._id?.toString(),
                eventTitle: event.title,
                startDate: event.startDate,
                reminderTime: reminder.time,
              },
            });

            // Send notifications to attendees
            for (const attendee of event.attendees) {
              if (
                attendee.status === 'accepted' &&
                attendee.user.toString() !== event.user.toString()
              ) {
                await notificationService.createNotification(attendee.user.toString(), {
                  type: NotificationType.TASK_DUE_SOON,
                  title: 'Event Reminder',
                  message: `Reminder: "${event.title}" starts in ${reminder.time} minutes`,
                  data: {
                    eventId: event._id?.toString(),
                    eventTitle: event.title,
                    startDate: event.startDate,
                    reminderTime: reminder.time,
                  },
                });
              }
            }

            // Mark reminder as sent
            event.reminders[i].sent = true;
            eventUpdated = true;
            sent++;
          }
        }

        // Save event if updated
        if (eventUpdated) {
          await event.save();
        }
      } catch (error) {
        logger.error(`Error processing reminders for event ${event._id}:`, error);
        errors++;
      }
    }

    logger.info(
      `Processed ${processed} events, sent ${sent} reminders, encountered ${errors} errors`,
    );

    return { processed, sent, errors };
  } catch (error) {
    logger.error('Error processing event reminders:', error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Create a calendar integration
 * @param userId User ID
 * @param integrationData Calendar integration data
 * @returns Created calendar integration
 */
export const createCalendarIntegration = async (
  userId: string,
  integrationData: Partial<ICalendarIntegration>,
): Promise<ICalendarIntegration> => {
  const timer = startTimer('calendarService.createCalendarIntegration');

  try {
    // Check if integration already exists
    const existingIntegration = await CalendarIntegration.findOne({
      user: userId,
      provider: integrationData.provider,
      calendarId: integrationData.calendarId,
    });

    if (existingIntegration) {
      throw new ValidationError('Calendar integration already exists');
    }

    // Set user ID
    integrationData.user = new Types.ObjectId(userId);

    // Create calendar integration
    const calendarIntegration = await CalendarIntegration.create(integrationData);

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_CREATED,
      data: {
        provider: calendarIntegration.provider,
        calendarName: calendarIntegration.calendarName,
        isCalendarIntegration: true,
      },
    });

    return calendarIntegration;
  } catch (error) {
    logger.error(`Error creating calendar integration:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get all calendar integrations for a user
 * @param userId User ID
 * @returns Calendar integrations
 */
export const getCalendarIntegrations = async (userId: string): Promise<ICalendarIntegration[]> => {
  const timer = startTimer('calendarService.getCalendarIntegrations');

  try {
    // Find calendar integrations for user
    const integrations = await CalendarIntegration.find({ user: userId });
    return integrations;
  } catch (error) {
    logger.error(`Error getting calendar integrations for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Get a calendar integration by ID
 * @param integrationId Calendar integration ID
 * @param userId User ID
 * @returns Calendar integration
 */
export const getCalendarIntegrationById = async (
  integrationId: string,
  userId: string,
): Promise<ICalendarIntegration> => {
  const timer = startTimer('calendarService.getCalendarIntegrationById');

  try {
    // Find calendar integration by ID
    const integration = await CalendarIntegration.findById(integrationId);

    // Check if integration exists
    if (!integration) {
      throw new NotFoundError('Calendar integration not found');
    }

    // Check if integration belongs to user
    if (integration.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to access this calendar integration');
    }

    return integration;
  } catch (error) {
    logger.error(`Error getting calendar integration ${integrationId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Update a calendar integration
 * @param integrationId Calendar integration ID
 * @param userId User ID
 * @param updateData Update data
 * @returns Updated calendar integration
 */
export const updateCalendarIntegration = async (
  integrationId: string,
  userId: string,
  updateData: Partial<ICalendarIntegration>,
): Promise<ICalendarIntegration> => {
  const timer = startTimer('calendarService.updateCalendarIntegration');

  try {
    // Find calendar integration by ID
    const integration = await CalendarIntegration.findById(integrationId);

    // Check if integration exists
    if (!integration) {
      throw new NotFoundError('Calendar integration not found');
    }

    // Check if integration belongs to user
    if (integration.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to update this calendar integration');
    }

    // Prevent changing user, provider, or calendarId
    delete updateData.user;
    delete updateData.provider;
    delete updateData.calendarId;

    // Update calendar integration
    Object.assign(integration, updateData);
    await integration.save();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_UPDATED,
      data: {
        provider: integration.provider,
        calendarName: integration.calendarName,
        isCalendarIntegration: true,
        updates: Object.keys(updateData),
      },
    });

    return integration;
  } catch (error) {
    logger.error(`Error updating calendar integration ${integrationId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Delete a calendar integration
 * @param integrationId Calendar integration ID
 * @param userId User ID
 * @returns Success message
 */
export const deleteCalendarIntegration = async (
  integrationId: string,
  userId: string,
): Promise<{ message: string }> => {
  const timer = startTimer('calendarService.deleteCalendarIntegration');

  try {
    // Find calendar integration by ID
    const integration = await CalendarIntegration.findById(integrationId);

    // Check if integration exists
    if (!integration) {
      throw new NotFoundError('Calendar integration not found');
    }

    // Check if integration belongs to user
    if (integration.user.toString() !== userId) {
      throw new ForbiddenError('You do not have permission to delete this calendar integration');
    }

    // Get integration details for activity log
    const provider = integration.provider;
    const calendarName = integration.calendarName;

    // Delete calendar integration
    await integration.deleteOne();

    // Create activity log
    await activityService.createActivity(userId, {
      type: ActivityType.TASK_DELETED,
      data: {
        provider,
        calendarName,
        isCalendarIntegration: true,
      },
    });

    return {
      message: 'Calendar integration deleted successfully',
    };
  } catch (error) {
    logger.error(`Error deleting calendar integration ${integrationId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};

/**
 * Sync event to external calendars
 * @param event Calendar event
 * @returns Sync result
 */
export const syncEventToExternalCalendars = async (
  event: ICalendarEvent,
): Promise<{ success: boolean; message: string }> => {
  const timer = startTimer('calendarService.syncEventToExternalCalendars');

  try {
    // Check if event has a user
    if (!event.user) {
      return { success: false, message: 'Event has no user' };
    }

    // Find user's calendar integrations
    const integrations = await CalendarIntegration.find({
      user: event.user,
      syncEnabled: true,
      $or: [
        { 'settings.syncDirection': SyncDirection.EXPORT },
        { 'settings.syncDirection': SyncDirection.BOTH },
      ],
    });

    if (integrations.length === 0) {
      return { success: true, message: 'No enabled calendar integrations found' };
    }

    let syncSuccess = true;
    const errors: string[] = [];

    // Sync to each integration
    for (const integration of integrations) {
      try {
        // Skip if event type doesn't match integration settings
        if (
          (event.type === EventType.TASK && !integration.settings.syncTasks) ||
          (event.type === EventType.MEETING && !integration.settings.syncMeetings) ||
          (event.type === EventType.DEADLINE && !integration.settings.syncDeadlines)
        ) {
          continue;
        }

        // Prepare event data for external calendar
        const eventData = {
          summary: event.title,
          description: event.description || '',
          start: {
            dateTime: event.startDate.toISOString(),
            timeZone: 'UTC',
          },
          end: {
            dateTime: event.endDate
              ? event.endDate.toISOString()
              : new Date(event.startDate.getTime() + 3600000).toISOString(),
            timeZone: 'UTC',
          },
          location: event.location || '',
        };

        // Log the event data for debugging
        logger.debug(`Event data prepared for sync:`, eventData);

        // Sync based on provider
        switch (integration.provider) {
          case CalendarProvider.GOOGLE:
            // This would be implemented with Google Calendar API
            logger.info(`Syncing event ${event._id} to Google Calendar ${integration.calendarId}`);
            // Placeholder for Google Calendar API call
            break;

          case CalendarProvider.MICROSOFT:
            // This would be implemented with Microsoft Graph API
            logger.info(
              `Syncing event ${event._id} to Microsoft Calendar ${integration.calendarId}`,
            );
            // Placeholder for Microsoft Graph API call
            break;

          case CalendarProvider.APPLE:
            // This would be implemented with Apple Calendar API
            logger.info(`Syncing event ${event._id} to Apple Calendar ${integration.calendarId}`);
            // Placeholder for Apple Calendar API call
            break;

          default:
            logger.warn(`Unsupported calendar provider: ${integration.provider}`);
            errors.push(`Unsupported calendar provider: ${integration.provider}`);
            continue;
        }

        // Update event with external calendar info (in a real implementation)
        // event.externalCalendarId = integration.calendarId;
        // event.externalEventId = response.id;
        // await event.save();
      } catch (error) {
        syncSuccess = false;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to sync to ${integration.provider} calendar: ${errorMessage}`);
        logger.error(
          `Error syncing event ${event._id} to ${integration.provider} calendar:`,
          error,
        );
      }
    }

    return {
      success: syncSuccess,
      message: syncSuccess ? 'Event synced successfully' : `Sync errors: ${errors.join(', ')}`,
    };
  } catch (error) {
    logger.error(`Error syncing event ${event._id} to external calendars:`, error);
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  } finally {
    timer.end();
  }
};

/**
 * Delete event from external calendars
 * @param event Calendar event
 * @returns Delete result
 */
export const deleteEventFromExternalCalendars = async (
  event: ICalendarEvent,
): Promise<{ success: boolean; message: string }> => {
  const timer = startTimer('calendarService.deleteEventFromExternalCalendars');

  try {
    // Check if event has external calendar info
    if (!event.externalCalendarId || !event.externalEventId) {
      return { success: true, message: 'No external calendar info' };
    }

    // Find the integration
    const integration = await CalendarIntegration.findOne({
      user: event.user,
      calendarId: event.externalCalendarId,
    });

    if (!integration) {
      return { success: false, message: 'Calendar integration not found' };
    }

    // Delete based on provider
    switch (integration.provider) {
      case CalendarProvider.GOOGLE:
        // This would be implemented with Google Calendar API
        logger.info(
          `Deleting event ${event.externalEventId} from Google Calendar ${event.externalCalendarId}`,
        );
        // Placeholder for Google Calendar API call
        break;

      case CalendarProvider.MICROSOFT:
        // This would be implemented with Microsoft Graph API
        logger.info(
          `Deleting event ${event.externalEventId} from Microsoft Calendar ${event.externalCalendarId}`,
        );
        // Placeholder for Microsoft Graph API call
        break;

      case CalendarProvider.APPLE:
        // This would be implemented with Apple Calendar API
        logger.info(
          `Deleting event ${event.externalEventId} from Apple Calendar ${event.externalCalendarId}`,
        );
        // Placeholder for Apple Calendar API call
        break;

      default:
        return {
          success: false,
          message: `Unsupported calendar provider: ${integration.provider}`,
        };
    }

    return { success: true, message: 'Event deleted from external calendar' };
  } catch (error) {
    logger.error(`Error deleting event ${event._id} from external calendar:`, error);
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  } finally {
    timer.end();
  }
};

/**
 * Sync all events with external calendars
 * @param userId User ID
 * @returns Sync result
 */
export const syncAllEvents = async (
  userId: string,
): Promise<{
  total: number;
  success: number;
  failed: number;
}> => {
  const timer = startTimer('calendarService.syncAllEvents');

  let total = 0;
  let success = 0;
  let failed = 0;

  try {
    // Find all events for the user
    const events = await CalendarEvent.find({ user: userId });
    total = events.length;

    // Sync each event
    for (const event of events) {
      try {
        const result = await syncEventToExternalCalendars(event);
        if (result.success) {
          success++;
        } else {
          failed++;
          logger.warn(`Failed to sync event ${event._id}: ${result.message}`);
        }
      } catch (error) {
        failed++;
        logger.error(`Error syncing event ${event._id}:`, error);
      }
    }

    return { total, success, failed };
  } catch (error) {
    logger.error(`Error syncing all events for user ${userId}:`, error);
    throw error;
  } finally {
    timer.end();
  }
};
