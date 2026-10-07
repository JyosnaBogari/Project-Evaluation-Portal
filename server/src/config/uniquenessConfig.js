module.exports = {
  algorithm: 'TF-IDF + Cosine Similarity',
  thresholds: {
    likelyUniqueMax: 39,
    needsAttentionMax: 69,
  },
  statuses: {
    notChecked: 'not_checked',
    checking: 'checking',
    completed: 'completed',
    failed: 'failed',
  },
  results: {
    likelyUnique: 'likely_unique',
    needsAttention: 'needs_attention',
    highSimilarity: 'high_similarity',
  },
  comparisonFields: [
    'title',
    'domain',
    'abstract',
    'problemStatement',
    'objectives',
    'methodology',
    'technologies',
    'expectedOutcome',
  ],
};
