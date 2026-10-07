const Deadline = require('../models/Deadline');
const AppError = require('../utils/AppError');

// Create a new deadline (Admin only)
const createDeadline = async (req, res, next) => {
  try {
    const { batch, title, submissionStartDate, submissionEndDate } = req.body;

    // Server-side date validation
    if (new Date(submissionStartDate) >= new Date(submissionEndDate)) {
      return next(new AppError('Start date must be before end date', 400));
    }

    // Set other deadlines for the same batch to inactive if they exist
    await Deadline.updateMany({ batch }, { isActive: false });

    const deadline = await Deadline.create({
      batch,
      title,
      submissionStartDate,
      submissionEndDate,
      isActive: true,
    });

    res.status(201).json({
      status: 'success',
      deadline,
    });
  } catch (error) {
    next(error);
  }
};

// Get all deadlines
const getDeadlines = async (req, res, next) => {
  try {
    const deadlines = await Deadline.find().sort({ createdAt: -1 });
    res.status(200).json({
      status: 'success',
      deadlines,
    });
  } catch (error) {
    next(error);
  }
};

// Get active deadline for a specific batch
const getBatchDeadline = async (req, res, next) => {
  try {
    const { batch } = req.params;
    const deadline = await Deadline.findOne({ batch, isActive: true });
    
    res.status(200).json({
      status: 'success',
      deadline,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDeadline,
  getDeadlines,
  getBatchDeadline,
};
