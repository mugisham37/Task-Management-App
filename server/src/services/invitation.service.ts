import Invitation, { type IInvitation, InvitationStatus } from '../models/invitation.model';
import Team, { TeamRole } from '../models/team.model';
import User from '../models/user.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/app-error';
import { createActivity } from './activity.service';
import { ActivityType } from '../models/activity.model';
import { sendEmail } from './email.service';
import config from '../config/environment';
import { IInvitationTeam, IPopulatedUser, ITeamMember, ITeam } from '../types/team.types';

/**
 * Create a new invitation
 * @param userId User ID of the inviter
 * @param invitationData Invitation data
 * @returns Newly created invitation
 */
export const createInvitation = async (
  userId: string,
  invitationData: {
    email: string;
    teamId: string;
    role?: TeamRole;
  },
): Promise<IInvitation> => {
  // Check if team exists and cast to proper type
  const team = (await Team.findById(invitationData.teamId)) as ITeam | null;
  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check if user is an admin or owner of the team
  const userMember = team.members.find((member: ITeamMember) => member.user?.toString() === userId);
  if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
    throw new ForbiddenError('You do not have permission to invite members to this team');
  }

  // Check if email is already a team member
  const existingUser = await User.findOne({ email: invitationData.email.toLowerCase() });
  if (existingUser) {
    const isAlreadyMember = team.members.some(
      (member: ITeamMember) => member.user?.toString() === existingUser._id?.toString(),
    );
    if (isAlreadyMember) {
      throw new ValidationError('User is already a member of this team');
    }
  }

  // Check if there's already a pending invitation for this email and team
  const existingInvitation = await Invitation.findOne({
    email: invitationData.email.toLowerCase(),
    team: invitationData.teamId,
    status: InvitationStatus.PENDING,
  });

  if (existingInvitation) {
    throw new ValidationError('An invitation has already been sent to this email');
  }

  // Determine role (only owner can invite admins)
  let role = invitationData.role || TeamRole.MEMBER;
  if (role === TeamRole.ADMIN && userMember.role !== TeamRole.OWNER) {
    throw new ForbiddenError('Only the team owner can invite administrators');
  }

  // Prevent inviting another owner
  if (role === TeamRole.OWNER) {
    role = TeamRole.ADMIN;
  }

  // Create invitation
  const invitation = await Invitation.create({
    email: invitationData.email.toLowerCase(),
    team: invitationData.teamId,
    role,
    invitedBy: userId,
    status: InvitationStatus.PENDING,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  });

  // Generate token
  invitation.generateToken();
  await invitation.save();

  // Send invitation email
  const inviter = await User.findById(userId).select('name email');
  const invitationUrl = `${config.frontendUrl}/invitations/${invitation.token}`;

  await sendEmail(
    invitation.email,
    `Invitation to join ${team.name}`,
    `
      <h1>You've been invited to join ${team.name}</h1>
      <p>${inviter?.name} (${inviter?.email}) has invited you to join their team on Task Management.</p>
      <p>Click the link below to accept the invitation:</p>
      <a href="${invitationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
      <p>This invitation will expire in 7 days.</p>
      <p>If you don't have an account yet, you'll be able to create one after accepting the invitation.</p>
    `,
  );

  // Create activity log
  await createActivity(userId, {
    type: ActivityType.TEAM_MEMBER_ADDED,
    team: team._id.toString(),
    data: {
      teamName: team.name,
      memberEmail: invitation.email,
      action: 'invited',
      role,
    },
  });

  return invitation;
};

/**
 * Get all invitations for a team
 * @param teamId Team ID
 * @param userId User ID
 * @returns Invitations
 */
export const getTeamInvitations = async (
  teamId: string,
  userId: string,
): Promise<IInvitation[]> => {
  // Check if team exists
  const team = await Team.findById(teamId);
  if (!team) {
    throw new NotFoundError('Team not found');
  }

  // Check if user is an admin or owner of the team
  const userMember = team.members.find((member: ITeamMember) => member.user?.toString() === userId);
  if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
    throw new ForbiddenError('You do not have permission to view team invitations');
  }

  // Get invitations for the team
  const invitations = await Invitation.find({ team: teamId }).sort({ createdAt: -1 });

  return invitations;
};

/**
 * Get all invitations for a user by email
 * @param email User email
 * @returns Invitations
 */
export const getUserInvitations = async (email: string): Promise<IInvitation[]> => {
  // Get pending invitations for the email
  const invitations = await Invitation.find({
    email: email.toLowerCase(),
    status: InvitationStatus.PENDING,
    expiresAt: { $gt: new Date() },
  })
    .populate('team', 'name')
    .populate('invitedBy', 'name email')
    .sort({ createdAt: -1 });

  return invitations;
};

/**
 * Get invitation by token
 * @param token Invitation token
 * @returns Invitation
 */
export const getInvitationByToken = async (token: string): Promise<IInvitation> => {
  // Find invitation by token
  const invitation = await Invitation.findOne({ token })
    .populate('team', 'name')
    .populate('invitedBy', 'name email');

  // Check if invitation exists
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  // Check if invitation is expired
  if (invitation.isExpired()) {
    invitation.status = InvitationStatus.EXPIRED;
    await invitation.save();
    throw new ValidationError('Invitation has expired');
  }

  return invitation;
};

/**
 * Accept an invitation
 * @param token Invitation token
 * @param userId User ID
 * @returns Success message
 */
export const acceptInvitation = async (
  token: string,
  userId: string,
): Promise<{ message: string; teamId: string }> => {
  // Find invitation by token
  const invitation = await Invitation.findOne({ token }).populate('team', 'name members');

  // Check if invitation exists
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  // Check if invitation is expired
  if (invitation.isExpired()) {
    invitation.status = InvitationStatus.EXPIRED;
    await invitation.save();
    throw new ValidationError('Invitation has expired');
  }

  // Check if invitation is pending
  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ValidationError(`Invitation has already been ${invitation.status}`);
  }

  // Get user
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if user email matches invitation email
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new ValidationError('This invitation was sent to a different email address');
  }

  // Check if user is already a member of the team
  const team = invitation.team as IInvitationTeam;
  const isAlreadyMember = team.members.some(
    (member: ITeamMember) => member.user?.toString() === userId,
  );
  if (isAlreadyMember) {
    invitation.status = InvitationStatus.ACCEPTED;
    await invitation.save();
    throw new ValidationError('You are already a member of this team');
  }

  // Add user to team
  await Team.findByIdAndUpdate(team._id, {
    $push: {
      members: {
        user: userId,
        role: invitation.role,
        joinedAt: new Date(),
      },
    },
  });

  // Update invitation status
  invitation.status = InvitationStatus.ACCEPTED;
  await invitation.save();

  // Create activity log
  await createActivity(userId, {
    type: ActivityType.TEAM_MEMBER_ADDED,
    team: team._id.toString(),
    data: {
      teamName: team.name,
      memberName: user.name,
      memberEmail: user.email,
      role: invitation.role,
      action: 'joined',
    },
  });

  return {
    message: `You have successfully joined ${team.name}`,
    teamId: team._id.toString(),
  };
};

/**
 * Decline an invitation
 * @param token Invitation token
 * @param userId User ID
 * @returns Success message
 */
export const declineInvitation = async (
  token: string,
  userId: string,
): Promise<{ message: string }> => {
  // Find invitation by token
  const invitation = await Invitation.findOne({ token }).populate('team', 'name');

  // Check if invitation exists
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  // Check if invitation is expired
  if (invitation.isExpired()) {
    invitation.status = InvitationStatus.EXPIRED;
    await invitation.save();
    throw new ValidationError('Invitation has expired');
  }

  // Check if invitation is pending
  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ValidationError(`Invitation has already been ${invitation.status}`);
  }

  // Get user
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if user email matches invitation email
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new ValidationError('This invitation was sent to a different email address');
  }

  // Update invitation status
  invitation.status = InvitationStatus.DECLINED;
  await invitation.save();

  // Create activity log
  await createActivity(userId, {
    type: ActivityType.TEAM_MEMBER_REMOVED,
    team: (invitation.team as IInvitationTeam)._id.toString(),
    data: {
      teamName: (invitation.team as IInvitationTeam).name,
      memberName: user.name,
      memberEmail: user.email,
      action: 'declined',
    },
  });

  return {
    message: `You have declined the invitation to join ${(invitation.team as IInvitationTeam).name}`,
  };
};

/**
 * Cancel an invitation
 * @param invitationId Invitation ID
 * @param userId User ID
 * @returns Success message
 */
export const cancelInvitation = async (
  invitationId: string,
  userId: string,
): Promise<{ message: string }> => {
  // Find invitation by ID
  const invitation = await Invitation.findById(invitationId).populate('team', 'name members');

  // Check if invitation exists
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  // Check if user is an admin or owner of the team
  const team = invitation.team as IInvitationTeam;
  const userMember = team.members.find((member: ITeamMember) => member.user?.toString() === userId);
  if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
    throw new ForbiddenError('You do not have permission to cancel this invitation');
  }

  // Check if invitation is pending
  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ValidationError(`Invitation has already been ${invitation.status}`);
  }

  // Delete invitation
  await invitation.deleteOne();

  // Create activity log
  await createActivity(userId, {
    type: ActivityType.TEAM_MEMBER_REMOVED,
    team: team._id.toString(),
    data: {
      teamName: team.name,
      memberEmail: invitation.email,
      action: 'invitation_cancelled',
    },
  });

  return {
    message: `Invitation to ${invitation.email} has been cancelled`,
  };
};

/**
 * Resend an invitation
 * @param invitationId Invitation ID
 * @param userId User ID
 * @returns Updated invitation
 */
export const resendInvitation = async (
  invitationId: string,
  userId: string,
): Promise<IInvitation> => {
  // Find invitation by ID
  const invitation = await Invitation.findById(invitationId)
    .populate<{ team: IInvitationTeam }>('team', 'name members')
    .populate<{ invitedBy: IPopulatedUser }>('invitedBy', 'name email');

  // Check if invitation exists
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  // Check if user is an admin or owner of the team
  const team = invitation.team as IInvitationTeam;
  const userMember = team.members.find((member: ITeamMember) => member.user?.toString() === userId);
  if (!userMember || ![TeamRole.ADMIN, TeamRole.OWNER].includes(userMember.role as TeamRole)) {
    throw new ForbiddenError('You do not have permission to resend this invitation');
  }

  // Check if invitation is pending
  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ValidationError(`Cannot resend invitation that has been ${invitation.status}`);
  }

  // Update invitation expiration date
  invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  await invitation.save();

  // Send invitation email
  const inviter = await User.findById(userId).select('name email');
  const invitationUrl = `${config.frontendUrl}/invitations/${invitation.token}`;

  await sendEmail(
    invitation.email,
    `Invitation to join ${team.name}`,
    `
      <h1>You've been invited to join ${team.name}</h1>
      <p>${inviter?.name} (${inviter?.email}) has invited you to join their team on Task Management.</p>
      <p>Click the link below to accept the invitation:</p>
      <a href="${invitationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
      <p>This invitation will expire in 7 days.</p>
      <p>If you don't have an account yet, you'll be able to create one after accepting the invitation.</p>
    `,
  );

  // Create activity log
  await createActivity(userId, {
    type: ActivityType.TEAM_MEMBER_ADDED,
    team: team._id.toString(),
    data: {
      teamName: team.name,
      memberEmail: invitation.email,
      action: 'invitation_resent',
      role: invitation.role,
    },
  });

  return invitation;
};
