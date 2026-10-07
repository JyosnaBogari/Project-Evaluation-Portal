const fs = require('fs');
const crypto = require('crypto');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const TeamInvitation = require('../models/TeamInvitation');
const Deadline = require('../models/Deadline');
const Notification = require('../models/Notification');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { generatePresignedUrl } = require('../services/storageService');
const { sendEmailAlert } = require('../services/notificationService');
const { runPlagiarismCheck } = require('../services/plagiarismService');
const { getFacultyRecommendationsForProject } = require('../services/facultyRecommendationService');
const { sendFacultyAssignmentEmail } = require('../services/emailService');
const { getCohortId } = require('../utils/cohort');
const {
  algorithm,
  thresholds,
  results,
  comparisonFields,
} = require('../config/uniquenessConfig');

const normalizeText = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const buildProjectText = (project) => {
  if (!project) return '';
  return comparisonFields
    .map((field) => project[field])
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
};

const createTfIdfVectors = (documents) => {
  const vocab = new Set();
  documents.forEach((doc) => {
    const tokens = normalizeText(doc).split(/\s+/).filter(Boolean);
    tokens.forEach((token) => vocab.add(token));
  });

  const idf = {};
  const docTerms = documents.map((doc) => normalizeText(doc).split(/\s+/).filter(Boolean));

  vocab.forEach((term) => {
    const documentFrequency = docTerms.filter((terms) => terms.includes(term)).length;
    idf[term] = Math.log((documents.length + 1) / (documentFrequency + 1)) + 1;
  });

  const vectors = docTerms.map((terms) => {
    const tfMap = {};
    terms.forEach((term) => {
      tfMap[term] = (tfMap[term] || 0) + 1;
    });

    const vector = {};
    vocab.forEach((term) => {
      const termFrequency = tfMap[term] || 0;
      vector[term] = termFrequency * (idf[term] || 1);
    });

    return vector;
  });

  return { vocab: [...vocab], vectors, idf };
};

const calculateCosineSimilarity = (left, right) => {
  const terms = new Set([...Object.keys(left), ...Object.keys(right)]);
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  terms.forEach((term) => {
    const leftValue = left[term] || 0;
    const rightValue = right[term] || 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  });

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const determineSimilarityResult = (score) => {
  if (score <= thresholds.likelyUniqueMax) return results.likelyUnique;
  if (score <= thresholds.needsAttentionMax) return results.needsAttention;
  return results.highSimilarity;
};

const getSimilarityPercent = (score) => Math.round((score || 0) * 100);

// Request presigned/direct upload URL
const getUploadUrl = async (req, res, next) => {
  try {
    const { filename, fileType } = req.query;
    if (!filename || !fileType) {
      return next(new AppError('Filename and fileType are required in query parameters', 400));
    }

    const uploadData = generatePresignedUrl(filename, fileType);
    res.status(200).json({
      status: 'success',
      data: uploadData,
    });
  } catch (error) {
    next(error);
  }
};

// Create project proposal - Student only
const createProject = async (req, res, next) => {
  try {
    const {
      title,
      domain,
      abstract,
      problemStatement,
      objectives,
      methodology,
      technologies,
      expectedOutcome,
    } = req.body;
    const leaderId = req.user.id;

    // Validate user is a student
    if (req.user.role !== 'student') {
      return next(new AppError('Only students can create projects', 403));
    }

    const cohortId = getCohortId(req.user);
    if (!cohortId) {
      return next(new AppError('Your academic cohort is not configured. Contact an administrator to set your department, section, and batch before creating a project.', 400));
    }

    const proposalFields = {
      title,
      domain,
      abstract,
      problemStatement,
      objectives,
      methodology,
      technologies,
      expectedOutcome,
    };
    const fieldLimits = {
      title: 200,
      domain: 120,
      abstract: 3000,
      problemStatement: 5000,
      objectives: 5000,
      methodology: 5000,
      technologies: 1000,
      expectedOutcome: 5000,
    };

    for (const [field, value] of Object.entries(proposalFields)) {
      if (typeof value !== 'string' || !value.trim()) {
        return next(new AppError(`${field} is required`, 400));
      }
      if (value.trim().length > fieldLimits[field]) {
        return next(new AppError(`${field} cannot exceed ${fieldLimits[field]} characters`, 400));
      }
    }

    // Proposals have no deadline until a submission stage is configured.
    const existingProject = await Project.findOne({
      leader: leaderId,
      deadline: { $exists: false },
      status: { $ne: 'withdrawn' },
    });
    if (existingProject) {
      return next(new AppError('You already have a project proposal', 409));
    }

    const newProject = await Project.create({
      title: title.trim(),
      description: problemStatement.trim(),
      projectType: 'major_project',
      abstract: abstract.trim(),
      problemStatement: problemStatement.trim(),
      objectives: objectives.trim(),
      methodology: methodology.trim(),
      expectedOutcome: expectedOutcome.trim(),
      technologies: technologies.trim(),
      domain: domain.trim(),
      leader: leaderId,
      teamMembers: [leaderId],
      department: req.user.department || '',
      section: req.user.section,
      batch: req.user.batch,
      academicYear: req.user.academicYear,
      cohortId,
      status: 'proposal_created',
    });

    // Create ProjectMember record for leader
    await ProjectMember.create({
      project: newProject._id,
      user: leaderId,
      role: 'leader',
      invitationStatus: 'accepted',
      joinedAt: new Date(),
    });

    const populated = await Project.findById(newProject._id)
      .populate('leader', 'name email rollNumber department')
      .populate('teamMembers', 'name email rollNumber department')
      .populate('assignedFaculty', 'name email facultyId department')
      .populate('deadline', 'title batch submissionEndDate');

    res.status(201).json({
      status: 'success',
      project: populated,
    });
  } catch (error) {
    next(error);
  }
};

// Get my projects (student sees their projects, faculty sees assigned, admin sees all)
const getProjects = async (req, res, next) => {
  try {
    let query = {};

    if (req.user.role === 'student') {
      query.teamMembers = req.user.id;
    } else if (req.user.role === 'faculty') {
      query.assignedFaculty = req.user.id;
    }
    // Admin gets all projects (query is empty)

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const total = await Project.countDocuments(query);
    const projects = await Project.find(query)
      .populate('leader', 'name email rollNumber department')
      .populate('teamMembers', 'name email rollNumber department')
      .populate('assignedFaculty', 'name email facultyId department')
      .populate('deadline', 'title batch submissionEndDate submissionStartDate')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: 'success',
      projects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single project details
const getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('leader', 'name email rollNumber department')
      .populate('teamMembers', 'name email rollNumber department')
      .populate('assignedFaculty', 'name email facultyId department')
      .populate('deadline', 'title batch submissionEndDate submissionStartDate')
      .populate('plagiarismResult')
      .populate('evaluation');

    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    // Role-based restrictions
    if (req.user.role === 'student' && !project.teamMembers.some(m => m._id.toString() === req.user.id)) {
      return next(new AppError('You are not authorized to view this project', 403));
    }
    if (req.user.role === 'faculty' && project.assignedFaculty?._id?.toString() !== req.user.id) {
      return next(new AppError('You are not authorized to view this project', 403));
    }

    // Also fetch project members
    const members = await ProjectMember.find({ project: project._id })
      .populate('user', 'name email rollNumber department');

    res.status(200).json({
      status: 'success',
      project,
      members,
    });
  } catch (error) {
    next(error);
  }
};

// Update a proposal or a legacy draft (leader only)
const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    // Only leader can edit
    if (project.leader.toString() !== req.user.id) {
      return next(new AppError('Only the project leader can edit this project', 403));
    }

    if (!['proposal_created', 'draft'].includes(project.status)) {
      return next(new AppError('Only an unreviewed proposal or legacy draft can be edited', 400));
    }

    const leaderCohortId = getCohortId(req.user);
    if (!leaderCohortId) {
      return next(new AppError('Your academic cohort is not configured. Contact an administrator before editing this project.', 400));
    }
    if (project.cohortId && project.cohortId !== leaderCohortId) {
      return next(new AppError("The project cohort does not match the leader's current academic cohort. Contact an administrator.", 409));
    }
    project.cohortId = leaderCohortId;
    project.department = req.user.department;
    project.section = req.user.section;
    project.batch = req.user.batch;
    project.academicYear = req.user.academicYear;

    const editableFields = [
      'title', 'description', 'projectType', 'semester',
      'abstract', 'problemStatement', 'objectives', 'proposedSolution', 'methodology',
      'expectedOutcome', 'technologies', 'domain', 'keywords',
    ];
    editableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        project[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    });

    if (['proposal_created', 'draft'].includes(project.status)) {
      const requiredFields = [
        ['title', 200],
        ['domain', 120],
        ['abstract', 3000],
        ['problemStatement', 5000],
        ['objectives', 5000],
        ['methodology', 5000],
        ['technologies', 1000],
        ['expectedOutcome', 5000],
      ];
      for (const [field, maxLength] of requiredFields) {
        const value = project[field];
        if (typeof value !== 'string' || !value.trim()) {
          return next(new AppError(`${field} is required`, 400));
        }
        if (value.trim().length > maxLength) {
          return next(new AppError(`${field} cannot exceed ${maxLength} characters`, 400));
        }
      }
      project.description = project.problemStatement;
    }

    if (!project.title) {
      return next(new AppError('Project title is required', 400));
    }
    if (project.title.length > 200 || (project.abstract && project.abstract.length > 3000)) {
      return next(new AppError('Title must be at most 200 characters and abstract at most 3000 characters', 400));
    }

    await project.save();

    const populated = await Project.findById(project._id)
      .populate('leader', 'name email rollNumber department')
      .populate('teamMembers', 'name email rollNumber department')
      .populate('assignedFaculty', 'name email facultyId department')
      .populate('deadline', 'title batch submissionEndDate');

    res.status(200).json({
      status: 'success',
      project: populated,
    });
  } catch (error) {
    next(error);
  }
};

// Upload file to project (report/presentation/source)
const uploadProjectFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No file uploaded', 400));
    }

    const { purpose } = req.body;
    if (!purpose || !['report', 'presentation', 'source'].includes(purpose)) {
      // Clean up uploaded file
      if (req.file.path) fs.unlinkSync(req.file.path);
      return next(new AppError('File purpose must be one of: report, presentation, source', 400));
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return next(new AppError('Project not found', 404));
    }

    // Only leader can upload
    if (project.leader.toString() !== req.user.id) {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return next(new AppError('Only the project leader can upload files', 403));
    }

    if (['proposal_created', 'draft'].includes(project.status)) {
      if (req.file?.path) fs.unlinkSync(req.file.path);
      return next(new AppError('Document uploads are available only after project proposal approval', 400));
    }

    // Only DRAFT projects can receive file uploads
    if (project.status !== 'draft') {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return next(new AppError('Files can only be uploaded to DRAFT projects', 400));
    }

    // Validate file extension matches purpose
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const purposeExtMap = {
      report: ['pdf'],
      presentation: ['ppt', 'pptx'],
      source: ['zip'],
    };

    if (!purposeExtMap[purpose].includes(ext)) {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return next(new AppError(`Invalid file type for purpose "${purpose}". Expected: ${purposeExtMap[purpose].join(', ')}`, 400));
    }

    // Compute SHA-256 hash
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Create file URL
    const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
    const fileUrl = `${serverUrl}/uploads/${req.file.filename}`;

    // Remove previous file if replacing
    const fieldMap = {
      report: { url: 'reportUrl', hash: 'reportHash', name: 'reportName' },
      presentation: { url: 'pptUrl', hash: 'pptHash', name: 'pptName' },
      source: { url: 'codeZipUrl', hash: 'codeZipHash', name: 'codeZipName' },
    };

    const fields = fieldMap[purpose];

    // Delete old file from disk if it exists
    if (project.files[fields.url]) {
      const oldFilename = project.files[fields.url].split('/uploads/')[1];
      if (oldFilename) {
        const oldPath = require('path').join(__dirname, '../../uploads', oldFilename);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    }

    project.files[fields.url] = fileUrl;
    project.files[fields.hash] = fileHash;
    project.files[fields.name] = req.file.originalname;
    await project.save();

    res.status(200).json({
      status: 'success',
      url: fileUrl,
      hash: fileHash,
      originalName: req.file.originalname,
      size: req.file.size,
      purpose,
    });
  } catch (error) {
    next(error);
  }
};

const runUniquenessCheck = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }
    if (project.leader.toString() !== req.user.id) {
      return next(new AppError('Only the project leader can run a similarity check', 403));
    }

    const currentText = buildProjectText(project);
    if (!currentText.trim()) {
      return next(new AppError('Project proposal details are incomplete. Complete the required proposal fields before running the uniqueness check.', 400));
    }

    const candidateProjectsResult = await Project.find({
      _id: { $ne: project._id },
      status: { $nin: ['withdrawn', 'rejected'] },
      $or: [
        { title: { $exists: true } },
        { abstract: { $exists: true } },
        { domain: { $exists: true } },
      ],
    });
    const candidateProjects = Array.isArray(candidateProjectsResult)
      ? candidateProjectsResult
      : await candidateProjectsResult.select('_id title domain abstract problemStatement objectives methodology technologies expectedOutcome cohortId status');

    const eligibleProjects = candidateProjects.filter((candidate) => {
      if (!candidate || candidate._id.toString() === project._id.toString()) return false;
      const candidateText = buildProjectText(candidate);
      return candidateText && candidateText.trim().length > 0;
    });

    const documents = [currentText, ...eligibleProjects.map((candidate) => buildProjectText(candidate))];
    const { vectors } = createTfIdfVectors(documents);
    const projectVector = vectors[0];
    const matches = eligibleProjects
      .map((candidate, index) => {
        const candidateVector = vectors[index + 1];
        const similarity = calculateCosineSimilarity(projectVector, candidateVector);
        return {
          projectId: candidate._id,
          title: candidate.title,
          domain: candidate.domain,
          similarityScore: getSimilarityPercent(similarity),
        };
      })
      .filter((candidate) => candidate.similarityScore > 0)
      .sort((left, right) => right.similarityScore - left.similarityScore)
      .slice(0, 5);

    const overallScore = matches.length > 0 ? matches[0].similarityScore : 0;
    const result = determineSimilarityResult(overallScore);

    project.uniquenessCheck = {
      status: 'completed',
      checkedAt: new Date(),
      algorithm,
      overallScore,
      result,
      matches: matches.map((match) => ({
        projectId: match.projectId,
        title: match.title,
        domain: match.domain,
        similarityScore: match.similarityScore,
      })),
    };
    project.status = 'uniqueness_checked';
    await project.save();

    res.status(200).json({
      status: 'success',
      result: project.uniquenessCheck,
    });
  } catch (error) {
    next(error);
  }
};

const getFacultyReviewProjects = async (req, res, next) => {
  try {
    const filter = {
      status: { $in: ['uniqueness_checked', 'faculty_review', 'faculty_accepted', 'faculty_changes_requested'] },
    };

    if (req.user.role === 'faculty') {
      filter.assignedFaculty = req.user.id;
    }

    const projects = await Project.find(filter)
      .populate('leader', 'name email rollNumber department')
      .populate('teamMembers', 'name email rollNumber department')
      .populate('assignedFaculty', 'name email facultyId department')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      status: 'success',
      projects,
    });
  } catch (error) {
    next(error);
  }
};

const reviewProject = async (req, res, next) => {
  try {
    const { decision, facultyComment } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    if (!['faculty', 'admin'].includes(req.user.role)) {
      return next(new AppError('Only faculty or admin users can review projects', 403));
    }
    if (
      req.user.role === 'faculty'
      && project.assignedFaculty
      && project.assignedFaculty.toString() !== req.user.id
    ) {
      return next(new AppError('You are not assigned to review this project', 403));
    }
    if (!['accepted', 'changes_requested'].includes(decision)) {
      return next(new AppError('Decision must be either accepted or changes_requested', 400));
    }
    if (decision === 'changes_requested' && (!facultyComment || !String(facultyComment).trim())) {
      return next(new AppError('A faculty comment is required when requesting changes', 400));
    }

    project.reviewedBy = req.user.id;
    project.reviewedAt = new Date();
    project.reviewDecision = decision;
    project.facultyComment = facultyComment ? String(facultyComment).trim() : '';
    project.status = decision === 'accepted' ? 'faculty_accepted' : 'faculty_changes_requested';
    await project.save();

    res.status(200).json({
      status: 'success',
      message: decision === 'accepted' ? 'Project accepted for the next stage.' : 'Changes requested from the student team.',
      project,
    });
  } catch (error) {
    next(error);
  }
};

// Submit project (changes status from DRAFT to SUBMITTED)
const submitProject = async (req, res, next) => {
  try {
    let projectId = req.params.id || req.body.projectId;
    let project;

    if (!projectId) {
      return next(new AppError('Create a project proposal before starting a submission stage', 400));
    }

    if (projectId) {
      project = await Project.findById(projectId);
      if (!project) {
        return next(new AppError('Project not found', 404));
      }

      // Only leader can submit
      if (project.leader.toString() !== req.user.id) {
        return next(new AppError('Only the project leader can submit this project', 403));
      }

      if (project.status === 'withdrawn') {
        return next(new AppError('Cannot submit a withdrawn project', 400));
      }

      if (['proposal_created', 'draft'].includes(project.status)) {
        return next(new AppError('Project submission is available only after proposal review and approval', 400));
      }

      if (project.status === 'evaluated') {
        return next(new AppError('Project has already been evaluated', 400));
      }

      // Must be in DRAFT status
      if (project.status !== 'draft') {
        return next(new AppError('Project can only be submitted from DRAFT status', 400));
      }
    }

    // Validate deadline
    const deadline = await Deadline.findById(project.deadline);
    if (!deadline) {
      return next(new AppError('Project deadline not found', 404));
    }
    if (!deadline.isActive) {
      return next(new AppError('Deadline is no longer active', 400));
    }
    const now = new Date();
    if (now < new Date(deadline.submissionStartDate)) {
      return next(new AppError('Submission window has not opened yet', 400));
    }
    if (now > new Date(deadline.submissionEndDate)) {
      return next(new AppError('Submission deadline has passed', 400));
    }

    if (!project.title?.trim() || !project.abstract?.trim()) {
      return next(new AppError('Project title and abstract are required before submission', 400));
    }

    const pendingInvitation = await TeamInvitation.findOne({
      project: project._id,
      status: 'pending',
      expiresAt: { $gt: now },
    });
    if (pendingInvitation) {
      return next(new AppError('Resolve pending team invitations before submitting the project', 400));
    }

    const acceptedMembers = await ProjectMember.countDocuments({
      project: project._id,
      user: { $in: project.teamMembers },
      invitationStatus: 'accepted',
    });
    if (acceptedMembers !== project.teamMembers.length) {
      return next(new AppError('Project team membership is incomplete. Refresh the team and try again.', 400));
    }

    // Validate all three files are uploaded
    if (!project.files.reportUrl) {
      return next(new AppError('Project report (PDF) is required before submission', 400));
    }
    if (!project.files.pptUrl) {
      return next(new AppError('Project presentation (PPT/PPTX) is required before submission', 400));
    }
    if (!project.files.codeZipUrl) {
      return next(new AppError('Project source code (ZIP) is required before submission', 400));
    }

    // Run plagiarism check
    const plagiarismResult = await runPlagiarismCheck(project._id);
    if (plagiarismResult) {
      project.plagiarismResult = plagiarismResult._id;
      project.plagiarismScore = plagiarismResult.similarityScore;
    }

    // Update status
    project.status = 'submitted';
    project.submittedAt = now;
    await project.save();

    // Notify team members
    const teamMembers = await User.find({ _id: { $in: project.teamMembers } });
    for (const member of teamMembers) {
      await Notification.create({
        recipient: member._id,
        type: 'project_submitted',
        title: 'Project Submitted',
        message: `Project "${project.title}" has been submitted successfully.`,
        relatedProject: project._id,
      });
    }

    // Email alert (won't fail if email is disabled)
    const teamEmails = teamMembers.map(u => u.email);
    await sendEmailAlert(
      teamEmails.join(','),
      `Project Submitted: ${project.title}`,
      `Your project "${project.title}" has been successfully submitted.`,
      `<h3>Submission Confirmation</h3><p>Your project <b>${project.title}</b> was recorded at ${now.toLocaleString()}.</p>`
    );

    const populated = await Project.findById(project._id)
      .populate('leader', 'name email rollNumber department')
      .populate('teamMembers', 'name email rollNumber department')
      .populate('deadline', 'title batch submissionEndDate')
      .populate('plagiarismResult');

    res.status(200).json({
      status: 'success',
      project: populated,
    });
  } catch (error) {
    next(error);
  }
};

// Withdraw project (student leader only)
const withdrawProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    if (project.leader.toString() !== req.user.id) {
      return next(new AppError('Only the project leader can withdraw this project', 403));
    }

    if (project.status === 'evaluated') {
      return next(new AppError('Evaluated projects cannot be withdrawn', 400));
    }

    if (project.status === 'withdrawn') {
      return next(new AppError('Project is already withdrawn', 400));
    }

    project.status = 'withdrawn';
    await project.save();

    // Notify team members
    const teamMembers = await User.find({ _id: { $in: project.teamMembers } });
    for (const member of teamMembers) {
      await Notification.create({
        recipient: member._id,
        type: 'project_status',
        title: 'Project Withdrawn',
        message: `Project "${project.title}" has been withdrawn by the leader.`,
        relatedProject: project._id,
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Project withdrawn successfully',
      project,
    });
  } catch (error) {
    next(error);
  }
};

// Get active deadlines for student
const getStudentDeadlines = async (req, res, next) => {
  try {
    const deadlines = await Deadline.find({ isActive: true }).sort({ submissionEndDate: 1 });
    res.status(200).json({
      status: 'success',
      deadlines,
    });
  } catch (error) {
    next(error);
  }
};

// Get all student users (for team member reference)
const getStudents = async (req, res, next) => {
  try {
    const searchTerm = (req.query.q || '').trim();
    const query = { role: 'student' };

    if (searchTerm) {
      const safeTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: safeTerm, $options: 'i' } },
        { email: { $regex: safeTerm, $options: 'i' } },
        { rollNumber: { $regex: safeTerm, $options: 'i' } },
      ];
    }

    const students = await User.find(query)
      .select('name email rollNumber department')
      .sort({ name: 1 });

    res.status(200).json({
      status: 'success',
      users: students,
    });
  } catch (error) {
    next(error);
  }
};

const getProjectFacultyRecommendations = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('leader', 'name department section batch');

    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    const facultyUsers = await User.find({
      role: 'faculty',
      isActive: { $ne: false },
    }).sort({ name: 1 });

    const recommendations = getFacultyRecommendationsForProject(project, facultyUsers);

    res.status(200).json({
      status: 'success',
      data: recommendations,
    });
  } catch (error) {
    next(error);
  }
};

const assignFacultyToProject = async (req, res, next) => {
  try {
    const { facultyId } = req.body;

    if (!facultyId) {
      return next(new AppError('facultyId is required', 400));
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    const faculty = await User.findById(facultyId);
    if (!faculty || faculty.role !== 'faculty') {
      return next(new AppError('Invalid faculty account ID', 400));
    }

    if (faculty.isActive === false) {
      return next(new AppError('This faculty member is inactive and cannot be assigned', 400));
    }

    const availabilityStatus = faculty.availability || faculty.facultyProfile?.availability || 'available';
    if (availabilityStatus === 'unavailable') {
      return next(new AppError('This faculty member is marked unavailable', 400));
    }

    const currentLoad = Number(faculty.assignedProjectCount ?? faculty.currentProjects ?? faculty.facultyProfile?.currentProjects ?? 0);
    const maxProjects = Number(faculty.facultyProfile?.maxProjects || faculty.maxProjects || 6);
    if (currentLoad >= maxProjects) {
      return next(new AppError('This faculty member has reached maximum project capacity', 400));
    }

    const recommendations = getFacultyRecommendationsForProject(project, [faculty]);
    if (!recommendations.length) {
      return next(new AppError('This faculty member is not a valid project guide for the current project', 400));
    }

    project.assignedFaculty = faculty._id;
    project.status = 'faculty_review';
    project.facultyAssignedAt = new Date();
    project.facultyAssignedBy = req.user.id;
    await project.save();

    await Notification.create({
      recipient: faculty._id,
      type: 'faculty_assigned',
      title: 'New Project Assigned',
      message: `You have been assigned as the faculty guide for "${project.title}".`,
      relatedProject: project._id,
    });

    const leader = await User.findById(project.leader);
    if (leader) {
      await Notification.create({
        recipient: leader._id,
        type: 'project_status',
        title: 'Faculty Guide Assigned',
        message: `Faculty ${faculty.name} has been assigned as the guide for project "${project.title}".`,
        relatedProject: project._id,
      });
    }

    await sendFacultyAssignmentEmail({
      recipientEmail: faculty.email,
      facultyName: faculty.name,
      projectTitle: project.title,
      teamLeaderName: leader ? leader.name : 'Project Team Leader',
      department: project.department || leader?.department || faculty.department,
      section: project.section || leader?.section || 'Not specified',
    });

    const populated = await Project.findById(project._id)
      .populate('leader', 'name email rollNumber department')
      .populate('teamMembers', 'name email rollNumber department')
      .populate('assignedFaculty', 'name email facultyId department availability facultyProfile')
      .populate('deadline', 'title batch submissionEndDate');

    res.status(200).json({
      status: 'success',
      message: 'Faculty assigned successfully',
      project: populated,
      recommendation: recommendations[0],
    });
  } catch (error) {
    next(error);
  }
};

// Assign reviewer (Admin only)
const assignReviewer = async (req, res, next) => {
  try {
    const { projectId, facultyId } = req.body;

    if (!projectId || !facultyId) {
      return next(new AppError('projectId and facultyId are required', 400));
    }

    const project = await Project.findById(projectId);
    if (!project) return next(new AppError('Project not found', 404));

    const faculty = await User.findById(facultyId);
    if (!faculty || faculty.role !== 'faculty') {
      return next(new AppError('Invalid faculty reviewer account ID', 400));
    }

    project.assignedFaculty = facultyId;
    project.status = 'under_review';
    await project.save();

    // Notify faculty
    await Notification.create({
      recipient: facultyId,
      type: 'faculty_assigned',
      title: 'Project Assigned for Review',
      message: `You have been assigned to evaluate project "${project.title}".`,
      relatedProject: project._id,
    });

    // Notify leader
    await Notification.create({
      recipient: project.leader,
      type: 'faculty_assigned',
      title: 'Faculty Reviewer Assigned',
      message: `Faculty ${faculty.name} has been assigned to review your project "${project.title}".`,
      relatedProject: project._id,
    });

    // Email alert
    await sendEmailAlert(
      faculty.email,
      `Project Assigned for Evaluation: ${project.title}`,
      `You have been assigned to evaluate the student project: "${project.title}".`,
      `<p>You have a pending grading evaluation for <b>${project.title}</b>.</p>`
    );

    const populated = await Project.findById(project._id)
      .populate('leader', 'name email rollNumber department')
      .populate('teamMembers', 'name email rollNumber department')
      .populate('assignedFaculty', 'name email facultyId department')
      .populate('deadline', 'title batch submissionEndDate');

    res.status(200).json({
      status: 'success',
      message: 'Reviewer assigned successfully',
      project: populated,
    });
  } catch (error) {
    next(error);
  }
};

// Local direct upload handler (fallback when Cloudinary unavailable)
const localUploadDirect = (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No file uploaded', 400));
    }

    const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
    const fileUrl = `${serverUrl}/uploads/${req.file.filename}`;

    const fileBuffer = fs.readFileSync(req.file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    res.status(200).json({
      status: 'success',
      url: fileUrl,
      hash: fileHash,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  getUploadUrl,
  createProject,
  submitProject,
  withdrawProject,
  getStudentDeadlines,
  getProjects,
  getProjectById,
  updateProject,
  uploadProjectFile,
  getStudents,
  assignReviewer,
  localUploadDirect,
  runUniquenessCheck,
  getFacultyReviewProjects,
  reviewProject,
  getProjectFacultyRecommendations,
  assignFacultyToProject,
};