import React, { useEffect, useState } from 'react';
import { getProjects } from '../../services/projectService';
import { formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import EvaluateModal from './EvaluateModal';
import { Search, BookOpen, AlertCircle, RefreshCw, FileEdit } from 'lucide-react';

export default function FacultyDashboard() {
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');

  // Modal States
  const [selectedProject, setSelectedProject] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchAssignedProjects = async () => {
    try {
      setLoading(true);
      const data = await getProjects();
      setProjects(data);
      setFilteredProjects(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load faculty reviews:', err);
      setError('Unable to load assigned reviews queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedProjects();
  }, []);

  // Filter logic
  useEffect(() => {
    let result = [...projects];

    if (search.trim() !== '') {
      const q = search.toLowerCase();
      result = result.filter(
        p =>
          p.title.toLowerCase().includes(q) ||
          p.teamMembers.some(m => m.name.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== '') {
      result = result.filter(p => p.status === statusFilter);
    }

    if (batchFilter !== '') {
      result = result.filter(p => p.deadline?.batch === batchFilter);
    }

    setFilteredProjects(result);
  }, [search, statusFilter, batchFilter, projects]);

  const handleOpenEvaluate = (project) => {
    setSelectedProject(project);
    setModalOpen(true);
  };

  // Get distinct batches for filter select options
  const getBatchOptions = () => {
    const batches = projects.map(p => p.deadline?.batch).filter(Boolean);
    return [...new Set(batches)];
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-purple-600/10 to-blue-600/10 border-purple-500/10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reviewer Queue</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            Grade assigned graduation capstone project milestones.
          </p>
        </div>
        <button
          onClick={fetchAssignedProjects}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all cursor-pointer text-slate-400"
          title="Refresh Queue"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Filter and Search Panel */}
      <div className="glass-panel p-4 rounded-2xl grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Search */}
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Search by project title or student name..."
          />
        </div>

        {/* Status Filter */}
        <div className="md:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-900/40 text-sm focus:outline-none cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="evaluated">Evaluated</option>
          </select>
        </div>

        {/* Batch Filter */}
        <div className="md:col-span-3">
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-900/40 text-sm focus:outline-none cursor-pointer"
          >
            <option value="">All Batches</option>
            {getBatchOptions().map(batch => (
              <option key={batch} value={batch}>{batch}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Projects List Queue */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-14 bg-slate-800/40 rounded-xl"></div>
          <div className="h-14 bg-slate-800/40 rounded-xl"></div>
          <div className="h-14 bg-slate-800/40 rounded-xl"></div>
        </div>
      ) : error ? (
        <div className="glass-panel p-6 rounded-2xl border-red-500/25 bg-red-500/5 text-red-400 text-sm flex gap-3 items-center">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : filteredProjects.length > 0 ? (
        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-900">
                <tr>
                  <th className="px-6 py-4">Project Details</th>
                  <th className="px-6 py-4">Team Members</th>
                  <th className="px-6 py-4">Batch Cohort</th>
                  <th className="px-6 py-4">Submission Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-900">
                {filteredProjects.map((proj) => (
                  <tr key={proj._id} className="hover:bg-slate-500/5 transition-colors">
                    <td className="px-6 py-4 max-w-xs">
                      <p className="font-semibold text-white truncate">{proj.title}</p>
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{proj.description}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {proj.teamMembers.map(m => (
                          <span key={m._id} className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-800 text-slate-300">
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-400">
                      {proj.deadline?.batch || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {formatDate(proj.submittedAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeStyle(proj.status)}`}>
                        {proj.status.toUpperCase().replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEvaluate(proj)}
                        className="px-3.5 py-1.5 bg-blue-600/10 hover:bg-blue-600 border border-blue-500/25 hover:border-blue-500 text-blue-400 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 ml-auto transition-all cursor-pointer"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        Evaluate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-panel p-12 rounded-2xl text-center space-y-4">
          <div className="w-14 h-14 bg-slate-800 flex items-center justify-center rounded-full mx-auto text-slate-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold">No Projects Assigned</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto">
            You do not have any pending student project allocations on your review queue currently.
          </p>
        </div>
      )}

      {/* Evaluate Modal Component */}
      <EvaluateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        project={selectedProject}
        onSuccess={fetchAssignedProjects}
      />
    </div>
  );
}
