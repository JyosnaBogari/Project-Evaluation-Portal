import React, { useState, useEffect } from 'react';
import { submitEvaluation, getEvaluationsByProject } from '../../services/evaluationService';
import { PHASE_CRITERIA } from '../../utils/constants';
import { X, CheckCircle, Award, Loader2, AlertCircle } from 'lucide-react';

export default function EvaluateModal({ isOpen, onClose, project, onSuccess }) {
  const [phase, setPhase] = useState('abstract');
  const [criteriaScores, setCriteriaScores] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Initialize/reset scores when phase or project changes
  useEffect(() => {
    if (project) {
      const activeCriteria = PHASE_CRITERIA[phase];
      const initialScores = activeCriteria.map(c => ({
        criteriaName: c.name,
        maxMarks: c.maxMarks,
        scoredMarks: 0,
      }));
      setCriteriaScores(initialScores);
      setFeedback('');
      setError(null);
      
      // Load previous draft/eval if it exists for this project and phase
      const fetchExistingEval = async () => {
        try {
          const evals = await getEvaluationsByProject(project._id);
          const currentPhaseEval = evals.find(e => e.phase === phase);
          if (currentPhaseEval) {
            setCriteriaScores(currentPhaseEval.scores);
            setFeedback(currentPhaseEval.feedback || '');
          }
        } catch (err) {
          console.warn('No previous evaluation found for this phase.');
        }
      };
      fetchExistingEval();
    }
  }, [project, phase]);

  if (!isOpen || !project) return null;

  const handleScoreChange = (index, value) => {
    const updated = [...criteriaScores];
    updated[index].scoredMarks = Math.max(0, Math.min(updated[index].maxMarks, Number(value)));
    setCriteriaScores(updated);
  };

  const totalScore = criteriaScores.reduce((acc, curr) => acc + Number(curr.scoredMarks), 0);
  const maxTotalScore = PHASE_CRITERIA[phase].reduce((acc, curr) => acc + curr.maxMarks, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await submitEvaluation({
        projectId: project._id,
        phase,
        scores: criteriaScores,
        feedback,
        isPublished: true, // Auto publish on submit
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit evaluation details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl glass-panel-glow rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-950/40">
          <div>
            <h3 className="text-lg font-bold">Project Evaluation Panel</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">Grading team project: {project.title}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Project Details Panel (Left) */}
          <div className="md:col-span-5 space-y-5 border-r border-slate-200 dark:border-slate-800 pr-0 md:pr-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Submission Details</span>
              <h4 className="font-bold text-sm text-white mt-1">{project.title}</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{project.description}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Submitted Assets</span>
              <div className="space-y-2 mt-2">
                {project.files?.reportUrl ? (
                  <a
                    href={project.files.reportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 transition-all"
                  >
                    <span>Download Report (PDF)</span>
                  </a>
                ) : (
                  <p className="text-xs text-slate-500 italic">No Report file submitted</p>
                )}

                {project.files?.pptUrl ? (
                  <a
                    href={project.files.pptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/5 transition-all"
                  >
                    <span>Download Slides (PPT)</span>
                  </a>
                ) : (
                  <p className="text-xs text-slate-500 italic">No Slides file submitted</p>
                )}

                {project.files?.codeZipUrl ? (
                  <a
                    href={project.files.codeZipUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-semibold text-purple-400 hover:text-purple-300 hover:bg-purple-500/5 transition-all"
                  >
                    <span>Download Source (ZIP)</span>
                  </a>
                ) : (
                  <p className="text-xs text-slate-500 italic">No Source code ZIP submitted</p>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Team Size:</span>
                <span className="font-semibold">{project.teamMembers?.length} students</span>
              </div>
              {project.plagiarismScore > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Integrity Match:</span>
                  <span className={`font-semibold ${project.plagiarismScore > 15 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {project.plagiarismScore}% matches detected
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Grading Rubric Panel (Right) */}
          <form onSubmit={handleSubmit} className="md:col-span-7 space-y-6">
            {error && (
              <div className="p-3 text-xs rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex gap-2 items-center">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            {/* Select Grading Stage */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Select Evaluation Phase
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['abstract', 'midterm', 'final'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPhase(p)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      phase === p
                        ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                        : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400'
                    }`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Render Criteria sliders */}
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2 text-indigo-400">
                <Award className="w-4 h-4" />
                Phase Rubric Scores ({phase.toUpperCase()})
              </h4>
              
              {criteriaScores.map((score, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{score.criteriaName}</span>
                    <span className="text-indigo-400 font-bold">{score.scoredMarks} / {score.maxMarks}</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <input
                      type="range"
                      min="0"
                      max={score.maxMarks}
                      value={score.scoredMarks}
                      onChange={(e) => handleScoreChange(index, e.target.value)}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max={score.maxMarks}
                      value={score.scoredMarks}
                      onChange={(e) => handleScoreChange(index, e.target.value)}
                      className="w-14 px-2 py-1 text-center text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Actions & Feedback */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Actionable Feedback & Notes
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-xs focus:outline-none text-white focus:ring-1 focus:ring-blue-500"
                  placeholder="Provide guidance notes for student team adjustments..."
                  required
                />
              </div>

              {/* Total Score display */}
              <div className="p-3.5 rounded-xl border border-blue-500/10 bg-blue-500/5 flex justify-between items-center text-sm">
                <span className="font-semibold text-slate-400">Summed Total Marks:</span>
                <span className="font-extrabold text-blue-500 text-lg">
                  {totalScore} <span className="text-xs text-slate-500 font-normal">/ {maxTotalScore}</span>
                </span>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded-xl text-xs font-semibold cursor-pointer text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-500/10 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Submit Marks</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
