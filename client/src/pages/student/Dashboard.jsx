import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getProjects } from '../../services/projectService';
import { getEvaluationsByProject } from '../../services/evaluationService';
import { getDeadlines } from '../../services/adminService';
import { getMyInvitations, acceptInvitation, rejectInvitation } from '../../services/invitationService';
import { getMyNotifications, markAsRead, markAllAsRead } from '../../services/notificationService';
import { getMyComplaints, createComplaint } from '../../services/complaintService';
import { formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import {
  FileText,
  Award,
  Layers,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Mail,
  Bell,
  MessageSquare,
  Check,
  X,
  Send,
  Loader2,
  ArrowRight,
} from 'lucide-react';

export default function StudentDashboard() {
  const { user } = useAuth();

  // Tab State: 'overview' | 'invitations' | 'notifications' | 'complaints'
  const [activeTab, setActiveTab] = useState('overview');

  const [project, setProject] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [deadline, setDeadline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Invitations
  const [invitations, setInvitations] = useState([]);
  const [processingInv, setProcessingInv] = useState(null);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Complaints
  const [complaints, setComplaints] = useState([]);
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [submittingComplaint, setSubmittingComplaint] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // 1. Projects & Evaluations
      const projects = await getProjects();
      if (projects && projects.length > 0) {
        const currentProject = projects[0];
        setProject(currentProject);

        if (!['draft', 'proposal_created'].includes(currentProject.status)) {
          const evals = await getEvaluationsByProject(currentProject._id);
          setEvaluations(evals || []);
        }
      }

      // 2. Deadlines
      const deadlines = await getDeadlines();
      if (deadlines && deadlines.length > 0) {
        const active = deadlines.find(d => d.isActive);
        setDeadline(active);
      }

      // 3. Invitations
      const invs = await getMyInvitations();
      setInvitations(invs || []);

      // 4. Notifications
      const notifData = await getMyNotifications();
      if (notifData) {
        setNotifications(notifData.notifications || []);
        setUnreadCount(notifData.unreadCount || 0);
      }

      // 5. Complaints
      const compList = await getMyComplaints();
      setComplaints(compList || []);
    } catch (err) {
      console.error('Failed to load student dashboard:', err);
      setError('Unable to load dashboard details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Handle Accept Invitation
  const handleAcceptInvite = async (token) => {
    setProcessingInv(token);
    setError(null);
    try {
      await acceptInvitation(token);
      setSuccessMessage('Invitation accepted! You are now a team member.');
      setTimeout(() => setSuccessMessage(null), 3500);
      await fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to accept invitation');
    } finally {
      setProcessingInv(null);
    }
  };

  // Handle Reject Invitation
  const handleRejectInvite = async (token) => {
    setProcessingInv(token);
    setError(null);
    try {
      await rejectInvitation(token);
      setSuccessMessage('Invitation rejected.');
      setTimeout(() => setSuccessMessage(null), 3500);
      await fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject invitation');
    } finally {
      setProcessingInv(null);
    }
  };

  // Handle Mark Notification Read
  const handleMarkNotifRead = async (id) => {
    try {
      await markAsRead(id);
      setNotifications(prev =>
        prev.map(n => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  // Handle Mark All Read
  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  // Handle Create Complaint
  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    if (!project || !complaintSubject.trim() || !complaintDesc.trim()) return;

    setSubmittingComplaint(true);
    setError(null);
    try {
      const newComp = await createComplaint({
        projectId: project._id,
        subject: complaintSubject.trim(),
        description: complaintDesc.trim(),
      });
      setComplaints(prev => [newComp, ...prev]);
      setComplaintSubject('');
      setComplaintDesc('');
      setSuccessMessage('Complaint submitted to administrative review.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit complaint');
    } finally {
      setSubmittingComplaint(false);
    }
  };

  // Countdown string
  const getCountdownString = () => {
    if (!deadline) return 'No active deadlines';
    const diff = new Date(deadline.submissionEndDate) - new Date();
    if (diff < 0) return 'Deadline Closed';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h remaining`;
  };

  const isDeadlineClosed = () => {
    if (!deadline) return false;
    return new Date(deadline.submissionEndDate) - new Date() < 0;
  };

  const getPhaseEvaluation = (phase) => {
    return evaluations.find(e => e.phase === phase);
  };

  const getStepStatus = (phase) => {
    const evaluation = getPhaseEvaluation(phase);
    if (evaluation) return 'completed';
    if (!project) return 'pending';
    if (project.status === 'submitted') {
      return phase === 'abstract' ? 'current' : 'pending';
    }
    if (project.status === 'under_review') {
      const abstractEval = getPhaseEvaluation('abstract');
      if (!abstractEval) return 'current';
      return phase === 'midterm' ? 'current' : 'pending';
    }
    return 'pending';
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-slate-800/50 rounded-2xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-48 bg-slate-800/50 rounded-2xl md:col-span-2"></div>
          <div className="h-48 bg-slate-800/50 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  const pendingInvs = invitations.filter(i => i.status === 'pending');

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border-blue-500/10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Student Portal</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            Welcome back, <strong className="text-white">{user?.name}</strong> • Department:{' '}
            <span className="text-blue-400 font-semibold">{user?.department}</span>
            {user?.rollNumber && ` • Roll: ${user.rollNumber}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/submit"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
          >
            {project
              ? (['proposal_created', 'draft'].includes(project.status) ? 'View Proposal' : 'View Project')
              : 'Create Project Proposal'}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex gap-3 items-center">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex gap-3 items-center">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 font-semibold transition-all cursor-pointer relative ${
            activeTab === 'overview'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          Overview & Milestones
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          className={`pb-3 font-semibold transition-all cursor-pointer relative flex items-center gap-2 ${
            activeTab === 'invitations'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <Mail className="w-4 h-4" />
          Team Invitations
          {pendingInvs.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-500 text-white text-[10px] font-bold">
              {pendingInvs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`pb-3 font-semibold transition-all cursor-pointer relative flex items-center gap-2 ${
            activeTab === 'notifications'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('complaints')}
          className={`pb-3 font-semibold transition-all cursor-pointer relative flex items-center gap-2 ${
            activeTab === 'complaints'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Complaints
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main section */}
          <div className="lg:col-span-8 space-y-8">
            {project ? (
              <>
                {/* Project Card */}
                <div className="glass-panel p-6 rounded-2xl space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusBadgeStyle(['proposal_created', 'draft'].includes(project.status) ? 'proposal_created' : project.status)}`}>
                        {['proposal_created', 'draft'].includes(project.status) ? 'PROJECT PROPOSAL' : project.status.toUpperCase().replace('_', ' ')}
                      </span>
                      <h2 className="text-xl font-bold mt-2">{project.title}</h2>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{project.description}</p>
                    </div>
                    {!['draft', 'proposal_created'].includes(project.status) && (
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Plagiarism Score</span>
                        <p className={`text-lg font-bold ${project.plagiarismScore > 15 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {project.plagiarismScore}%
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-900 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Team Size</p>
                        <p className="text-xs font-semibold">{project.teamMembers?.length || 1} Members</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-indigo-500" />
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Submission Status</p>
                        <p className="text-xs font-semibold">
                          {['proposal_created', 'draft'].includes(project.status)
                            ? 'Proposal Created'
                            : formatDate(project.submittedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Award className="w-5 h-5 text-purple-500" />
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">
                          {['proposal_created', 'draft'].includes(project.status) ? 'Project Guide' : 'Evaluator'}
                        </p>
                        <p className="text-xs font-semibold">
                          {project.assignedFaculty ? project.assignedFaculty.name : ['proposal_created', 'draft'].includes(project.status) ? 'Not Assigned' : 'Awaiting Reviewer'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {['proposal_created', 'draft'].includes(project.status) && (
                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <div className="text-xs text-(--text-secondary)">
                        <p>Project Guide: <strong className="text-(--text-primary)">{project.assignedFaculty?.name || 'Not Assigned'}</strong></p>
                        <p className="mt-1">Last Updated: {formatDate(project.updatedAt || project.createdAt)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Link to="/submit?mode=view" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">
                          View Proposal
                        </Link>
                        {(project.leader?._id === user?._id || project.leader === user?._id) && (
                          <Link to="/submit?mode=edit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                            Edit Proposal
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress Stepper Visualizer */}
                {!['draft', 'proposal_created'].includes(project.status) && (
                  <div className="glass-panel p-6 rounded-2xl">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <Layers className="w-5 h-5 text-blue-500" />
                      Evaluation Milestone Tracker
                    </h3>

                    <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                      {/* Phase 1: Abstract */}
                      <div className="flex-1 flex gap-4 sm:flex-col sm:items-center text-left sm:text-center relative">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          getStepStatus('abstract') === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-500 border-2 border-emerald-500'
                            : getStepStatus('abstract') === 'current'
                            ? 'bg-blue-500/10 text-blue-500 border-2 border-blue-500 animate-pulse'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}>
                          {getStepStatus('abstract') === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : '1'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Phase 1: Abstract Approval</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">SRS & Problem Scope</p>
                          {getPhaseEvaluation('abstract') && (
                            <p className="text-xs font-bold text-emerald-500 mt-1">
                              Marks: {getPhaseEvaluation('abstract').totalScore}/30
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Phase 2: Midterm */}
                      <div className="flex-1 flex gap-4 sm:flex-col sm:items-center text-left sm:text-center relative">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          getStepStatus('midterm') === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-500 border-2 border-emerald-500'
                            : getStepStatus('midterm') === 'current'
                            ? 'bg-blue-500/10 text-blue-500 border-2 border-blue-500 animate-pulse'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}>
                          {getStepStatus('midterm') === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : '2'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Phase 2: Midterm Demo</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Architecture & DB Setup</p>
                          {getPhaseEvaluation('midterm') && (
                            <p className="text-xs font-bold text-emerald-500 mt-1">
                              Marks: {getPhaseEvaluation('midterm').totalScore}/40
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Phase 3: Final */}
                      <div className="flex-1 flex gap-4 sm:flex-col sm:items-center text-left sm:text-center relative">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          getStepStatus('final') === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-500 border-2 border-emerald-500'
                            : getStepStatus('final') === 'current'
                            ? 'bg-blue-500/10 text-blue-500 border-2 border-blue-500 animate-pulse'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}>
                          {getStepStatus('final') === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : '3'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Phase 3: Final Viva</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Code Presentation & Q&A</p>
                          {getPhaseEvaluation('final') && (
                            <p className="text-xs font-bold text-emerald-500 mt-1">
                              Marks: {getPhaseEvaluation('final').totalScore}/60
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rubric Marksheets detail cards */}
                {evaluations.length > 0 && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-500" />
                      Published Milestone Grades
                    </h3>

                    {evaluations.map(e => (
                      <div key={e._id} className="glass-panel p-6 rounded-2xl border-l-4 border-l-blue-500">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-md border border-blue-500/20">
                            {e.phase?.toUpperCase()} EVALUATION
                          </span>
                          <div className="text-right">
                            <span className="text-xs text-[var(--text-secondary)]">Total Score: </span>
                            <span className="font-extrabold text-blue-500">{e.totalScore}</span>
                          </div>
                        </div>

                        <div className="space-y-3 mb-4">
                          {e.scores?.map((sc, idx) => {
                            const percentage = (sc.scoredMarks / sc.maxMarks) * 100;
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-xs font-semibold">
                                  <span>{sc.criteriaName}</span>
                                  <span>{sc.scoredMarks} / {sc.maxMarks}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500" style={{ width: `${percentage}%` }}></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {e.feedback && (
                          <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-800 text-xs text-[var(--text-secondary)]">
                            <strong className="text-white block mb-1">Evaluator Comments:</strong>
                            "{e.feedback}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="glass-panel p-12 rounded-2xl text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <FileText className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold">No Project Proposal Yet</h3>
                <p className="text-(--text-secondary) text-sm max-w-sm mx-auto">
                  Create a proposal for your project idea. You can save it even if Faculty/Admin has not configured a submission deadline.
                </p>
                <div className="pt-2">
                  <Link
                    to="/submit"
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer"
                  >
                    Create Project Proposal
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="lg:col-span-4 space-y-6">
            {/* Deadline Countdown widget */}
            <div className="glass-panel p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950/40 border-indigo-500/10">
              <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-400 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Submission Deadline
              </h3>

              {deadline ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-white text-lg">{deadline.title}</h4>
                    <p className="text-slate-400 text-xs mt-0.5">Cohort Target: {deadline.batch}</p>
                  </div>

                  <div className={`p-4 rounded-xl text-center border ${
                    isDeadlineClosed()
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300 animate-glow'
                  }`}>
                    <p className="text-xs uppercase font-bold tracking-wider opacity-70">Submission Time Window</p>
                    <p className="text-2xl font-black mt-1.5 tracking-tight font-mono">{getCountdownString()}</p>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                    <div className="flex justify-between">
                      <span>Window Opens:</span>
                      <span className="font-semibold text-white">{new Date(deadline.submissionStartDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Submission Cutoff:</span>
                      <span className="font-semibold text-white">{new Date(deadline.submissionEndDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-sm py-4">No active timelines scheduled currently.</div>
              )}
            </div>

            {/* Submission Guidelines */}
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <h4 className="font-bold text-sm uppercase tracking-wider text-slate-400">
                {!project || ['proposal_created', 'draft'].includes(project.status) ? 'Proposal Checklist' : 'Submission Checklist'}
              </h4>
              {!project || ['proposal_created', 'draft'].includes(project.status) ? (
                <ul className="space-y-3 text-xs text-(--text-secondary)">
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /><span>Complete the required project proposal details.</span></li>
                  <li className="flex gap-2"><Clock className="w-4 h-4 text-blue-400 shrink-0" /><span>Faculty/Admin will assign a project guide and configure submission deadlines.</span></li>
                  <li className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /><span>Document uploads become available in a later project stage.</span></li>
                </ul>
              ) : (
                <ul className="space-y-3 text-xs text-[var(--text-secondary)]">
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /><span>Upload PDF document describing project Abstract/SRS scoping parameters.</span></li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /><span>Submit slide deck presentation file (.ppt / .pptx).</span></li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /><span>Bundle complete project source codes inside a compressed archive (.zip).</span></li>
                  <li className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /><span>System computes SHA-256 duplicate scans and copy checks instantly.</span></li>
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Team Invitations */}
      {activeTab === 'invitations' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-500" />
              Received Team Invitations
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              When a team leader invites you using your registered email address, it will appear here. Accepting will add you to their project team.
            </p>

            {invitations.length > 0 ? (
              <div className="space-y-3 pt-2">
                {invitations.map(inv => (
                  <div
                    key={inv._id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                  >
                    <div>
                      <p className="font-semibold text-sm text-white">{inv.project?.title || 'Project Invitation'}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Invited by: <strong className="text-slate-300">{inv.invitedBy?.name}</strong> ({inv.invitedBy?.email})
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {inv.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleAcceptInvite(inv.token)}
                            disabled={processingInv === inv.token}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {processingInv === inv.token ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Accept
                          </button>
                          <button
                            onClick={() => handleRejectInvite(inv.token)}
                            disabled={processingInv === inv.token}
                            className="px-3.5 py-1.5 bg-red-600/80 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${
                          inv.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-400' :
                          inv.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {inv.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No team invitations received.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Notifications */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-500" />
                  In-App Notifications
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">Stay updated on team invitations, grading milestones, and assignment status.</p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all cursor-pointer"
                >
                  Mark All as Read
                </button>
              )}
            </div>

            {notifications.length > 0 ? (
              <div className="space-y-3 pt-2">
                {notifications.map(n => (
                  <div
                    key={n._id}
                    onClick={() => !n.isRead && handleMarkNotifRead(n._id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      n.isRead
                        ? 'border-slate-800/60 bg-slate-950/30 text-slate-400'
                        : 'border-blue-500/30 bg-blue-500/5 text-white shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-white">{n.title}</p>
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 mt-1">{n.message}</p>
                        <p className="text-[10px] text-slate-500 mt-1.5 font-mono">{formatDate(n.createdAt)}</p>
                      </div>
                      {!n.isRead && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkNotifRead(n._id);
                          }}
                          className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Complaints */}
      {activeTab === 'complaints' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Submit Complaint Form */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <h3 className="font-bold text-base flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                Submit a Project Complaint
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                File a formal complaint or appeal regarding your project submission, evaluation, or reviewer allocation.
              </p>

              {project ? (
                <form onSubmit={handleCreateComplaint} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Project
                    </label>
                    <p className="text-sm font-semibold text-white px-3 py-2 bg-slate-900/60 rounded-xl border border-slate-800">
                      {project.title}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={complaintSubject}
                      onChange={(e) => setComplaintSubject(e.target.value)}
                      placeholder="e.g. Discrepancy in Midterm Rubric Marks"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Description & Details
                    </label>
                    <textarea
                      value={complaintDesc}
                      onChange={(e) => setComplaintDesc(e.target.value)}
                      rows={4}
                      placeholder="Describe the issue, specific criteria questioned, or explanation..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingComplaint}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submittingComplaint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit Complaint
                  </button>
                </form>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400 text-center">
                  You must have an active project before submitting a complaint.
                </div>
              )}
            </div>
          </div>

          {/* List of Complaints */}
          <div className="lg:col-span-7 space-y-6">
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <h3 className="font-bold text-base">My Submitted Complaints</h3>
              {complaints.length > 0 ? (
                <div className="space-y-4 pt-2">
                  {complaints.map(c => (
                    <div key={c._id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900/30 space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-sm text-white">{c.subject}</h4>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full capitalize ${
                          c.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          c.status === 'in_review' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}>
                          {c.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{c.description}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{formatDate(c.createdAt)}</p>

                      {c.adminResponse && (
                        <div className="mt-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
                          <strong className="text-emerald-400 block mb-1">Administrative Response:</strong>
                          <p className="text-slate-200">{c.adminResponse}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  No complaints filed.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
