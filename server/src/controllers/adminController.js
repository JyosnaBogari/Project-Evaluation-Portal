const User = require('../models/User');
const Project = require('../models/Project');
const Evaluation = require('../models/Evaluation');
const AppError = require('../utils/AppError');
const { exportEvaluationsToCSV } = require('../services/reportService');
const { getCohortId } = require('../utils/cohort');

const normalizeFacultyProfile = (payload = {}) => {
  const expertise = Array.isArray(payload.expertise)
    ? payload.expertise
    : typeof payload.expertise === 'string'
      ? payload.expertise.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

  const subjects = Array.isArray(payload.subjects)
    ? payload.subjects
    : typeof payload.subjects === 'string'
      ? payload.subjects.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

  const researchAreas = Array.isArray(payload.researchAreas)
    ? payload.researchAreas
    : typeof payload.researchAreas === 'string'
      ? payload.researchAreas.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

  return {
    facultyId: payload.facultyId || payload.facultyProfile?.facultyId || '',
    qualification: payload.qualification || payload.facultyProfile?.qualification || '',
    specialization: payload.specialization || payload.facultyProfile?.specialization || '',
    expertise,
    subjects,
    researchAreas,
    experienceYears: Number(payload.experienceYears || payload.facultyProfile?.experienceYears || 0),
    maxProjects: Number(payload.maxProjects || payload.facultyProfile?.maxProjects || 6),
    availability: payload.availability || payload.facultyProfile?.availability || 'available',
    currentProjects: Number(payload.currentProjects || payload.facultyProfile?.currentProjects || 0),
  };
};

// Get global system analytics
const getSystemStats = async (req, res, next) => {
  try {
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalFaculty = await User.countDocuments({ role: 'faculty' });
    const totalProjects = await Project.countDocuments();
    
    // Status counts
    const pendingCount = await Project.countDocuments({ status: 'pending' });
    const submittedCount = await Project.countDocuments({ status: 'submitted' });
    const underReviewCount = await Project.countDocuments({ status: 'under_review' });
    const evaluatedCount = await Project.countDocuments({ status: 'evaluated' });

    // Calculate Average Scores
    const publishedEvals = await Evaluation.find({ isPublished: true });
    let averageScore = 0;
    if (publishedEvals.length > 0) {
      const sum = publishedEvals.reduce((acc, curr) => acc + curr.totalScore, 0);
      averageScore = (sum / publishedEvals.length).toFixed(1);
    }

    // Chart Data 1: Status distribution
    const statusStats = [
      { name: 'Pending Review', value: pendingCount + submittedCount },
      { name: 'Under Review', value: underReviewCount },
      { name: 'Evaluated', value: evaluatedCount }
    ];

    // Chart Data 2: Real department-wise submissions via aggregation
    const deptStats = await Project.aggregate([
      // Unwind team members so we can join with Users
      { $unwind: '$teamMembers' },
      // Lookup the user document for each team member
      {
        $lookup: {
          from: 'users',
          localField: 'teamMembers',
          foreignField: '_id',
          as: 'memberInfo',
        },
      },
      { $unwind: '$memberInfo' },
      // Group by project ID and department (to avoid counting a project multiple times per dept)
      {
        $group: {
          _id: { projectId: '$_id', department: '$memberInfo.department' },
        },
      },
      // Now group by department only to count unique projects per department
      {
        $group: {
          _id: '$_id.department',
          submissions: { $sum: 1 },
        },
      },
      // Format output
      {
        $project: {
          _id: 0,
          department: '$_id',
          submissions: 1,
        },
      },
      { $sort: { submissions: -1 } },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        summary: {
          totalStudents,
          totalFaculty,
          totalProjects,
          evaluatedProjects: evaluatedCount,
          averageScore,
        },
        statusStats,
        deptStats,
      }
    });
  } catch (error) {
    next(error);
  }
};

// List all registered users (Admin only) with pagination
const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const total = await User.countDocuments();
    const users = await User.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: 'success',
      users,
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

// Create user manually (Admin only)
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, department, rollNumber, facultyId, section, batch, academicYear, officialCollegeEmail } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new AppError('User with this email already exists', 400));
    }

    const userData = { name, email, password, role, department };
    if (role === 'student') {
      if (!rollNumber || !section?.trim() || !batch?.trim() || !academicYear?.trim()) {
        return next(new AppError('Roll number, section, batch, and academic year are required for students', 400));
      }
      if (!['Computer Science', 'Information Technology'].includes(department)) {
        return next(new AppError('Student accounts are currently limited to Computer Science and Information Technology', 400));
      }
      if (!/^\d{4}\s*-\s*\d{4}$/.test(batch.trim()) || !getCohortId({ department, section, batch })) {
        return next(new AppError('Provide a valid section and batch in YYYY-YYYY format', 400));
      }
      Object.assign(userData, {
        rollNumber,
        section: section.trim().toUpperCase(),
        batch: batch.trim(),
        academicYear: academicYear.trim(),
        ...(officialCollegeEmail ? { officialCollegeEmail: officialCollegeEmail.trim().toLowerCase() } : {}),
      });
    }
    else if (role === 'faculty') userData.facultyId = facultyId;

    const user = await User.create(userData);
    
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      status: 'success',
      user: userResponse,
    });
  } catch (error) {
    next(error);
  }
};

const updateStudentCohort = async (req, res, next) => {
  try {
    const { department, section, batch, academicYear } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'student') {
      return next(new AppError('Student account not found', 404));
    }
    if (!['Computer Science', 'Information Technology'].includes(department)) {
      return next(new AppError('Student accounts are currently limited to Computer Science and Information Technology', 400));
    }
    if (!section?.trim() || !academicYear?.trim() || !/^\d{4}\s*-\s*\d{4}$/.test(batch?.trim() || '')) {
      return next(new AppError('Provide department, section, academic year, and batch in YYYY-YYYY format', 400));
    }

    user.department = department;
    user.section = section.trim().toUpperCase();
    user.batch = batch.trim();
    user.academicYear = academicYear.trim();
    await user.save();
    res.status(200).json({ status: 'success', user });
  } catch (error) {
    next(error);
  }
};

// Export evaluations sheet (CSV download)
const getFacultyUsers = async (req, res, next) => {
  try {
    const faculty = await User.find({ role: 'faculty' }).sort({ name: 1 });
    res.status(200).json({
      status: 'success',
      users: faculty,
    });
  } catch (error) {
    next(error);
  }
};

const createFaculty = async (req, res, next) => {
  try {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password) {
      return next(new AppError('Name, email, and password are required for faculty accounts', 400));
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return next(new AppError('A faculty account with this email already exists', 400));
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'faculty',
      department: department || 'Computer Science',
      facultyId: req.body.facultyId || req.body.facultyProfile?.facultyId || `FAC-${Date.now()}`,
      availability: req.body.availability || req.body.facultyProfile?.availability || 'available',
      facultyProfile: normalizeFacultyProfile(req.body),
    });

    const safeUser = user.toObject();
    delete safeUser.password;

    res.status(201).json({
      status: 'success',
      user: safeUser,
    });
  } catch (error) {
    next(error);
  }
};

const updateFacultyProfile = async (req, res, next) => {
  try {
    const faculty = await User.findById(req.params.id);
    if (!faculty || faculty.role !== 'faculty') {
      return next(new AppError('Faculty member not found', 404));
    }

    const { name, department, availability, password, ...rest } = req.body;

    if (name) faculty.name = name.trim();
    if (department) faculty.department = department;
    if (availability) faculty.availability = availability;
    faculty.facultyProfile = { ...faculty.facultyProfile, ...normalizeFacultyProfile(rest) };
    if (req.body.facultyId) faculty.facultyId = req.body.facultyId;
    if (password) faculty.password = password;

    await faculty.save();

    const safeFaculty = faculty.toObject();
    delete safeFaculty.password;

    res.status(200).json({
      status: 'success',
      user: safeFaculty,
    });
  } catch (error) {
    next(error);
  }
};

const exportEvaluationsReport = async (req, res, next) => {
  try {
    const evaluations = await Evaluation.find()
      .populate({
        path: 'projectId',
        populate: { path: 'teamMembers', select: 'name email' }
      })
      .populate('evaluatorId', 'name email department')
      .sort({ updatedAt: -1 });

    const csvData = exportEvaluationsToCSV(evaluations);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=evaluations_report.csv');
    res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSystemStats,
  getAllUsers,
  createUser,
  updateStudentCohort,
  getFacultyUsers,
  createFaculty,
  updateFacultyProfile,
  exportEvaluationsReport,
};
