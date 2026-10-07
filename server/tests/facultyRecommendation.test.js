const test = require('node:test');
const assert = require('node:assert/strict');

const { getFacultyRecommendationsForProject } = require('../src/services/facultyRecommendationService');

test('faculty recommendation ranks matching expertise highest and filters inactive or unavailable faculty', () => {
  const project = {
    title: 'AI-based NLP project evaluation portal',
    domain: 'Machine Learning',
    abstract: 'A machine learning and NLP system for evaluating project similarity and faculty alignment.',
    problemStatement: 'We need a system using NLP and machine learning to evaluate project proposals.',
    objectives: 'Improve project similarity detection using NLP and semantic matching.',
    methodology: 'Use NLP, embeddings, and semantic similarity for faculty matching.',
    technologies: 'Node.js, React, MongoDB, NLP, ML',
    expectedOutcome: 'A semantic matching portal for faculty assignments.',
  };

  const faculty = [
    {
      _id: 'f1',
      name: 'Dr. Anitha Rao',
      role: 'faculty',
      department: 'Information Technology',
      isActive: true,
      availability: 'available',
      facultyProfile: {
        qualification: 'Ph.D.',
        specialization: 'Artificial Intelligence',
        expertise: ['Machine Learning', 'NLP', 'Deep Learning', 'Data Science'],
        subjects: ['AI', 'Machine Learning', 'Data Mining'],
        researchAreas: ['Natural Language Processing', 'Educational AI'],
        maxProjects: 8,
      },
      assignedProjectCount: 2,
    },
    {
      _id: 'f2',
      name: 'Dr. Ravi Kumar',
      role: 'faculty',
      department: 'Information Technology',
      isActive: true,
      availability: 'available',
      facultyProfile: {
        qualification: 'M.Tech',
        specialization: 'Web and Cloud Computing',
        expertise: ['React', 'Node.js', 'Cloud Computing', 'Distributed Systems'],
        subjects: ['Web Development', 'Cloud Computing'],
        researchAreas: ['Cloud Applications'],
        maxProjects: 8,
      },
      assignedProjectCount: 1,
    },
    {
      _id: 'f3',
      name: 'Dr. Kiran Rao',
      role: 'faculty',
      department: 'Computer Science',
      isActive: false,
      availability: 'available',
      facultyProfile: {
        qualification: 'M.Tech',
        specialization: 'IoT',
        expertise: ['IoT', 'Embedded Systems', 'Sensors'],
        subjects: ['IoT', 'Embedded Systems'],
        researchAreas: ['Smart Systems'],
        maxProjects: 6,
      },
      assignedProjectCount: 1,
    },
    {
      _id: 'f4',
      name: 'Dr. Suresh Reddy',
      role: 'faculty',
      department: 'Information Technology',
      isActive: true,
      availability: 'unavailable',
      facultyProfile: {
        qualification: 'Ph.D.',
        specialization: 'Cybersecurity',
        expertise: ['Cybersecurity', 'Computer Networks', 'Cryptography'],
        subjects: ['Networks', 'Security'],
        researchAreas: ['Network Security'],
        maxProjects: 6,
      },
      assignedProjectCount: 0,
    },
  ];

  const results = getFacultyRecommendationsForProject(project, faculty);

  assert.ok(results.length >= 2);
  assert.equal(results[0]._id, 'f1');
  assert.ok(results[0].finalScore >= results[1].finalScore);
  assert.ok(results[0].explanation.includes('Machine Learning') || results[0].explanation.includes('NLP'));
  assert.ok(!results.some((item) => item._id === 'f3'));
  assert.ok(!results.some((item) => item._id === 'f4'));
});
