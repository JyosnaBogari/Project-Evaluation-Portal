import { useState } from 'react';
import { getUploadUrl, uploadFileDirectly } from '../services/projectService';

export default function useFileUpload() {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const uploadFile = async (file) => {
    if (!file) return null;
    
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // 1. Fetch direct signed upload path metadata
      const uploadMetadata = await getUploadUrl(file.name, file.type);
      
      // 2. Upload file directly to destination
      const response = await uploadFileDirectly(uploadMetadata, file, (percent) => {
        setProgress(percent);
      });

      return {
        url: response.url,
        hash: response.hash,
        name: file.name,
      };
    } catch (err) {
      console.error('File direct upload failure:', err);
      setError(err.response?.data?.message || 'Failed to upload file');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    uploadFile,
    progress,
    loading,
    error,
    setProgress,
  };
}
