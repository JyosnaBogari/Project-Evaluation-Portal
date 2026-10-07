const test = require('node:test');
const assert = require('node:assert/strict');

const projectController = require('../src/controllers/projectController');
const invitationController = require('../src/controllers/invitationController');
const Project = require('../src/models/Project');
const User = require('../src/models/User');
const TeamInvitation = require('../src/models/TeamInvitation');
const ProjectMember = require('../src/models/ProjectMember');
const Notification = require('../src/models/Notification');

const originalProjectFindById = Project.findById;
const originalProjectFind = Project.find;
const originalProjectFindOne = Project.findOne;
const originalUserFindById = User.findById;
const originalUserFindOne = User.findOne;
const originalTeamInvitationFindOne = TeamInvitation.findOne;
const originalProjectMemberFindOne = ProjectMember.findOne;
const originalProjectMemberCreate = ProjectMember.create;
const originalNotificationCreate = Notification.create;

async function withPatchedModels(run) {
  try {
    await run();
  } finally {
    Project.findById = originalProjectFindById;
    Project.find = originalProjectFind;
    Project.findOne = originalProjectFindOne;
    User.findById = originalUserFindById;
    User.findOne = originalUserFindOne;
    TeamInvitation.findOne = originalTeamInvitationFindOne;
    ProjectMember.findOne = originalProjectMemberFindOne;
    ProjectMember.create = originalProjectMemberCreate;
    Notification.create = originalNotificationCreate;
  }
}

test('unauthorized user cannot run uniqueness check', async () => {
  await withPatchedModels(async () => {
    const project = {
      _id: 'project-1',
      leader: 'leader-1',
      teamMembers: ['leader-1'],
      title: 'Project A',
      status: 'proposal_created',
      abstract: 'AI abstract',
      problemStatement: 'Problem',
      objectives: 'Goal',
      methodology: 'Method',
      technologies: 'React',
      expectedOutcome: 'Output',
      domain: 'AI',
      cohortId: 'IT-2023-E',
      save: async function () { return this; },
    };

    Project.findById = async () => project;

    let error;
    await projectController.runUniquenessCheck(
      { params: { id: 'project-1' }, user: { id: 'student-2', role: 'student' } },
      { status() { return this; }, json() { return this; } },
      (err) => { error = err; }
    );

    assert.ok(error);
    assert.equal(error.statusCode, 403);
  });
});

test('team leader can run uniqueness check and gets a similarity result', async () => {
  await withPatchedModels(async () => {
    const project = {
      _id: 'project-1',
      leader: 'leader-1',
      teamMembers: ['leader-1'],
      title: 'Project A',
      status: 'proposal_created',
      abstract: 'AI based system for document classification',
      problemStatement: 'We need better document classification using machine learning',
      objectives: 'Improve classifications and support decision making',
      methodology: 'Use logistic regression and feature extraction',
      technologies: 'Python React MongoDB',
      expectedOutcome: 'Better classification model',
      domain: 'AI',
      cohortId: 'IT-2023-E',
      uniquenessCheck: { status: 'not_checked' },
      save: async function () { return this; },
    };

    const similarProject = {
      _id: 'project-2',
      leader: 'leader-2',
      teamMembers: ['leader-2'],
      title: 'AI Document Classification Portal',
      status: 'proposal_created',
      abstract: 'AI based system for document classification and review',
      problemStatement: 'We build a document classification system with AI assistance',
      objectives: 'Support decision making by improving classification',
      methodology: 'Apply machine learning and feature extraction',
      technologies: 'Python React MongoDB',
      expectedOutcome: 'A better classification system',
      domain: 'AI',
      cohortId: 'IT-2023-E',
    };

    Project.findById = async () => project;
    Project.find = async () => [similarProject];

    let responseBody;
    await projectController.runUniquenessCheck(
      { params: { id: 'project-1' }, user: { id: 'leader-1', role: 'student' } },
      { status() { return this; }, json(body) { responseBody = body; return this; } },
      (err) => { throw err; }
    );

    assert.equal(responseBody.status, 'success');
    assert.ok(['needs_attention', 'high_similarity'].includes(responseBody.result.result));
    assert.ok(responseBody.result.overallScore >= 0);
    assert.ok(Array.isArray(responseBody.result.matches));
    assert.equal(project.status, 'uniqueness_checked');
  });
});

test('faculty can accept a proposal for review', async () => {
  await withPatchedModels(async () => {
    const project = {
      _id: 'project-1',
      leader: 'leader-1',
      teamMembers: ['leader-1'],
      title: 'Project A',
      status: 'uniqueness_checked',
      uniquenessCheck: { result: 'likely_unique', overallScore: 30 },
      save: async function () { return this; },
      reviewedBy: undefined,
      reviewedAt: undefined,
      reviewDecision: undefined,
      facultyComment: undefined,
    };

    Project.findById = async () => project;
    User.findById = async () => ({ _id: 'faculty-1', role: 'faculty', name: 'Faculty User' });

    let responseBody;
    await projectController.reviewProject(
      { params: { id: 'project-1' }, body: { decision: 'accepted', facultyComment: 'Good work' }, user: { id: 'faculty-1', role: 'faculty' } },
      { status() { return this; }, json(body) { responseBody = body; return this; } },
      (err) => { throw err; }
    );

    assert.equal(responseBody.status, 'success');
    assert.equal(project.status, 'faculty_accepted');
    assert.equal(project.reviewDecision, 'accepted');
    assert.equal(project.facultyComment, 'Good work');
  });
});

test('accepting invitation adds member and sends a leader email', async () => {
  await withPatchedModels(async () => {
    const leader = { _id: 'leader-1', id: 'leader-1', name: 'Leader One', email: 'leader@example.com' };
    const invitee = { _id: 'student-2', id: 'student-2', name: 'Student Two', email: 'student2@example.com', role: 'student', department: 'Information Technology', section: 'E', batch: '2023-2027' };
    const project = {
      _id: 'project-1',
      leader: 'leader-1',
      title: 'Test Project',
      status: 'proposal_created',
      cohortId: 'IT-2023-E',
      teamMembers: ['leader-1'],
      deadline: 'deadline-1',
      save: async function () { return this; },
    };
    const invitation = {
      _id: 'inv-1',
      project: { _id: 'project-1', title: 'Test Project' },
      invitedBy: leader,
      invitedUser: invitee._id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      save: async function () { return this; },
    };

    Project.findById = async () => project;
    TeamInvitation.findOne = async () => invitation;
    ProjectMember.findOne = async () => null;
    ProjectMember.create = async () => ({ ok: true });
    Project.findOne = async () => null;
    Notification.create = async () => ({ ok: true });
    let emailSent = false;
    const originalSend = require('../src/services/emailService').sendTeamMemberAcceptedEmail;
    require('../src/services/emailService').sendTeamMemberAcceptedEmail = async () => {
      emailSent = true;
      return true;
    };

    let responseBody;
    await invitationController.acceptInvitation(
      { params: { token: 'abc' }, user: invitee },
      { status() { return this; }, json(body) { responseBody = body; return this; } },
      (err) => { throw err; }
    );

    assert.equal(responseBody.status, 'success');
    assert.equal(emailSent, true);
    require('../src/services/emailService').sendTeamMemberAcceptedEmail = originalSend;
  });
});
