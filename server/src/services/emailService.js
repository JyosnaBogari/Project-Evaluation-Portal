require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { Resend } = require('resend');
const logger = require('../utils/logger');

const buildInvitationLink = (token) => {
  const baseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${baseUrl}/team-invitations/${token}`;
};

const buildProjectTeamLink = () => {
  const baseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${baseUrl}/`;
};

const sendFacultyAssignmentEmail = async ({
  recipientEmail,
  facultyName,
  projectTitle,
  teamLeaderName,
  department,
  section,
}) => {
  if (!recipientEmail || !facultyName || !projectTitle) {
    logger.warn('[EMAIL SERVICE] Missing faculty assignment email fields. Skipping assignment email.');
    return false;
  }

  if (process.env.NODE_ENV === 'test') {
    logger.info('[EMAIL SERVICE] Test mode enabled. Skipping outbound faculty-assignment email.');
    return true;
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.CLIENT_URL) {
    logger.warn('[EMAIL SERVICE] Resend not configured. Faculty assignment email was not sent.');
    return false;
  }

  const projectLink = buildProjectTeamLink();
  const safeFacultyName = facultyName || 'Faculty';
  const safeProjectTitle = projectTitle || 'Project';
  const safeLeaderName = teamLeaderName || 'Project Team Leader';
  const safeDepartment = department || 'Not specified';
  const safeSection = section || 'Not specified';

  const textBody = [
    `Hello ${safeFacultyName},`,
    '',
    `You have been assigned as the faculty guide for "${safeProjectTitle}".`,
    '',
    `Project: ${safeProjectTitle}`,
    `Team Leader: ${safeLeaderName}`,
    `Department: ${safeDepartment}`,
    `Section: ${safeSection}`,
    '',
    `Please review the project here: ${projectLink}`,
    '',
    'Regards,',
    'Project Submission & Evaluation Portal',
  ].join('\n');

  try {
    const response = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM,
      to: [recipientEmail],
      subject: `New Project Assignment: ${safeProjectTitle}`,
      text: textBody,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2 style="margin-bottom: 12px;">New Project Assigned to You</h2>
          <p>Hello <strong>${safeFacultyName}</strong>,</p>
          <p>You have been assigned as the faculty guide for <strong>${safeProjectTitle}</strong>.</p>
          <ul>
            <li><strong>Project:</strong> ${safeProjectTitle}</li>
            <li><strong>Team Leader:</strong> ${safeLeaderName}</li>
            <li><strong>Department:</strong> ${safeDepartment}</li>
            <li><strong>Section:</strong> ${safeSection}</li>
          </ul>
          <p>
            <a href="${projectLink}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 8px; font-weight: 600;">View Project</a>
          </p>
          <p>Regards,<br />Project Submission & Evaluation Portal</p>
        </div>
      `,
    });

    logger.info(`[EMAIL SERVICE] Faculty assignment email sent to ${recipientEmail}. Resend ID: ${response?.id || 'unknown'}`);
    return true;
  } catch (error) {
    logger.error(`[EMAIL SERVICE] Faculty assignment email failed for ${recipientEmail}: ${error.message}`);
    return false;
  }
};

const sendTeamInvitationEmail = async ({
  recipientEmail,
  recipientName,
  inviterName,
  projectTitle,
  token,
  department,
  section,
}) => {
  if (!recipientEmail || !token) {
    logger.warn('[EMAIL SERVICE] Missing recipient email or invitation token. Skipping email send.');
    return false;
  }

  if (process.env.NODE_ENV === 'test') {
    logger.info('[EMAIL SERVICE] Test mode enabled. Skipping outbound email while the invitation tests run.');
    return true;
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.CLIENT_URL) {
    logger.warn('[EMAIL SERVICE] Resend not fully configured. Invitation email was not sent.');
    return false;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const invitationLink = buildInvitationLink(token);
  const safeRecipientName = recipientName || 'Student';
  const safeInviterName = inviterName || 'Project Team Leader';
  const safeDepartment = department || 'Not specified';
  const safeSection = section || 'Not specified';

  const textBody = [
    `Hello ${safeRecipientName},`,
    '',
    `${safeInviterName} has invited you to join the project team for "${projectTitle}".`,
    '',
    `Project: ${projectTitle}`,
    `Team Leader: ${safeInviterName}`,
    `Department: ${safeDepartment}`,
    `Section: ${safeSection}`,
    '',
    `Please review and accept the invitation here: ${invitationLink}`,
    '',
    'If you were not expecting this invitation, you can ignore this email.',
    '',
    'Regards,',
    'Project Submission & Evaluation Portal',
  ].join('\n');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 12px;">You've been invited to join a project team</h2>
      <p>Hello <strong>${safeRecipientName}</strong>,</p>
      <p><strong>${safeInviterName}</strong> has invited you to join the project team for <strong>${projectTitle}</strong>.</p>
      <ul>
        <li><strong>Project:</strong> ${projectTitle}</li>
        <li><strong>Team Leader:</strong> ${safeInviterName}</li>
        <li><strong>Department:</strong> ${safeDepartment}</li>
        <li><strong>Section:</strong> ${safeSection}</li>
      </ul>
      <p>You can review the invitation and accept it from the portal:</p>
      <p>
        <a href="${invitationLink}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Accept Invitation
        </a>
      </p>
      <p>If you were not expecting this invitation, you can ignore this email.</p>
      <p>Regards,<br />Project Submission & Evaluation Portal</p>
    </div>
  `;

  try {
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [recipientEmail],
      subject: `You've been invited to join ${projectTitle}`,
      text: textBody,
      html: htmlBody,
    });

    logger.info(`[EMAIL SERVICE] Team invitation email sent to ${recipientEmail}. Resend ID: ${response?.id || 'unknown'}`);
    return true;
  } catch (error) {
    logger.error(`[EMAIL SERVICE] Failed to send team-invitation email to ${recipientEmail}: ${error.message}`);
    return false;
  }
};

const sendTeamMemberAcceptedEmail = async ({
  recipientEmail,
  leaderName,
  projectTitle,
  teamMemberName,
  rollNumber,
  department,
  section,
}) => {
  if (!recipientEmail || !leaderName || !projectTitle || !teamMemberName) {
    logger.warn('[EMAIL SERVICE] Missing acceptance email fields. Skipping team-member acceptance email.');
    return false;
  }

  if (process.env.NODE_ENV === 'test') {
    logger.info('[EMAIL SERVICE] Test mode enabled. Skipping outbound team-member acceptance email.');
    return true;
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.CLIENT_URL) {
    logger.warn('[EMAIL SERVICE] Resend not fully configured. Team member acceptance email was not sent.');
    return false;
  }

  const projectLink = buildProjectTeamLink();
  const safeLeaderName = leaderName || 'Project Team Leader';
  const safeProjectTitle = projectTitle || 'Project';
  const safeTeamMemberName = teamMemberName || 'Project member';
  const safeRollNumber = rollNumber || 'Not specified';
  const safeDepartment = department || 'Not specified';
  const safeSection = section || 'Not specified';

  const textBody = [
    `Hello ${safeLeaderName},`,
    '',
    `${safeTeamMemberName} has accepted your invitation to join the project team.`,
    '',
    `Project: ${safeProjectTitle}`,
    `New Team Member: ${safeTeamMemberName}`,
    `Roll Number: ${safeRollNumber}`,
    `Department: ${safeDepartment}`,
    `Section: ${safeSection}`,
    '',
    `You can view the project team here: ${projectLink}`,
    '',
    'Regards,',
    'Project Submission & Evaluation Portal',
  ].join('\n');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 12px;">Team Member Accepted Your Project Invitation</h2>
      <p>Hello <strong>${safeLeaderName}</strong>,</p>
      <p><strong>${safeTeamMemberName}</strong> has accepted your invitation to join the project team.</p>
      <ul>
        <li><strong>Project:</strong> ${safeProjectTitle}</li>
        <li><strong>New Team Member:</strong> ${safeTeamMemberName}</li>
        <li><strong>Roll Number:</strong> ${safeRollNumber}</li>
        <li><strong>Department:</strong> ${safeDepartment}</li>
        <li><strong>Section:</strong> ${safeSection}</li>
      </ul>
      <p>Your team now has a new member.</p>
      <p>
        <a href="${projectLink}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 8px; font-weight: 600;">
          View Team Project
        </a>
      </p>
      <p>Regards,<br />Project Submission & Evaluation Portal</p>
    </div>
  `;

  try {
    const response = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM,
      to: [recipientEmail],
      subject: 'Team Member Accepted Your Project Invitation',
      text: textBody,
      html: htmlBody,
    });

    logger.info(`[EMAIL SERVICE] Team member acceptance email sent to ${recipientEmail}. Resend ID: ${response?.id || 'unknown'}`);
    return true;
  } catch (error) {
    logger.error(`[EMAIL SERVICE] Team member acceptance email failed for ${recipientEmail}: ${error.message}`);
    return false;
  }
};

module.exports = {
  sendTeamInvitationEmail,
  sendTeamMemberAcceptedEmail,
  sendFacultyAssignmentEmail,
  buildInvitationLink,
  buildProjectTeamLink,
};
