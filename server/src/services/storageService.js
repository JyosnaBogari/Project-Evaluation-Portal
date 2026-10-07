const { cloudinary } = require('../config/cloudinary');
const crypto = require('crypto');

/**
 * Generates an upload URL.
 * In a real environment, it generates an S3 presigned URL or Cloudinary signature.
 * In our environment, it yields a local server direct-upload destination if cloud variables are missing.
 */
const generatePresignedUrl = (filename, fileType) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const timestamp = Math.round(new Date().getTime() / 1000);
  const uniqueName = `${timestamp}-${filename}`;

  if (cloudName && apiKey && apiSecret) {
    // Generate signature for Cloudinary direct upload
    const paramsToSign = {
      timestamp: timestamp,
      public_id: uniqueName.split('.')[0],
      folder: 'academic_portal',
    };
    
    // Create signature string
    const paramString = Object.keys(paramsToSign)
      .sort()
      .map(key => `${key}=${paramsToSign[key]}`)
      .join('&');
    
    const signature = crypto
      .createHash('sha1')
      .update(paramString + apiSecret)
      .digest('hex');

    return {
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      method: 'POST',
      fields: {
        api_key: apiKey,
        timestamp: timestamp,
        signature: signature,
        public_id: paramsToSign.public_id,
        folder: paramsToSign.folder,
      },
      fileKey: 'file',
    };
  } else {
    // Local development fallback direct upload url
    const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
    return {
      provider: 'local',
      uploadUrl: `${serverUrl}/api/projects/local-upload-direct`,
      method: 'POST',
      fields: {
        filename: uniqueName,
        fileType: fileType,
      },
      fileKey: 'file',
    };
  }
};

module.exports = {
  generatePresignedUrl,
};
