const ONE_DRIVE_API_BASE = 'https://graph.microsoft.com/v1.0';
const GOOGLE_PHOTOS_API_BASE = 'https://photoslibrary.googleapis.com/v1';
const GOOGLE_PHOTOS_UPLOAD_BASE = 'https://photoslibrary.googleapis.com/v1/uploads';
const GOOGLE_DRIVE_UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const StoredFile = require('../models/StoredFile');

const tokenCache = {
  onedrive: { value: null, expiresAt: 0 },
  googlePhotos: { value: null, expiresAt: 0 },
  googleDrive: { value: null, expiresAt: 0 },
};

function getStorageProvider() {
  const provider = (process.env.STORAGE_PROVIDER || 'mongodb').trim().toLowerCase();
  if (provider === 'google_photos' || provider === 'google_drive' || provider === 'onedrive' || provider === 'mongodb') return provider;
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for cloud storage integration`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function encodePath(pathValue) {
  return pathValue
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function getOneDriveAccessToken() {
  const now = Date.now();
  if (tokenCache.onedrive.value && tokenCache.onedrive.expiresAt > now + 60 * 1000) {
    return tokenCache.onedrive.value;
  }

  const tenantId = requiredEnv('ONEDRIVE_TENANT_ID');
  const clientId = requiredEnv('ONEDRIVE_CLIENT_ID');
  const clientSecret = requiredEnv('ONEDRIVE_CLIENT_SECRET');

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to fetch OneDrive access token: ${details}`);
  }

  const payload = await response.json();
  tokenCache.onedrive.value = payload.access_token;
  tokenCache.onedrive.expiresAt = now + (payload.expires_in || 3600) * 1000;
  return tokenCache.onedrive.value;
}

async function graphRequest(url, options = {}, retryCount = 2) {
  const token = await getOneDriveAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (response.ok) {
    return response;
  }

  const shouldRetry = (response.status === 429 || response.status >= 500) && retryCount > 0;
  if (shouldRetry) {
    const waitSeconds = Number(response.headers.get('retry-after') || '1');
    await sleep(Math.max(500, waitSeconds * 1000));
    return graphRequest(url, options, retryCount - 1);
  }

  const details = await response.text();
  throw new Error(`OneDrive request failed (${response.status}): ${details}`);
}

async function getGooglePhotosAccessToken() {
  const now = Date.now();
  if (tokenCache.googlePhotos.value && tokenCache.googlePhotos.expiresAt > now + 60 * 1000) {
    return tokenCache.googlePhotos.value;
  }

  const clientId = requiredEnv('GOOGLE_PHOTOS_CLIENT_ID');
  const clientSecret = requiredEnv('GOOGLE_PHOTOS_CLIENT_SECRET');
  const refreshToken = requiredEnv('GOOGLE_PHOTOS_REFRESH_TOKEN');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to fetch Google Photos access token: ${details}`);
  }

  const payload = await response.json();
  tokenCache.googlePhotos.value = payload.access_token;
  tokenCache.googlePhotos.expiresAt = now + (payload.expires_in || 3600) * 1000;
  return tokenCache.googlePhotos.value;
}

async function photosRequest(url, options = {}, retryCount = 2) {
  const token = await getGooglePhotosAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  if (response.ok) return response;

  const shouldRetry = (response.status === 429 || response.status >= 500) && retryCount > 0;
  if (shouldRetry) {
    await sleep(1000);
    return photosRequest(url, options, retryCount - 1);
  }

  const details = await response.text();
  throw new Error(`Google Photos request failed (${response.status}): ${details}`);
}

async function getGoogleDriveAccessToken() {
  const now = Date.now();
  if (tokenCache.googleDrive.value && tokenCache.googleDrive.expiresAt > now + 60 * 1000) {
    return tokenCache.googleDrive.value;
  }

  const clientId = requiredEnv('GOOGLE_DRIVE_CLIENT_ID');
  const clientSecret = requiredEnv('GOOGLE_DRIVE_CLIENT_SECRET');
  const refreshToken = requiredEnv('GOOGLE_DRIVE_REFRESH_TOKEN');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to fetch Google Drive access token: ${details}`);
  }

  const payload = await response.json();
  tokenCache.googleDrive.value = payload.access_token;
  tokenCache.googleDrive.expiresAt = now + (payload.expires_in || 3600) * 1000;
  return tokenCache.googleDrive.value;
}

async function driveRequest(url, options = {}, retryCount = 2) {
  const token = await getGoogleDriveAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  if (response.ok) return response;

  const shouldRetry = (response.status === 429 || response.status >= 500) && retryCount > 0;
  if (shouldRetry) {
    await sleep(1000);
    return driveRequest(url, options, retryCount - 1);
  }

  const details = await response.text();
  throw new Error(`Google Drive request failed (${response.status}): ${details}`);
}

function getDriveId() {
  return requiredEnv('ONEDRIVE_DRIVE_ID');
}

function getRootFolder() {
  return process.env.ONEDRIVE_ROOT_FOLDER?.trim() || 'college-memories';
}

async function uploadBuffer({ buffer, fileName, contentType, folder = 'general' }) {
  const provider = getStorageProvider();
  if (provider === 'mongodb') {
    const stored = await StoredFile.create({
      provider,
      fileName: sanitizeFileName(fileName),
      contentType: contentType || 'application/octet-stream',
      size: buffer.length,
      folder,
      data: buffer,
    });

    return {
      provider: 'mongodb',
      id: String(stored._id),
      name: stored.fileName,
      size: stored.size,
      webUrl: '',
      downloadUrl: '',
    };
  }

  if (provider === 'google_drive') {
    const boundary = `memory-upload-${Date.now()}`;
    const metadata = {
      name: sanitizeFileName(fileName),
      description: `Memory upload (${folder})`,
    };

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    if (folderId) {
      metadata.parents = [folderId];
    }

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    );
    const ending = Buffer.from(`\r\n--${boundary}--`);
    const multipartBody = Buffer.concat([preamble, buffer, ending]);

    const uploadUrl = `${GOOGLE_DRIVE_UPLOAD_API_BASE}?uploadType=multipart&supportsAllDrives=true&fields=id,name,size,webViewLink,webContentLink`;
    const response = await driveRequest(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    const payload = await response.json();
    return {
      provider: 'google_drive',
      id: payload.id,
      name: payload.name,
      size: Number(payload.size || buffer.length),
      webUrl: payload.webViewLink || '',
      downloadUrl: payload.webContentLink || '',
    };
  }

  if (provider === 'google_photos') {
    const token = await getGooglePhotosAccessToken();

    const uploadResponse = await fetch(GOOGLE_PHOTOS_UPLOAD_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-Protocol': 'raw',
        'X-Goog-Upload-File-Name': sanitizeFileName(fileName),
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const details = await uploadResponse.text();
      throw new Error(`Google Photos upload token failed (${uploadResponse.status}): ${details}`);
    }

    const uploadToken = await uploadResponse.text();
    const createResponse = await photosRequest(`${GOOGLE_PHOTOS_API_BASE}/mediaItems:batchCreate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newMediaItems: [
          {
            description: folder,
            simpleMediaItem: {
              uploadToken,
              fileName: sanitizeFileName(fileName),
            },
          },
        ],
      }),
    });

    const payload = await createResponse.json();
    const first = payload.newMediaItemResults?.[0];
    if (!first?.mediaItem?.id) {
      throw new Error(`Google Photos media create failed: ${JSON.stringify(payload)}`);
    }

    return {
      provider: 'google_photos',
      id: first.mediaItem.id,
      name: first.mediaItem.filename,
      size: buffer.length,
      webUrl: first.mediaItem.productUrl || '',
      downloadUrl: `${first.mediaItem.baseUrl}=d`,
    };
  }

  const safeName = sanitizeFileName(fileName);
  const fullPath = `${getRootFolder()}/${folder}/${safeName}`;
  const encoded = encodePath(fullPath);
  const driveId = getDriveId();
  const url = `${ONE_DRIVE_API_BASE}/drives/${driveId}/root:/${encoded}:/content`;

  const response = await graphRequest(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: buffer,
  });

  const payload = await response.json();
  return {
    provider: 'onedrive',
    id: payload.id,
    name: payload.name,
    size: payload.size,
    webUrl: payload.webUrl,
    downloadUrl: payload['@microsoft.graph.downloadUrl'] || '',
  };
}

async function deleteFile(fileId) {
  if (!fileId) return;

  const provider = getStorageProvider();
  if (provider === 'mongodb') {
    await StoredFile.findByIdAndDelete(fileId);
    return;
  }

  if (provider === 'google_drive') {
    try {
      await driveRequest(`${GOOGLE_DRIVE_API_BASE}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
        method: 'DELETE',
      });
    } catch (error) {
      if (!String(error.message).includes('(404)')) {
        throw error;
      }
    }
    return;
  }

  if (provider === 'google_photos') {
    try {
      await photosRequest(`${GOOGLE_PHOTOS_API_BASE}/mediaItems/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      if (!String(error.message).includes('(404)')) {
        throw error;
      }
    }
    return;
  }

  const driveId = getDriveId();
  const url = `${ONE_DRIVE_API_BASE}/drives/${driveId}/items/${encodeURIComponent(fileId)}`;

  try {
    await graphRequest(url, { method: 'DELETE' });
  } catch (error) {
    if (!String(error.message).includes('(404)')) {
      throw error;
    }
  }
}

async function fetchFileStream(fileId) {
  const provider = getStorageProvider();
  if (provider === 'mongodb') {
    const stored = await StoredFile.findById(fileId).select('data contentType');
    if (!stored) {
      throw new Error('Stored file not found');
    }

    return new Response(stored.data, {
      status: 200,
      headers: {
        'Content-Type': stored.contentType || 'application/octet-stream',
      },
    });
  }

  if (provider === 'google_drive') {
    return driveRequest(
      `${GOOGLE_DRIVE_API_BASE}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { method: 'GET' }
    );
  }

  if (provider === 'google_photos') {
    const mediaItemResponse = await photosRequest(
      `${GOOGLE_PHOTOS_API_BASE}/mediaItems/${encodeURIComponent(fileId)}`,
      { method: 'GET' }
    );
    const mediaItem = await mediaItemResponse.json();
    if (!mediaItem?.baseUrl) {
      throw new Error('Google Photos media item has no baseUrl');
    }

    const token = await getGooglePhotosAccessToken();
    const contentResponse = await fetch(`${mediaItem.baseUrl}=d`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!contentResponse.ok) {
      const details = await contentResponse.text();
      throw new Error(`Google Photos content fetch failed (${contentResponse.status}): ${details}`);
    }

    return contentResponse;
  }

  const driveId = getDriveId();
  const url = `${ONE_DRIVE_API_BASE}/drives/${driveId}/items/${encodeURIComponent(fileId)}/content`;
  return graphRequest(url, { method: 'GET' });
}

module.exports = {
  getStorageProvider,
  uploadBuffer,
  deleteFile,
  fetchFileStream,
};
