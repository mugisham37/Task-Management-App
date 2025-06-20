import nodemailer from 'nodemailer';
import config from '../config/environment';
import logger from '../config/logger';
import Invitation from '../models/invitation.model';
import Team from '../models/team.model';
import User from '../models/user.model';

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
  service: config.emailService,
  auth: {
    user: config.emailUser,
    pass: config.emailPassword,
  },
});

/**
 * Send an email
 * @param to Recipient email
 * @param subject Email subject
 * @param html Email HTML content
 * @param text Email plain text content (fallback)
 * @returns Success status
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<boolean> => {
  try {
    const mailOptions = {
      from: `'${config.appName}' <${config.emailFrom}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for plain text version
      html,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send email to ${to}`, error);
    return false;
  }
};

/**
 * Send a verification email
 * @param to Recipient email
 * @param token Verification token
 * @returns Success status
 */
export const sendVerificationEmail = async (to: string, token: string): Promise<boolean> => {
  const verificationUrl = `${config.frontendUrl}/verify-email?token=${token}`;
  const subject = `${config.appName} - Verify Your Email`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">Verify Your Email Address</h2>
      <p>Thank you for registering with ${config.appName}. Please click the button below to verify your email address:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email</a>
      </div>
      <p>If you didn't create an account, you can safely ignore this email.</p>
      <p>This link will expire in 24 hours.</p>
      <p>If the button doesn't work, you can also copy and paste the following link into your browser:</p>
      <p style="word-break: break-all;">${verificationUrl}</p>
      <hr style="border: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #666; font-size: 14px;">© ${new Date().getFullYear()} ${config.appName}. All rights reserved.</p>
    </div>
  `;

  return await sendEmail(to, subject, html);
};

/**
 * Send a password reset email
 * @param to Recipient email
 * @param token Reset token
 * @returns Success status
 */
export const sendPasswordResetEmail = async (to: string, token: string): Promise<boolean> => {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
  const subject = `${config.appName} - Reset Your Password`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">Reset Your Password</h2>
      <p>You requested a password reset for your ${config.appName} account. Please click the button below to reset your password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
      </div>
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
      <p>If the button doesn't work, you can also copy and paste the following link into your browser:</p>
      <p style="word-break: break-all;">${resetUrl}</p>
      <hr style="border: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #666; font-size: 14px;">© ${new Date().getFullYear()} ${config.appName}. All rights reserved.</p>
    </div>
  `;

  return await sendEmail(to, subject, html);
};

/**
 * Send a team invitation email
 * @param invitationId Invitation ID
 * @returns Success status
 */
export const sendInvitationEmail = async (invitationId: string): Promise<boolean> => {
  try {
    // Get invitation details
    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      logger.error(`Invitation not found: ${invitationId}`);
      return false;
    }

    // Get team details
    const team = await Team.findById(invitation.team);
    if (!team) {
      logger.error(`Team not found for invitation: ${invitationId}`);
      return false;
    }

    // Get inviter details
    const inviter = await User.findById(invitation.invitedBy);
    if (!inviter) {
      logger.error(`Inviter not found for invitation: ${invitationId}`);
      return false;
    }

    const invitationUrl = `${config.frontendUrl}/invitations/${invitation.token}`;
    const subject = `${config.appName} - You've Been Invited to Join ${team.name}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">Team Invitation</h2>
        <p>${inviter.name} has invited you to join the team "${team.name}" on ${config.appName}.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
        </div>
        <p>If you already have an account, you'll be able to join the team after logging in. If not, you'll be prompted to create an account.</p>
        <p>This invitation will expire in 7 days.</p>
        <p>If the button doesn't work, you can also copy and paste the following link into your browser:</p>
        <p style="word-break: break-all;">${invitationUrl}</p>
        <hr style="border: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #666; font-size: 14px;">© ${new Date().getFullYear()} ${config.appName}. All rights reserved.</p>
      </div>
    `;

    return await sendEmail(invitation.email, subject, html);
  } catch (error) {
    logger.error(`Failed to send invitation email for invitation: ${invitationId}`, error);
    return false;
  }
};

/**
 * Send a task assignment notification email
 * @param userId User ID of the assignee
 * @param taskId Task ID
 * @param assignerId User ID of the assigner
 * @returns Success status
 */
export const sendTaskAssignmentEmail = async (
  userId: string,
  taskId: string,
  assignerId: string,
): Promise<boolean> => {
  try {
    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      return false;
    }

    // Get assigner details
    const assigner = await User.findById(assignerId);
    if (!assigner) {
      logger.error(`Assigner not found: ${assignerId}`);
      return false;
    }

    // Get task details
    const task = await User.findById(taskId);
    if (!task) {
      logger.error(`Task not found: ${taskId}`);
      return false;
    }

    const taskUrl = `${config.frontendUrl}/tasks/${taskId}`;
    const subject = `${config.appName} - New Task Assignment`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">New Task Assignment</h2>
        <p>${assigner.name} has assigned you a task on ${config.appName}.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${taskUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Task</a>
        </div>
        <p>If the button doesn't work, you can also copy and paste the following link into your browser:</p>
        <p style="word-break: break-all;">${taskUrl}</p>
        <hr style="border: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #666; font-size: 14px;">© ${new Date().getFullYear()} ${config.appName}. All rights reserved.</p>
      </div>
    `;

    return await sendEmail(user.email, subject, html);
  } catch (error) {
    logger.error(
      `Failed to send task assignment email to user: ${userId} for task: ${taskId}`,
      error,
    );
    return false;
  }
};

/**
 * Send a task due date reminder email
 * @param userId User ID
 * @param taskId Task ID
 * @returns Success status
 */
export const sendTaskDueDateReminderEmail = async (
  userId: string,
  taskId: string,
): Promise<boolean> => {
  try {
    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      return false;
    }

    // Get task details
    const task = await User.findById(taskId);
    if (!task) {
      logger.error(`Task not found: ${taskId}`);
      return false;
    }

    const taskUrl = `${config.frontendUrl}/tasks/${taskId}`;
    const subject = `${config.appName} - Task Due Soon`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">Task Due Soon</h2>
        <p>This is a reminder that you have a task due soon on ${config.appName}.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${taskUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Task</a>
        </div>
        <p>If the button doesn't work, you can also copy and paste the following link into your browser:</p>
        <p style="word-break: break-all;">${taskUrl}</p>
        <hr style="border: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #666; font-size: 14px;">© ${new Date().getFullYear()} ${config.appName}. All rights reserved.</p>
      </div>
    `;

    return await sendEmail(user.email, subject, html);
  } catch (error) {
    logger.error(
      `Failed to send task due date reminder email to user: ${userId} for task: ${taskId}`,
      error,
    );
    return false;
  }
};

/**
 * Create a task due soon notification
 * @param userId User ID
 * @param taskId Task ID
 * @param taskTitle Task title
 * @param dueDate Due date
 * @returns Success status
 */
export const createTaskDueSoonNotification = async (
  userId: string,
  taskId: string,
  _taskTitle: string,
  _dueDate: Date,
): Promise<boolean> => {
  try {
    // This is a placeholder for creating a notification
    // In a real implementation, you would use the notification service
    logger.info(`Task due soon notification created for user: ${userId}, task: ${taskId}`);
    return true;
  } catch (error) {
    logger.error(
      `Failed to create task due soon notification for user: ${userId}, task: ${taskId}`,
      error,
    );
    return false;
  }
};

/**
 * Create a task overdue notification
 * @param userId User ID
 * @param taskId Task ID
 * @param taskTitle Task title
 * @returns Success status
 */
export const createTaskOverdueNotification = async (
  userId: string,
  taskId: string,
  _taskTitle: string,
): Promise<boolean> => {
  try {
    // This is a placeholder for creating a notification
    // In a real implementation, you would use the notification service
    logger.info(`Task overdue notification created for user: ${userId}, task: ${taskId}`);
    return true;
  } catch (error) {
    logger.error(
      `Failed to create task overdue notification for user: ${userId}, task: ${taskId}`,
      error,
    );
    return false;
  }
};
