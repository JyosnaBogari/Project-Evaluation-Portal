import api from './api';
import axios from 'axios';

// Get list of projects based on logged-in user role
export const getProjects = async () => {
  const response = await api.get('/projects');
  return response.data.projects;
};

// Get specific project details
export const getProjectById = async (id) => {
  const response = await api.get(`/projects/${id}`);
  return response.data.project;
};

// Run ML similarity check for the project
export const runUniquenessCheck = async (id) => {
  const response = await api.post(`/projects/${id}/uniqueness-check`);
  return response.data.result;
};

// Request direct-upload presigned signature
export const getUploadUrl = async (filename, fileType) => {
  const response = await api.get(`/projects/upload-url`, {
    params: { filename, fileType },
  });
  return response.data.data;
};

// Perform direct upload to cloud bucket / local direct target
export const uploadFileDirectly = async (uploadMetadata, file, onProgress) => {
  const { uploadUrl, method, fields, fileKey } = uploadMetadata;
  
  const formData = new FormData();
  
  // Append presigned fields
  if (fields) {
    Object.keys(fields).forEach(key => {
      formData.append(key, fields[key]);
    });
  }
  
  // Append binary file
  formData.append(fileKey || 'file', file);

  // Build headers — include auth token for local server uploads
  const headers = { 'Content-Type': 'multipart/form-data' };
  const token = sessionStorage.getItem('token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await axios({
    url: uploadUrl,
    method: method || 'POST',
    data: formData,
    headers,
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    },
  });

  return response.data; // Yields { url, hash, originalName }
};

// Create new project (DRAFT)
export const createProject = async (projectData) => {
  const response = await api.post('/projects', projectData);
  return response.data.project;
};

// Update project (DRAFT)
export const updateProject = async (id, projectData) => {
  const response = await api.put(`/projects/${id}`, projectData);
  return response.data.project;
};

// Upload file directly to project with purpose
export const uploadProjectFile = async (id, file, purpose, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', purpose);

  const response = await api.post(`/projects/${id}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    },
  });
  return response.data;
};

// Submit draft project (runs plagiarism check, changes status to SUBMITTED)
export const submitDraftProject = async (id) => {
  const response = await api.post(`/projects/${id}/submit`);
  return response.data.project;
};

// Withdraw project
export const withdrawProject = async (id) => {
  const response = await api.post(`/projects/${id}/withdraw`);
  return response.data;
};

// Get active deadlines for student
export const getStudentDeadlines = async () => {
  const response = await api.get('/projects/deadlines');
  return response.data.deadlines;
};

// Submit metadata register call (backward compatibility)
export const submitProject = async (projectData) => {
  const response = await api.post('/projects/submit', projectData);
  return response.data.project;
};

// Admin allocation call
export const assignReviewer = async (projectId, facultyId) => {
  const response = await api.post('/projects/assign-reviewer', { projectId, facultyId });
  return response.data.project;
};

export const getFacultyRecommendations = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/faculty-recommendations`);
  return response.data.data;
};

export const assignFacultyToProject = async (projectId, facultyId) => {
  const response = await api.post(`/projects/${projectId}/assign-faculty`, { facultyId });
  return response.data.project;
};

// Get students list (for team member selection)
export const getStudents = async () => {
  const response = await api.get('/projects/students');
  return response.data.users;
};

