const test = require('node:test');
const assert = require('node:assert/strict');

const invitationController = require('../src/controllers/invitationController');
const Project = require('../src/models/Project');
const User = require('../src/models/User');
const TeamInvitation = require('../src/models/TeamInvitation');
const ProjectMember = require('../src/models/ProjectMember');
const Notification = require('../src/models/Notification');
const { getCohortId } = require('../src/utils/cohort');

const originalProjectFindById = Project.findById;
const originalProjectFindOne = Project.findOne;
const originalUserFindOne = User.findOne;
const originalUserFind = User.find;
const originalTeamInvitationFindOne = TeamInvitation.findOne;
const originalTeamInvitationCreate = TeamInvitation.create;
const originalProjectMemberCreate = ProjectMember.create;
const originalProjectMemberFindOne = ProjectMember.findOne;
const originalNotificationCreate = Notification.create;

async function withPatchedModels(run) {
  try {
    await run();
  } finally {
    Project.findById = originalProjectFindById;
    Project.findOne = originalProjectFindOne;
    User.findOne = originalUserFindOne;
    User.find = originalUserFind;
    TeamInvitation.findOne = originalTeamInvitationFindOne;
    TeamInvitation.create = originalTeamInvitationCreate;
    ProjectMember.create = originalProjectMemberCreate;
    ProjectMember.findOne = originalProjectMemberFindOne;
    Notification.create = originalNotificationCreate;
  }
}

async function exerciseSendInvitation({ leader, invitee, teamMemberIds = [], existingInvitation = null, existingMembership = null, otherProject = null }) {
  const project = {
    _id: 'project-1',
    leader: leader.id,
    status: 'proposal_created',
    title: 'Test Project',
    cohortId: getCohortId(leader),
    deadline: 'deadline-1',
    teamMembers: [leader.id, ...teamMemberIds],
  };
  Project.findById = async () => project;
  Project.findOne = async () => otherProject;
  User.findOne = async () => invitee;
  TeamInvitation.findOne = async () => existingInvitation;
  TeamInvitation.create = async (doc) => ({
    ...doc,
    _id: 'inv-new',
    invitedUser: invitee,
    populate: async () => {},
  });
  ProjectMember.findOne = async () => existingMembership;
  Notification.create = async () => ({ ok: true });

  let capturedError;
  let statusCode;
  const req = {
    body: { projectId: project._id, studentIdentifier: invitee?.email || 'missing@example.com' },
    user: leader,
  };
  const res = { status(code) { statusCode = code; return this; }, json() { return this; } };
  await invitationController.sendInvitation(req, res, (error) => { capturedError = error; });
  return { error: capturedError, statusCode };
}

test('cohort IDs derive from department, batch start year, and section', () => {
  assert.equal(getCohortId({ department: 'Information Technology', section: 'e', batch: '2023-2027' }), 'IT-2023-E');
  assert.equal(getCohortId({ department: 'Computer Science', section: 'Q', batch: '2023-2027' }), 'CSE-2023-Q');
  assert.equal(getCohortId({ department: 'Computer Science', section: 'Q' }), null);
  assert.equal(getCohortId({ department: 'Computer Science', section: 'Q', batch: '2027-2023' }), null);
});

test('student search returns only students in the project cohort', async () => {
  await withPatchedModels(async () => {
    const leader = {
      _id: 'leader-id',
      id: 'leader-id',
      department: 'Information Technology',
      section: 'E',
      batch: '2023-2027',
    };
    const project = {
      _id: 'project-1',
      leader: 'leader-id',
      status: 'proposal_created',
      cohortId: 'IT-2023-E',
      teamMembers: ['leader-id'],
    };
    const students = [{ _id: 'student-e', name: 'Student E', section: 'E' }];
    Project.findById = async () => project;
    User.find = (filter) => {
      assert.equal(filter.cohortId, 'IT-2023-E');
      assert.deepEqual(filter._id.$nin, ['leader-id', 'leader-id']);
      assert.equal(filter.$or.length, 4);
      return {
        select() { return this; },
        sort() { return this; },
        limit: async () => students,
      };
    };

    let responseBody;
    await invitationController.searchEligibleStudents({
      query: { projectId: project._id, query: '23EG' },
      user: leader,
    }, {
      status() { return this; },
      json(body) { responseBody = body; return this; },
    }, (error) => { throw error; });

    assert.deepEqual(responseBody.students, students);
  });
});

test('student search distinguishes ineligible students from missing results', async () => {
  await withPatchedModels(async () => {
    const leader = {
      _id: 'leader-id',
      id: 'leader-id',
      department: 'Information Technology',
      section: 'E',
      batch: '2023-2027',
    };
    const project = {
      _id: 'project-1',
      leader: 'leader-id',
      status: 'proposal_created',
      cohortId: 'IT-2023-E',
      teamMembers: ['leader-id'],
    };

    const otherCohortStudent = {
      _id: 'student-d',
      name: 'Ravi Kumar',
      email: 'ravi@example.com',
      rollNumber: '23EG112D07',
      department: 'Information Technology',
      section: 'D',
      batch: '2023-2027',
      cohortId: 'IT-2023-D',
    };

    Project.findById = async () => project;
    User.find = async () => [otherCohortStudent];

    let responseBody;
    await invitationController.searchEligibleStudents({
      query: { projectId: project._id, query: '23EG112D07' },
      user: leader,
    }, {
      status() { return this; },
      json(body) { responseBody = body; return this; },
    }, (error) => { throw error; });

    assert.deepEqual(responseBody.students, []);
    assert.equal(responseBody.ineligibleStudents.length, 1);
    assert.match(responseBody.ineligibleStudents[0].reason, /IT-D/i);
    assert.match(responseBody.ineligibleStudents[0].reason, /IT-E/i);
  });
});

test('sendInvitation allows team invites while project is still in proposal_created stage', async () => {
  await withPatchedModels(async () => {
    const project = {
      _id: 'project-1',
      leader: 'leader-id',
      status: 'proposal_created',
      title: 'ML Portal',
      cohortId: 'IT-2023-E',
      deadline: { _id: 'deadline-1' },
      teamMembers: ['leader-id'],
    };

    const invitee = {
      _id: 'student-2',
      email: 'student2@example.com',
      role: 'student',
      name: 'Student Two',
      rollNumber: '23EG9999',
      department: 'Information Technology',
      section: 'E',
      batch: '2023-2027',
    };

    Project.findById = async () => project;
    User.findOne = async () => invitee;
    TeamInvitation.findOne = async () => null;
    ProjectMember.findOne = async () => null;
    TeamInvitation.create = async (doc) => ({
      ...doc,
      populate: async () => {},
      _id: 'inv-1',
      invitedUser: invitee,
    });
    Notification.create = async () => ({ ok: true });

    let statusCode;
    let responseBody;
    const req = {
      body: { projectId: 'project-1', studentIdentifier: 'student2@example.com' },
      user: {
        id: 'leader-id',
        name: 'Leader One',
        department: 'Information Technology',
        section: 'E',
        batch: '2023-2027',
      },
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; },
    };

    await invitationController.sendInvitation(req, res, (err) => {
      throw err;
    });

    assert.equal(statusCode, 201);
    assert.equal(responseBody.message, 'Invitation sent successfully');
    assert.equal(responseBody.invitation.status, 'pending');
  });
});

test('sendInvitation rejects a student from a different cohort with a useful message', async () => {
  await withPatchedModels(async () => {
    Project.findById = async () => ({
      _id: 'project-1',
      leader: 'leader-id',
      status: 'proposal_created',
      cohortId: 'IT-2023-E',
      teamMembers: ['leader-id'],
    });
    User.findOne = async () => ({
      _id: 'student-d',
      email: 'studentd@example.com',
      role: 'student',
      department: 'Information Technology',
      section: 'D',
      batch: '2023-2027',
    });

    const req = {
      body: { projectId: 'project-1', studentIdentifier: 'studentd@example.com' },
      user: {
        id: 'leader-id',
        department: 'Information Technology',
        section: 'E',
        batch: '2023-2027',
      },
    };
    let capturedError;
    await invitationController.sendInvitation(req, {}, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError.statusCode, 403);
    assert.match(capturedError.message, /student belongs to IT-D/i);
    assert.match(capturedError.message, /same cohort \(IT-E/i);
  });
});

test('CSE-Q can invite CSE-Q and rejects CSE-B and IT-E students', async () => {
  await withPatchedModels(async () => {
    const leader = {
      id: 'cse-q-leader',
      department: 'Computer Science',
      section: 'Q',
      batch: '2023-2027',
    };
    const sameCohort = await exerciseSendInvitation({
      leader,
      invitee: {
        _id: 'cse-q-member',
        email: 'member@example.com',
        role: 'student',
        department: 'Computer Science',
        section: 'Q',
        batch: '2023-2027',
      },
    });
    assert.equal(sameCohort.statusCode, 201);
    assert.equal(sameCohort.error, undefined);

    for (const candidate of [
      { department: 'Computer Science', section: 'B', expected: 'CSE-B' },
      { department: 'Information Technology', section: 'E', expected: 'IT-E' },
    ]) {
      const result = await exerciseSendInvitation({
        leader,
        invitee: {
          _id: `student-${candidate.section}`,
          email: `student-${candidate.section}@example.com`,
          role: 'student',
          department: candidate.department,
          section: candidate.section,
          batch: '2023-2027',
        },
      });
      assert.equal(result.error.statusCode, 403);
      assert.match(result.error.message, new RegExp(candidate.expected));
    }
  });
});

test('sendInvitation preserves self, team-member, duplicate, committed-project, and not-found rules', async () => {
  await withPatchedModels(async () => {
    const leader = {
      id: 'leader-id',
      department: 'Information Technology',
      section: 'E',
      batch: '2023-2027',
    };
    const student = {
      _id: 'student-2',
      email: 'student2@example.com',
      role: 'student',
      department: 'Information Technology',
      section: 'E',
      batch: '2023-2027',
    };

    const selfResult = await exerciseSendInvitation({
      leader,
      invitee: { ...student, _id: leader.id, email: 'leader@example.com' },
    });
    assert.equal(selfResult.error.statusCode, 400);
    assert.match(selfResult.error.message, /cannot invite yourself/i);

    const memberResult = await exerciseSendInvitation({ leader, invitee: student, teamMemberIds: [student._id] });
    assert.equal(memberResult.error.statusCode, 409);

    const duplicateResult = await exerciseSendInvitation({ leader, invitee: student, existingInvitation: { status: 'pending' } });
    assert.equal(duplicateResult.error.statusCode, 409);
    assert.match(duplicateResult.error.message, /active invitation already exists/i);

    const committedResult = await exerciseSendInvitation({
      leader,
      invitee: student,
      existingMembership: { project: 'other-project' },
      otherProject: { _id: 'other-project', deadline: 'deadline-1' },
    });
    assert.equal(committedResult.error.statusCode, 409);
    assert.match(committedResult.error.message, /already part of another project/i);

    const missingResult = await exerciseSendInvitation({ leader, invitee: null });
    assert.equal(missingResult.error.statusCode, 404);
    assert.match(missingResult.error.message, /no matching student/i);
  });
});

test('acceptInvitation records acceptedAt and adds the student to the project team', async () => {
  await withPatchedModels(async () => {
    const project = {
      _id: 'project-1',
      title: 'ML Portal',
      status: 'proposal_created',
      cohortId: 'IT-2023-E',
      teamMembers: ['leader-id'],
    };
    const inviter = { _id: 'leader-id', name: 'Leader One' };
    const invitee = {
      _id: 'student-2',
      name: 'Student Two',
      department: 'Information Technology',
      section: 'E',
      batch: '2023-2027',
    };

    const invitation = {
      _id: 'inv-1',
      token: 'token-123',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000),
      invitedUser: { toString: () => 'student-2' },
      invitedBy: inviter,
      project,
      save: async function () {
        this.status = 'accepted';
        this.acceptedAt = new Date();
        return this;
      },
      populate() {
        return this;
      },
    };

    TeamInvitation.findOne = () => invitation;
    Project.findById = async () => project;
    Project.findByIdAndUpdate = async () => ({ ok: true });
    ProjectMember.findOne = async () => null;
    ProjectMember.create = async () => ({ ok: true });
    Notification.create = async () => ({ ok: true });

    let statusCode;
    let responseBody;
    const req = {
      params: { token: 'token-123' },
      user: {
        id: 'student-2',
        name: 'Student Two',
        department: 'Information Technology',
        section: 'E',
        batch: '2023-2027',
      },
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; },
    };

    await invitationController.acceptInvitation(req, res, (err) => {
      throw err;
    });

    assert.equal(statusCode, 200);
    assert.equal(responseBody.message, 'Invitation accepted. You are now a team member.');
    assert.equal(invitation.status, 'accepted');
    assert.ok(invitation.acceptedAt instanceof Date);
  });
});
