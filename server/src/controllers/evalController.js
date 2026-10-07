const Evaluation = require('../models/Evaluation');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { sendEmailAlert } = require('../services/notificationService');

// Submit / Update evaluation for a project phase
const submitEvaluation = async (req, res, next) => {
  try {
    const { projectId, phase, scores, feedback, isPublished } = req.body;
    const evaluatorId = req.user.id;

    if (!projectId || !phase || !scores || !scores.length) {
      return next(new AppError('Missing required evaluation data', 400));
    }

    if (!['abstract', 'midterm', 'final'].includes(phase)) {
      return next(new AppError('Invalid evaluation phase milestone', 400));
    }

    // Verify Project
    const project = await Project.findById(projectId).populate('teamMembers', 'name email');
    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    // Faculty check - must be assigned to this project, or be an admin
    if (req.user.role === 'faculty' && project.assignedFaculty?.toString() !== evaluatorId) {
      return next(new AppError('You are not authorized to grade this project', 403));
    }

    // Server-side dynamic calculation of total score
    let calculatedTotal = 0;
    scores.forEach(s => {
      calculatedTotal += Number(s.scoredMarks);
    });

    // Check if evaluation already exists for this project + phase (Milestone Lock)
    let evaluation = await Evaluation.findOne({ projectId, phase });

    if (evaluation) {
      // Update existing record
      evaluation.evaluatorId = evaluatorId;
      evaluation.scores = scores;
      evaluation.totalScore = calculatedTotal;
      evaluation.feedback = feedback || '';
      evaluation.isPublished = isPublished !== undefined ? isPublished : evaluation.isPublished;
      evaluation.evaluatedAt = Date.now();
      await evaluation.save();
    } else {
      // Create new evaluation
      evaluation = await Evaluation.create({
        projectId,
        evaluatorId,
        phase,
        scores,
        totalScore: calculatedTotal,
        feedback: feedback || '',
        isPublished: isPublished !== undefined ? isPublished : false,
      });
    }

    // Update project overall status if phase is final and published
    if (isPublished) {
      if (phase === 'final') {
        project.status = 'evaluated';
        project.evaluation = evaluation._id;
      } else {
        project.status = 'under_review';
      }
      await project.save();

      // Create in-app notifications for team members
      for (const member of project.teamMembers) {
        await Notification.create({
          recipient: member._id || member,
          type: 'evaluation_published',
          title: `Evaluation Published: ${phase.toUpperCase()} Phase`,
          message: `Your evaluation results for "${project.title}" (${phase} phase) have been published. Total Score: ${calculatedTotal}`,
          relatedProject: project._id,
        });
      }

      // Trigger Alert Notification to team members
      const teamEmails = project.teamMembers.map(m => m.email).filter(Boolean);
      if (teamEmails.length > 0) {
        await sendEmailAlert(
          teamEmails.join(','),
          `New Evaluation Published: ${phase.toUpperCase()} Phase`,
          `Your evaluation results for phase "${phase.toUpperCase()}" have been published by the reviewer. Total Score: ${calculatedTotal}`,
          `<p>Your evaluation for <b>${project.title}</b> (${phase}) has been released.</p><b>Total Score: ${calculatedTotal}</b>`
        );
      }
    }

    res.status(200).json({
      status: 'success',
      evaluation,
    });
  } catch (error) {
    next(error);
  }
};

// List evaluations visible to the current user
const getAllEvaluations = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role === 'student') {
      const studentProjectIds = await Project.find({ teamMembers: req.user.id }).distinct('_id');
      query.projectId = { $in: studentProjectIds };
      query.isPublished = true;
    } else if (req.user.role === 'faculty') {
      const facultyProjectIds = await Project.find({ assignedFaculty: req.user.id }).distinct('_id');
      query.projectId = { $in: facultyProjectIds };
    }

    const evaluations = await Evaluation.find(query)
      .populate({ path: 'projectId', select: 'title teamMembers assignedFaculty status' })
      .populate('evaluatorId', 'name email department')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      status: 'success',
      evaluations,
    });
  } catch (error) {
    next(error);
  }
};

// Query evaluations by Project
const getEvaluationsByProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    // RBAC: Students can only view their own projects' evaluations, faculty/admin can view all
    if (req.user.role === 'student' && !project.teamMembers.some(m => m.toString() === req.user.id)) {
      return next(new AppError('You are not authorized to view these evaluations', 403));
    }

    const query = { projectId };
    // Students only view published marks
    if (req.user.role === 'student') {
      query.isPublished = true;
    }

    const evaluations = await Evaluation.find(query)
      .populate('evaluatorId', 'name email department')
      .sort({ phase: 1 });

    res.status(200).json({
      status: 'success',
      evaluations,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitEvaluation,
  getAllEvaluations,
  getEvaluationsByProject,
};
