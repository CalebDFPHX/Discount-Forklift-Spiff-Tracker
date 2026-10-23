import React, { useEffect, useRef, useState } from 'react';
import { UploadCloud, X, AlertCircle, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { formatFileSize } from '../lib/formatters';
import { addPhoto, canAddPhoto, getPhotoCountError, MAX_SUBMISSION_PHOTOS, removePhoto as removePhotoByKey } from '../lib/photoAttachments';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PhotoUpload {
  key: string;
  file: File;
  previewUrl: string;
  attachmentId?: string;
  isUploading: boolean;
  progress: number;
  error?: string;
}

interface SalePhotoUploadProps {
  onAttachmentsChange: (attachmentIds: string[]) => void;
  onUploadStateChange: (isUploading: boolean) => void;
  repId?: string;
}

export const SalePhotoUpload: React.FC<SalePhotoUploadProps> = ({
  onAttachmentsChange,
  onUploadStateChange,
  repId,
}) => {
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    onAttachmentsChange(photos.flatMap((photo) => photo.attachmentId ? [photo.attachmentId] : []));
    onUploadStateChange(photos.some((photo) => photo.isUploading));
  }, [photos, onAttachmentsChange, onUploadStateChange]);

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  const updatePhoto = (key: string, update: (photo: PhotoUpload) => PhotoUpload) => {
    setPhotos((current) => current.map((photo) => photo.key === key ? update(photo) : photo));
  };

  const executeUpload = async (photo: PhotoUpload) => {
    updatePhoto(photo.key, (current) => ({ ...current, isUploading: true, progress: 15, error: undefined }));

    try {
      const authRes = await fetch('/api/upload/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId }),
      });
      const authData = await authRes.json();
      if (!authRes.ok) {
        throw new Error(authData.error || 'Server refused upload authorization.');
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const commaIndex = result.indexOf(',');
          resolve(commaIndex !== -1 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = () => reject(reader.error || new Error('Could not read selected photo.'));
        reader.readAsDataURL(photo.file);
      });

      updatePhoto(photo.key, (current) => ({ ...current, progress: 40 }));
      const fileBase64 = await base64Promise;
      updatePhoto(photo.key, (current) => ({ ...current, progress: 70 }));
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-upload-token': authData.token,
        },
        body: JSON.stringify({
          filename: photo.file.name,
          contentType: photo.file.type,
          fileBase64,
          uploadToken: authData.token,
        }),
      });
      const data = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(data.error || 'Server rejected file upload.');
      }

      updatePhoto(photo.key, (current) => ({
        ...current,
        attachmentId: data.attachmentId,
        isUploading: false,
        progress: 100,
      }));
    } catch (error) {
      console.error('Upload failed:', error);
      updatePhoto(photo.key, (current) => ({
        ...current,
        attachmentId: undefined,
        isUploading: false,
        error: error instanceof Error ? error.message : 'Failed to upload photo.',
      }));
    }
  };

  const handleFileSelect = (file?: File) => {
    if (!file) return;
    setUploadError(null);
    const currentPhotos = photosRef.current;
    const photoCountError = getPhotoCountError(currentPhotos.length + 1);
    if (photoCountError) {
      setUploadError(photoCountError);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`File is too large (${formatFileSize(file.size)}). Maximum allowed size is 10 MB.`);
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadError('Unsupported file type. Please upload a JPEG, PNG, or WebP photo.');
      return;
    }

    const newPhoto: PhotoUpload = {
      key: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isUploading: false,
      progress: 0,
    };
    const nextPhotos = addPhoto(currentPhotos, newPhoto);
    if (nextPhotos.length === currentPhotos.length) {
      URL.revokeObjectURL(newPhoto.previewUrl);
      return;
    }
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
    void executeUpload(newPhoto);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (key: string) => {
    const removed = photosRef.current.find((photo) => photo.key === key);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    const nextPhotos = removePhotoByKey(photosRef.current, key);
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
    setUploadError(null);
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items || photos.length >= MAX_SUBMISSION_PHOTOS) return;
      const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (file) handleFileSelect(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [photos]);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    handleFileSelect(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-white">
          Sale Photos — Required <span className="text-rose-400 font-bold">*</span>
        </label>
        <span className="text-[11px] text-gray-400">{photos.length}/{MAX_SUBMISSION_PHOTOS} photos · 10 MB max each</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => handleFileSelect(event.target.files?.[0])}
      />

      {photos.length === 0 ? (
        <div
          ref={dropzoneRef}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-[#95EA00] bg-[#95EA00]/10' : 'border-[#444444] hover:border-[#95EA00] bg-[#1e1e1e] hover:bg-[#252525]'
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center text-gray-300 border border-[#444444]">
              <UploadCloud className="w-5 h-5 text-[#95EA00]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-200">Click to browse, drag & drop, or paste a sale photo</p>
              <p className="text-xs text-gray-400 mt-0.5">JPEG, PNG, or WebP up to 10 MB each (Private Vercel Blob)</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {photos.map((photo, index) => (
            <div key={photo.key} className="border border-[#444444] rounded-lg p-3 bg-[#242424] shadow-md space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-16 h-16 rounded border border-[#444444] overflow-hidden bg-[#1e1e1e] flex-shrink-0">
                    <img src={photo.previewUrl} alt={`Sale photo ${index + 1} preview`} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{photo.file.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(photo.file.size)}</p>
                    {photo.attachmentId && !photo.isUploading && (
                      <div className="flex items-center space-x-1 text-[#95EA00] text-xs mt-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Upload verified & secured</span>
                      </div>
                    )}
                    {photo.error && <p className="text-xs text-rose-300 mt-1">{photo.error}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePhoto(photo.key)}
                  title="Remove photo"
                  aria-label={`Remove photo ${index + 1}`}
                  className="text-gray-400 hover:text-rose-400 p-1 rounded hover:bg-[#2d2d2d] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {photo.isUploading ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-300">
                    <span className="flex items-center space-x-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#95EA00]" />
                      <span>Authorizing and uploading to private storage...</span>
                    </span>
                    <span className="font-mono text-[#95EA00]">{photo.progress}%</span>
                  </div>
                  <div className="w-full bg-[#1e1e1e] rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#A559BD] h-1.5 rounded-full transition-all duration-200" style={{ width: `${photo.progress}%` }} />
                  </div>
                </div>
              ) : photo.error ? (
                <button
                  type="button"
                  onClick={() => void executeUpload(photo)}
                  className="text-xs text-[#95EA00] hover:underline"
                >
                  Retry upload
                </button>
              ) : null}
            </div>
          ))}

          {canAddPhoto(photos.length) && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center space-x-2 px-3 py-2 text-xs font-semibold text-gray-200 bg-[#2d2d2d] hover:bg-[#383838] border border-[#444444] rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4 text-[#95EA00]" />
              <span>Add another photo</span>
            </button>
          )}
        </div>
      )}

      {photos.length === 0 && uploadError && (
        <div className="flex items-start space-x-2 text-xs text-rose-200 bg-rose-950/50 border border-rose-800 p-2.5 rounded-md">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1"><p className="font-bold text-rose-300">Upload Issue</p><p>{uploadError}</p></div>
        </div>
      )}
      {uploadError && photos.length > 0 && (
        <p className="text-xs text-rose-300" role="alert">{uploadError}</p>
      )}
    </div>
  );
};
