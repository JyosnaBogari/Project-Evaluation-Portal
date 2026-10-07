import React, { useEffect, useState } from 'react';
import { getStats, downloadExportReport, getUsers } from '../../services/adminService';
import { getProjects, assignReviewer } from '../../services/projectService';
import { getAllComplaints, updateComplaintStatus } from '../../services/complaintService';
import { formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import {
  Users,
  Award,
  FolderGit2,
  Download,
  Loader2,
  UserCheck,
  Check,
  AlertCircle,
  MessageSquare,
  ShieldAlert,
  Send,
} from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [selectedFaculty, setSelectedFaculty] = useState({});
  const [actionSuccess, setActionSuccess] = useState(null);

  // Complaint response state
  const [respondingId, setRespondingId] = useState(null);
  const [responseText, setResponseText] = useState({});
  const [updatingComplaintId, setUpdatingComplaintId] = useState(null);

  const fetchDashboardData = async () => {
    try {
      const [statsData, projectsData, usersData, complaintsData] = await Promise.all([
        getStats(),
        getProjects(),
        getUsers(),
        getAllComplaints().catch(() => []),
      ]);
      setStats(statsData);
      setProjects(projectsData || []);
      setFacultyList(usersData?.filter(u => u.role === 'faculty') || []);
      setComplaints(complaintsData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('Failed to fetch system metrics and project data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleAssignReviewer = async (projectId) => {
    const facultyId = selectedFaculty[projectId];
    if (!facultyId) return;

    setAssigningId(projectId);
    setActionSuccess(null);
    try {
      await assignReviewer(projectId, facultyId);
      setActionSuccess(`Reviewer assigned successfully for project!`);
      setTimeout(() => setActionSuccess(null), 3000);
      const [updatedProjects, updatedStats] = await Promise.all([
        getProjects(),
        getStats(),
      ]);
      setProjects(updatedProjects);
      setStats(updatedStats);
    } catch (err) {
      console.error('Failed to assign reviewer:', err);
      alert(err.response?.data?.message || 'Failed to assign reviewer');
    } finally {
      setAssigningId(null);
    }
  };

  const handleUpdateComplaint = async (complaintId, newStatus) => {
    setUpdatingComplaintId(complaintId);
    try {
      const updated = await updateComplaintStatus(complaintId, {
        status: newStatus,
        adminResponse: responseText[complaintId] || '',
      });
      setComplaints(prev => prev.map(c => c._id === complaintId ? updated : c));
      setRespondingId(null);
      setActionSuccess(`Complaint status updated to ${newStatus.toUpperCase()}`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to update complaint:', err);
      alert(err.response?.data?.message || 'Failed to update complaint');
    } finally {
      setUpdatingComplaintId(null);
    }
  };

  const COLORS = ['#eab308', '#a855f7', '#10b981'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  const { summary, statusStats, deptStats } = stats || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-blue-600/10 to-emerald-600/10 border-blue-500/10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Analytics & Administration</h1>
          <p className="text-[var(--text-secondary)] text-sm">Monitor submission volumes, grading velocities, reviewer allocations, and complaints.</p>
        </div>
        <button
          onClick={async () => {
            setExporting(true);
            try {
              await downloadExportReport();
            } catch (err) {
              console.error('Export failed:', err);
            } finally {
              setExporting(false);
            }
          }}
          disabled={exporting}
          className="px-4 py-2.5 bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export CSV Evaluation Sheet
        </button>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex gap-3 items-center">
          <Check className="w-5 h-5 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Students</span>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight">{summary?.totalStudents || 0}</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Faculty Reviewers</span>
            <UserCheck className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight">{summary?.totalFaculty || 0}</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Project Submissions</span>
            <FolderGit2 className="w-5 h-5 text-indigo-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight">{summary?.totalProjects || 0}</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Average Score</span>
            <Award className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight">
            {summary?.averageScore > 0 ? `${summary.averageScore} / 100` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Status Distribution Pie */}
        <div className="lg:col-span-5 glass-panel p-6 rounded-2xl space-y-4">
          <h3 className="text-base font-bold">Submission Pipeline Lifecycle</h3>
          <p className="text-xs text-[var(--text-secondary)]">Distribution across grading stages.</p>
          <div className="h-64 flex items-center justify-center">
            {statusStats && statusStats.some(s => s.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.08)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-500">No project activity recorded yet.</div>
            )}
          </div>
        </div>

        {/* Department Distribution Bar */}
        <div className="lg:col-span-7 glass-panel p-6 rounded-2xl space-y-4">
          <h3 className="text-base font-bold">Submissions by Department</h3>
          <p className="text-xs text-[var(--text-secondary)]">Department-wise capstone project counts.</p>
          <div className="h-64">
            {deptStats && deptStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="department" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.08)' }} />
                  <Bar dataKey="submissions" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-slate-500">
                No department submissions yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Submitted Projects & Reviewer Allocations Section */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold">Project Submissions & Reviewer Allocation</h3>
            <p className="text-xs text-[var(--text-secondary)]">Assign faculty reviewers and monitor plagiarism similarity scores.</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {projects.length} Total Projects
          </span>
        </div>

        {projects.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-900">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-900">
                <tr>
                  <th className="px-6 py-3.5">Project Title</th>
                  <th className="px-6 py-3.5">Leader / Team</th>
                  <th className="px-6 py-3.5">Cohort</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Plagiarism</th>
                  <th className="px-6 py-3.5">Assigned Reviewer</th>
                  <th className="px-6 py-3.5 text-right">Assign Faculty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-900">
                {projects.map((proj) => (
                  <tr key={proj._id} className="hover:bg-slate-500/5 transition-colors">
                    <td className="px-6 py-4 max-w-xs">
                      <p className="font-semibold text-white truncate">{proj.title}</p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">{proj.description}</p>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <p className="font-semibold text-slate-200">{proj.leader?.name || 'Leader'}</p>
                      <p className="text-[10px] text-slate-500">{proj.teamMembers?.length || 1} team members</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-400">
                      {proj.cohort || proj.deadline?.batch || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeStyle(proj.status)}`}>
                        {proj.status.toUpperCase().replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {proj.status === 'draft' ? (
                        <span className="text-slate-500 italic text-[11px]">Draft</span>
                      ) : (
                        <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                          proj.plagiarismScore > 20
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {proj.plagiarismScore || 0}% Match
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {proj.assignedFaculty ? (
                        <span className="font-semibold text-emerald-400 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          {proj.assignedFaculty.name}
                        </span>
                      ) : (
                        <span className="text-amber-400 font-semibold italic text-[11px]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={selectedFaculty[proj._id] || (proj.assignedFaculty?._id || '')}
                          onChange={(e) => setSelectedFaculty(prev => ({ ...prev, [proj._id]: e.target.value }))}
                          className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white focus:outline-none"
                        >
                          <option value="">Select Faculty</option>
                          {facultyList.map(f => (
                            <option key={f._id} value={f._id}>
                              {f.name} ({f.department})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignReviewer(proj._id)}
                          disabled={assigningId === proj._id || !selectedFaculty[proj._id]}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {assigningId === proj._id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            'Assign'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">No project submissions yet to allocate.</div>
        )}
      </div>

      {/* Complaints Management Section */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-500" />
              Student Complaints & Appeals
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">Review student grievances, update resolution statuses, and respond formally.</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {complaints.length} Total Complaints
          </span>
        </div>

        {complaints.length > 0 ? (
          <div className="space-y-4 pt-2">
            {complaints.map(c => (
              <div key={c._id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900/30 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h4 className="font-semibold text-sm text-white">{c.subject}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Submitted by: <strong className="text-slate-200">{c.user?.name}</strong> ({c.user?.email}) • Project: "{c.project?.title}"
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full capitalize ${
                    c.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    c.status === 'in_review' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  }`}>
                    {c.status?.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-xs text-[var(--text-secondary)] bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                  {c.description}
                </p>

                {c.adminResponse && (
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
                    <strong className="text-emerald-400 block mb-0.5">Admin Response:</strong>
                    <p className="text-slate-200">{c.adminResponse}</p>
                  </div>
                )}

                {/* Status action buttons */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Update Status:</span>
                    <button
                      onClick={() => handleUpdateComplaint(c._id, 'in_review')}
                      disabled={updatingComplaintId === c._id || c.status === 'in_review'}
                      className="px-2.5 py-1 text-xs rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer disabled:opacity-40"
                    >
                      In Review
                    </button>
                    <button
                      onClick={() => handleUpdateComplaint(c._id, 'resolved')}
                      disabled={updatingComplaintId === c._id || c.status === 'resolved'}
                      className="px-2.5 py-1 text-xs rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-40"
                    >
                      Resolved
                    </button>
                    <button
                      onClick={() => setRespondingId(respondingId === c._id ? null : c._id)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 border border-blue-500/20 transition-all cursor-pointer"
                    >
                      {respondingId === c._id ? 'Cancel' : 'Reply / Response'}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{formatDate(c.createdAt)}</span>
                </div>

                {/* Inline response box */}
                {respondingId === c._id && (
                  <div className="pt-2 space-y-2">
                    <textarea
                      value={responseText[c._id] || ''}
                      onChange={(e) => setResponseText(prev => ({ ...prev, [c._id]: e.target.value }))}
                      placeholder="Enter official administrative resolution or feedback..."
                      rows={2}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleUpdateComplaint(c._id, 'resolved')}
                        disabled={updatingComplaintId === c._id || !responseText[c._id]?.trim()}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send Response & Resolve
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">No student complaints filed.</div>
        )}
      </div>
    </div>
  );
}
