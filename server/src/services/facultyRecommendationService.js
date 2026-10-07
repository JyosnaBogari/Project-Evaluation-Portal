const FACULTY_RECOMMENDATION_WEIGHTS = {
  expertiseSimilarity: 0.6,
  departmentMatch: 0.2,
  availability: 0.1,
  workload: 0.1,
};

const TOKEN_SYNONYMS = {
  ai: ['artificial intelligence', 'machine learning'],
  'machine learning': ['ml', 'ai', 'artificial intelligence'],
  'natural language processing': ['nlp', 'language processing'],
  'data science': ['analytics', 'statistics'],
  'deep learning': ['neural networks'],
  cybersecurity: ['security', 'network security'],
  'web development': ['react', 'node', 'mern', 'frontend', 'backend'],
  'cloud computing': ['cloud', 'distributed systems'],
  'software engineering': ['system design', 'testing', 'software quality'],
  'iot': ['internet of things', 'embedded systems', 'edge computing'],
  'database': ['dbms', 'sql', 'database management'],
};

const normalizeText = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (value = '') => {
  const text = normalizeText(value);
  if (!text) return [];

  const tokens = text.split(/\s+/).filter(Boolean);
  const expanded = [];

  tokens.forEach((token) => {
    expanded.push(token);
    const related = TOKEN_SYNONYMS[token] || TOKEN_SYNONYMS[normalizeText(token)];
    if (related) {
      expanded.push(...related);
    }
  });

  return expanded.map((token) => normalizeText(token)).filter(Boolean);
};

const buildWeightedVector = (text = '') => {
  const counts = {};
  const tokens = tokenize(text);

  tokens.forEach((token) => {
    const weight = token.length > 3 ? 2 : 1;
    counts[token] = (counts[token] || 0) + weight;
  });

  return counts;
};

const calculateCosineSimilarity = (left = {}, right = {}) => {
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

const buildProjectRepresentation = (project) => {
  if (!project) return '';
  return [
    project.title,
    project.domain,
    project.abstract,
    project.problemStatement,
    project.objectives,
    project.methodology,
    project.technologies,
    project.expectedOutcome,
    project.keywords,
    project.description,
  ].filter(Boolean).join(' ');
};

const buildFacultyRepresentation = (faculty) => {
  if (!faculty) return '';

  const facultyProfile = faculty.facultyProfile || {};
  return [
    faculty.department,
    faculty.name,
    facultyProfile.qualification,
    facultyProfile.specialization,
    facultyProfile.expertise,
    facultyProfile.subjects,
    facultyProfile.researchAreas,
    facultyProfile.availability,
  ].flat().filter(Boolean).join(' ');
};

const getDepartmentCompatibility = (project, faculty) => {
  if (!project || !faculty) return 0.5;

  const projectDepartment = normalizeText(project.department || project.leader?.department || '');
  const facultyDepartment = normalizeText(faculty.department || '');

  if (!projectDepartment || !facultyDepartment) return 0.7;
  if (projectDepartment === facultyDepartment) return 1;

  const crossDepartmentBoost = {
    'computer science': ['computer science', 'information technology'],
    'information technology': ['information technology', 'computer science'],
  };

  const allowed = crossDepartmentBoost[projectDepartment] || [];
  return allowed.includes(facultyDepartment) ? 0.8 : 0.2;
};

const getFacultyCurrentLoad = (faculty) => {
  if (typeof faculty.assignedProjectCount === 'number') return faculty.assignedProjectCount;
  if (typeof faculty.currentProjects === 'number') return faculty.currentProjects;
  if (typeof faculty.currentProjectCount === 'number') return faculty.currentProjectCount;
  if (faculty.facultyProfile?.currentProjects) return Number(faculty.facultyProfile.currentProjects);
  return 0;
};

const getFacultyMaxProjects = (faculty) => {
  if (typeof faculty.maxProjects === 'number') return faculty.maxProjects;
  if (faculty.facultyProfile?.maxProjects) return Number(faculty.facultyProfile.maxProjects);
  return 6;
};

const getSemanticOverlap = (projectText, facultyText) => {
  const normalizedProject = normalizeText(projectText);
  const normalizedFaculty = normalizeText(facultyText);
  const matches = [];

  Object.keys(TOKEN_SYNONYMS).forEach((key) => {
    const keyText = normalizeText(key);
    const related = TOKEN_SYNONYMS[key].map((item) => normalizeText(item));
    const variants = [keyText, ...related];

    if (variants.some((variant) => normalizedProject.includes(variant) && normalizedFaculty.includes(variant))) {
      matches.push(keyText.replace(/\b\w/g, (char) => char.toUpperCase()));
    }
  });

  return matches.slice(0, 3);
};

const buildRecommendationExplanation = (project, faculty, overlap) => {
  if (!overlap || overlap.length === 0) {
    return `Good department fit and workload capacity for this project. ${faculty.department || 'Faculty'} is a suitable guide for ${project.domain || project.title || 'this project'}.`;
  }

  const highlight = overlap.slice(0, 3).join(', ');
  return `Strong expertise match: ${highlight}. This aligns with the project's technical focus and the faculty profile.`;
};

const getFacultyRecommendationsForProject = (project, facultyList = []) => {
  if (!project) return [];

  const projectText = buildProjectRepresentation(project);
  const projectVector = buildWeightedVector(projectText);

  const candidates = facultyList.filter((faculty) => {
    if (!faculty || faculty.role !== 'faculty') return false;
    if (faculty.isActive === false) return false;
    const availability = faculty.availability || faculty.facultyProfile?.availability || 'available';
    if (availability === 'unavailable') return false;
    const maxProjects = getFacultyMaxProjects(faculty);
    const currentLoad = getFacultyCurrentLoad(faculty);
    if (currentLoad >= maxProjects) return false;
    return true;
  });

  const recommendations = candidates.map((faculty) => {
    const facultyText = buildFacultyRepresentation(faculty);
    const facultyVector = buildWeightedVector(facultyText);
    const expertiseSimilarity = calculateCosineSimilarity(projectVector, facultyVector);
    const departmentMatch = getDepartmentCompatibility(project, faculty);
    const availability = (faculty.availability || faculty.facultyProfile?.availability || 'available') === 'available' ? 1 : 0.5;
    const maxProjects = getFacultyMaxProjects(faculty) || 1;
    const currentLoad = getFacultyCurrentLoad(faculty);
    const workload = maxProjects > 0 ? 1 - Math.min(currentLoad / maxProjects, 1) : 0.5;

    const finalScore = (
      expertiseSimilarity * FACULTY_RECOMMENDATION_WEIGHTS.expertiseSimilarity +
      departmentMatch * FACULTY_RECOMMENDATION_WEIGHTS.departmentMatch +
      availability * FACULTY_RECOMMENDATION_WEIGHTS.availability +
      workload * FACULTY_RECOMMENDATION_WEIGHTS.workload
    );

    const projectKeywords = new Set(tokenize(projectText));
    const facultyKeywords = new Set(tokenize(facultyText));
    const overlap = getSemanticOverlap(projectText, facultyText);
    const genericOverlap = [...projectKeywords].filter((keyword) => facultyKeywords.has(keyword));

    return {
      _id: faculty._id,
      name: faculty.name,
      email: faculty.email,
      department: faculty.department,
      facultyId: faculty.facultyId || faculty.facultyProfile?.facultyId || 'N/A',
      expertise: faculty.facultyProfile?.expertise || faculty.expertise || [],
      specialization: faculty.facultyProfile?.specialization || faculty.specialization || '',
      qualification: faculty.facultyProfile?.qualification || faculty.qualification || '',
      availability: availability === 1 ? 'available' : 'limited',
      currentProjects: currentLoad,
      maxProjects,
      expertiseSimilarity: Number(expertiseSimilarity.toFixed(3)),
      departmentMatch: Number(departmentMatch.toFixed(3)),
      workload: Number(workload.toFixed(3)),
      finalScore: Number((finalScore * 100).toFixed(1)),
      explanation: buildRecommendationExplanation(project, faculty, overlap.length ? overlap : genericOverlap),
    };
  });

  return recommendations
    .filter((item) => item.finalScore >= 20)
    .sort((a, b) => b.finalScore - a.finalScore);
};

module.exports = {
  FACULTY_RECOMMENDATION_WEIGHTS,
  getFacultyRecommendationsForProject,
  buildProjectRepresentation,
  buildFacultyRepresentation,
  calculateCosineSimilarity,
};
