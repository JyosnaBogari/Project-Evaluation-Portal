const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true,
    maxlength: [200, 'Project title cannot exceed 200 characters'],
  },
  projectType: {
    type: String,
    enum: ['mini_project', 'major_project', 'other'],
    default: 'major_project',
  },
  academicYear: { type: String, trim: true, maxlength: 20 },
  semester: { type: String, trim: true, maxlength: 40 },
  batch: { type: String, trim: true, maxlength: 80 },
  section: { type: String, trim: true, maxlength: 40 },
  cohortId: { type: String, trim: true, index: true },
  abstract: { type: String, trim: true, maxlength: 3000 },
  problemStatement: { type: String, trim: true, maxlength: 5000 },
  objectives: { type: String, trim: true, maxlength: 5000 },
  proposedSolution: { type: String, trim: true, maxlength: 5000 },
  methodology: { type: String, trim: true, maxlength: 5000 },
  expectedOutcome: { type: String, trim: true, maxlength: 5000 },
  technologies: { type: String, trim: true, maxlength: 1000 },
  domain: { type: String, trim: true, maxlength: 120 },
  keywords: { type: String, trim: true, maxlength: 500 },
  description: {
    type: String,
    required: [true, 'Project description is required'],
    maxlength: 5000,
  },
  leader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Project leader is required'],
    index: true,
  },
  teamMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  assignedFaculty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  facultyAssignedAt: {
    type: Date,
  },
  facultyAssignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  deadline: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deadline',
  },
  status: {
    type: String,
    enum: [
      'proposal_created',
      'draft',
      'uniqueness_checked',
      'faculty_review',
      'faculty_accepted',
      'faculty_changes_requested',
      'submitted',
      'under_review',
      'revision_required',
      'resubmitted',
      'evaluated',
      'approved',
      'rejected',
      'withdrawn',
    ],
    default: 'proposal_created',
  },
  uniquenessCheck: {
    status: {
      type: String,
      enum: ['not_checked', 'checking', 'completed', 'failed'],
      default: 'not_checked',
    },
    checkedAt: Date,
    algorithm: { type: String, default: 'TF-IDF + Cosine Similarity' },
    overallScore: { type: Number, default: 0 },
    result: {
      type: String,
      enum: ['likely_unique', 'needs_attention', 'high_similarity'],
      default: 'likely_unique',
    },
    matches: [{
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
      title: { type: String, trim: true },
      domain: { type: String, trim: true },
      similarityScore: Number,
    }],
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewedAt: Date,
  reviewDecision: {
    type: String,
    enum: ['accepted', 'changes_requested'],
  },
  facultyComment: {
    type: String,
    trim: true,
    maxlength: 2000,
  },
  files: {
    reportUrl: { type: String, default: '' },
    reportHash: { type: String, default: '' },
    reportName: { type: String, default: '' },
    pptUrl: { type: String, default: '' },
    pptHash: { type: String, default: '' },
    pptName: { type: String, default: '' },
    codeZipUrl: { type: String, default: '' },
    codeZipHash: { type: String, default: '' },
    codeZipName: { type: String, default: '' },
  },
  plagiarismScore: {
    type: Number,
    default: 0,
  },
  plagiarismResult: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlagiarismResult',
  },
  evaluation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evaluation',
  },
  submittedAt: {
    type: Date,
  },
  cohort: {
    type: String,
    trim: true,
  },
  department: {
    type: String,
    trim: true,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for members pointing to teamMembers
ProjectSchema.virtual('members').get(function () {
  return this.teamMembers;
});

// Index for leader project lookup
ProjectSchema.index({ leader: 1, deadline: 1 }, { unique: true });

// Index for faculty project lookup
ProjectSchema.index({ assignedFaculty: 1, status: 1 });

module.exports = mongoose.model('Project', ProjectSchema);
