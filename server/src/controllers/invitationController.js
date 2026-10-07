const TeamInvitation = require('../models/TeamInvitation');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Notification = require('../models/Notification');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const { getCohortId, formatCohort } = require('../utils/cohort');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectIdLike = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);

// Send team invitation (leader only)
const sendInvitation = async (req, res, next) => {
  try {
    const { projectId, email, studentIdentifier } = req.body;
    const inviterId = req.user.id;
    const identifier = (email || studentIdentifier || '').trim();

    if (!projectId || !identifier) {
      return next(new AppError('projectId and a student identifier are required', 400));
    }

    // Find project and verify leader
    const project = await Project.findById(projectId);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }
    if (project.leader.toString() !== inviterId) {
      return next(new AppError('Only the project leader can send invitations', 403));
    }
    if (!['proposal_created', 'draft'].includes(project.status)) {
      return next(new AppError('Invitations can only be sent for active proposal or draft projects', 400));
    }

    const leaderCohortId = getCohortId(req.user);
    if (!leaderCohortId) {
      return next(new AppError('Your academic cohort is not configured. Contact an administrator to set your department, section, and batch.', 400));
    }
    if (!project.cohortId) {
      project.cohortId = leaderCohortId;
      project.department = req.user.department;
      project.section = req.user.section;
      project.batch = req.user.batch;
      project.academicYear = req.user.academicYear;
      await project.save();
    } else if (project.cohortId !== leaderCohortId) {
      return next(new AppError("The project cohort does not match the leader's current academic cohort. Contact an administrator.", 409));
    }

    const normalizedIdentifier = identifier.toLowerCase();
    const invitee = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { officialCollegeEmail: normalizedIdentifier },
        { rollNumber: { $regex: `^${escapeRegex(normalizedIdentifier)}$`, $options: 'i' } },
        { name: { $regex: `^${escapeRegex(normalizedIdentifier)}$`, $options: 'i' } },
      ],
      role: 'student',
    });

    if (!invitee) {
      return next(new AppError('No matching student was found for the provided roll number, name, or email.', 404));
    }

    // Validate invitee
    if (invitee.role !== 'student') {
      return next(new AppError('Only students can be invited as team members', 400));
    }
    if (invitee._id.toString() === inviterId) {
      return next(new AppError('You cannot invite yourself', 400));
    }

    const inviteeCohortId = getCohortId(invitee);
    if (!inviteeCohortId) {
      return next(new AppError('This student’s academic cohort is not configured. Contact an administrator to update their department, section, and batch.', 400));
    }
    if (inviteeCohortId !== leaderCohortId) {
      return next(new AppError(`This student belongs to ${formatCohort(invitee)}. Team members must belong to the same cohort (${formatCohort(req.user)}).`, 403));
    }

    // Check if already a team member
    if (project.teamMembers.some(m => m.toString() === invitee._id.toString())) {
      return next(new AppError('This user is already a team member', 409));
    }

    // Check for existing active invitation
    const existingInvitation = await TeamInvitation.findOne({
      project: projectId,
      invitedUser: invitee._id,
      status: 'pending',
    });
    if (existingInvitation) {
      return next(new AppError('An active invitation already exists for this user', 409));
    }

    // Check if user is already in another project for the same deadline
    const existingMembership = await ProjectMember.findOne({ user: invitee._id });
    if (existingMembership) {
      const otherProject = await Project.findOne({
        _id: existingMembership.project,
        deadline: project.deadline,
      });
      if (otherProject) {
        return next(new AppError('This student is already part of another project for this deadline', 409));
      }
    }

    // Create invitation
    const token = TeamInvitation.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await TeamInvitation.create({
      project: projectId,
      invitedBy: inviterId,
      invitedUser: invitee._id,
      email: invitee.email,
      token,
      status: 'pending',
      expiresAt,
    });

    // Create notification for invitee
    await Notification.create({
      recipient: invitee._id,
      type: 'team_invitation',
      title: 'Team Invitation',
      message: `You have been invited to join the project "${project.title}" by ${req.user.name}.`,
      relatedProject: projectId,
    });

    // Send transactional email with a safe fallback that never breaks the invitation itself.
    const emailSent = await emailService.sendTeamInvitationEmail({
      recipientEmail: invitee.email,
      recipientName: invitee.name,
      inviterName: req.user.name,
      projectTitle: project.title,
      token,
      department: project.department || invitee.department || req.user.department,
      section: project.section || invitee.section || req.user.section,
    });

    if (!emailSent) {
      logger.warn(`[INVITATION] Invitation created for ${invitee.email} but the email delivery failed or was skipped.`);
    }

    await invitation.populate('invitedUser', 'name email rollNumber department');

    res.status(201).json({
      status: 'success',
      message: 'Invitation sent successfully',
      invitation,
      emailStatus: emailSent ? 'sent' : 'failed',
    });
  } catch (error) {
    next(error);
  }
};

// Get invitations received by current user
const getMyInvitations = async (req, res, next) => {
  try {
    const invitations = await TeamInvitation.find({
      invitedUser: req.user.id,
    })
      .populate('project', 'title description status')
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 });

    // Expire old invitations
    const now = new Date();
    for (const inv of invitations) {
      if (inv.status === 'pending' && new Date(inv.expiresAt) < now) {
        inv.status = 'expired';
        await inv.save();
      }
    }

    res.status(200).json({
      status: 'success',
      invitations,
    });
  } catch (error) {
    next(error);
  }
};

// Get invitations sent by current user (as leader)
const getLeaderInvitations = async (req, res, next) => {
  try {
    const invitations = await TeamInvitation.find({
      invitedBy: req.user.id,
    })
      .populate('project', 'title description status')
      .populate('invitedUser', 'name email rollNumber department')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      invitations,
    });
  } catch (error) {
    next(error);
  }
};

const searchEligibleStudents = async (req, res, next) => {
  try {
    const { projectId, query = '' } = req.query;
    if (!projectId || query.trim().length < 2) {
      return res.status(200).json({ status: 'success', students: [], ineligibleStudents: [] });
    }

    const project = await Project.findById(projectId);
    if (!project) return next(new AppError('Project not found', 404));
    if (project.leader.toString() !== req.user.id) {
      return next(new AppError('Only the project leader can search for team members', 403));
    }
    if (!['proposal_created', 'draft'].includes(project.status)) {
      return next(new AppError('Students can only be searched for active proposal or draft projects', 400));
    }

    const leaderCohortId = getCohortId(req.user);
    if (!leaderCohortId) {
      return next(new AppError('Your academic cohort is not configured. Contact an administrator.', 400));
    }
    if (!project.cohortId) {
      project.cohortId = leaderCohortId;
      project.department = req.user.department;
      project.section = req.user.section;
      project.batch = req.user.batch;
      project.academicYear = req.user.academicYear;
      await project.save();
    } else if (project.cohortId !== leaderCohortId) {
      return next(new AppError('The project cohort does not match the leader’s current academic cohort.', 409));
    }

    const escapedQuery = escapeRegex(query.trim());
    const baseMatchFilter = {
      role: 'student',
      _id: { $nin: [req.user._id, ...(project.teamMembers || [])] },
      $or: [
        { name: { $regex: escapedQuery, $options: 'i' } },
        { email: { $regex: escapedQuery, $options: 'i' } },
        { officialCollegeEmail: { $regex: escapedQuery, $options: 'i' } },
        { rollNumber: { $regex: escapedQuery, $options: 'i' } },
      ],
    };

    const eligibleQuery = { ...baseMatchFilter, cohortId: leaderCohortId };
    const eligibleResult = await User.find(eligibleQuery);
    const eligibleStudentsRaw = Array.isArray(eligibleResult)
      ? eligibleResult
      : await eligibleResult
          .select('name email officialCollegeEmail rollNumber department section batch cohortId')
          .sort({ name: 1 })
          .limit(20);

    const eligibleStudents = eligibleStudentsRaw.filter((student) => {
      const candidateCohortId = getCohortId(student);
      return !candidateCohortId || candidateCohortId === leaderCohortId;
    });

    let ineligibleStudents = [];
    if (eligibleStudents.length === 0) {
      const candidateResults = await User.find(baseMatchFilter);
      const candidateMatches = Array.isArray(candidateResults)
        ? candidateResults
        : await candidateResults
            .select('name email officialCollegeEmail rollNumber department section batch cohortId')
            .sort({ name: 1 })
            .limit(20);

      ineligibleStudents = candidateMatches
        .filter((student) => {
          const candidateCohortId = getCohortId(student);
          return candidateCohortId && candidateCohortId !== leaderCohortId;
        })
        .map((student) => {
          const candidateCohortId = getCohortId(student);
          return {
            ...(student.toObject ? student.toObject() : student),
            eligible: false,
            reason: `Student belongs to ${formatCohort(student)}. Team members must belong to the same cohort as the project leader (${formatCohort(req.user)}).`,
          };
        });
    }

    res.status(200).json({
      status: 'success',
      students: eligibleStudents.map((student) => (student.toObject ? student.toObject() : student)),
      ineligibleStudents,
    });
  } catch (error) {
    next(error);
  }
};

// Accept invitation
const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;

    const invitationResult = await TeamInvitation.findOne({ token });
    const invitation = invitationResult && typeof invitationResult.populate === 'function'
      ? await invitationResult
          .populate('project')
          .populate('invitedBy', 'name email')
      : invitationResult;

    if (!invitation) {
      return next(new AppError('Invitation not found', 404));
    }

    if (invitation.project && !invitation.project._id && invitation.project.id) {
      invitation.project._id = invitation.project.id;
    }
    if (invitation.invitedBy && !invitation.invitedBy._id && invitation.invitedBy.id) {
      invitation.invitedBy._id = invitation.invitedBy.id;
    }

    // Verify the accepting user is the invitee
    if (invitation.invitedUser.toString() !== req.user.id) {
      return next(new AppError('You are not authorized to accept this invitation', 403));
    }

    if (invitation.status !== 'pending') {
      return next(new AppError(`Invitation has already been ${invitation.status}`, 400));
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      return next(new AppError('This invitation has expired', 400));
    }

    const project = await Project.findById(invitation.project._id || invitation.project);
    if (!project) {
      return next(new AppError('Project no longer exists', 404));
    }
    if (!['proposal_created', 'draft'].includes(project.status)) {
      return next(new AppError('This project can no longer accept new members', 400));
    }

    const inviteeCohortId = getCohortId(req.user);
    if (!project.cohortId || !inviteeCohortId) {
      return next(new AppError('Your academic cohort or project cohort is not configured. Contact an administrator.', 400));
    }
    if (inviteeCohortId !== project.cohortId) {
      return next(new AppError(`You belong to ${inviteeCohortId}, but this project is for cohort ${project.cohortId}.`, 403));
    }

    const existingMembership = await ProjectMember.findOne({ user: req.user.id });
    if (existingMembership) {
      const otherProject = await Project.findOne({
        _id: existingMembership.project,
        deadline: project.deadline,
      });
      if (otherProject && otherProject._id.toString() !== project._id.toString()) {
        return next(new AppError('You are already part of another project for this deadline', 409));
      }
    }

    if (project.teamMembers.some(memberId => memberId.toString() === req.user.id)) {
      return next(new AppError('This student is already a team member', 409));
    }

    // Accept invitation
    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    await invitation.save();

    // Create ProjectMember
    await ProjectMember.create({
      project: invitation.project._id,
      user: req.user.id,
      role: 'member',
      invitationStatus: 'accepted',
      joinedAt: new Date(),
    });

    // Add to Project.teamMembers array
    if (project.teamMembers && Array.isArray(project.teamMembers)) {
      if (!project.teamMembers.some(memberId => String(memberId) === String(req.user.id))) {
        project.teamMembers.push(req.user.id);
      }
      if (typeof project.save === 'function') {
        await project.save();
      }
    } else if (isObjectIdLike(String(invitation.project._id || invitation.project))) {
      await Project.findByIdAndUpdate(invitation.project._id, {
        $addToSet: { teamMembers: req.user.id },
      });
    }

    // Notify leader
    await Notification.create({
      recipient: invitation.invitedBy._id,
      type: 'invitation_accepted',
      title: 'Invitation Accepted',
      message: `${req.user.name} has accepted the invitation to join "${invitation.project.title}".`,
      relatedProject: invitation.project._id,
    });

    const leaderRef = invitation.invitedBy?._id || invitation.invitedBy || invitation.invitedById;
    const projectLeader = isObjectIdLike(String(leaderRef))
      ? await User.findById(leaderRef)
      : invitation.invitedBy;

    const acceptanceEmailSent = await emailService.sendTeamMemberAcceptedEmail({
      recipientEmail: projectLeader?.email,
      leaderName: projectLeader?.name || 'Project Team Leader',
      projectTitle: invitation.project.title,
      teamMemberName: req.user.name,
      rollNumber: req.user.rollNumber,
      department: req.user.department,
      section: req.user.section,
    });

    if (!acceptanceEmailSent) {
      logger.warn('[EMAIL SERVICE] Team member acceptance email failed, but team membership and invitation update were kept successful.');
    }

    res.status(200).json({
      status: 'success',
      message: 'Invitation accepted. You are now a team member.',
    });
  } catch (error) {
    next(error);
  }
};

// Reject invitation
const rejectInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;

    const invitation = await TeamInvitation.findOne({ token })
      .populate('project')
      .populate('invitedBy', 'name email');

    if (!invitation) {
      return next(new AppError('Invitation not found', 404));
    }

    if (invitation.invitedUser.toString() !== req.user.id) {
      return next(new AppError('You are not authorized to reject this invitation', 403));
    }

    if (invitation.status !== 'pending') {
      return next(new AppError(`Invitation has already been ${invitation.status}`, 400));
    }

    invitation.status = 'rejected';
    invitation.rejectedAt = new Date();
    await invitation.save();

    // Notify leader
    await Notification.create({
      recipient: invitation.invitedBy._id,
      type: 'invitation_rejected',
      title: 'Invitation Rejected',
      message: `${req.user.name} has rejected the invitation to join "${invitation.project.title}".`,
      relatedProject: invitation.project._id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Invitation rejected.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendInvitation,
  getMyInvitations,
  getLeaderInvitations,
  searchEligibleStudents,
  acceptInvitation,
  rejectInvitation,
};
