import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Image as ImageIcon, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { formatFileSize } from '../lib/formatters';

interface SalePhotoUploadProps {
  onAttachmentSuccess: (attachmentId: string, filename: string, sizeBytes: number) => void;
  onAttachmentRemoved: () => void;
  initialAttachmentId?: string | null;
  repId?: string;
}

export const SalePhotoUpload: React.FC<SalePhotoUploadProps> = ({
  onAttachmentSuccess,
  onAttachmentRemoved,
  initialAttachmentId,
  repId,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentId, setAttachmentId] = useState<string | null>(initialAttachmentId || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  // Global paste handler when user copies image to clipboard and presses Ctrl+V anywhere on form or dropzone
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (attachmentId || isUploading) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileSelect(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [attachmentId, isUploading]);

  const handleFileSelect = async (file: File) => {
    setUploadError(null);
    setWasRemoved(false);

    // Max 10MB validation
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`File is too large (${formatFileSize(file.size)}). Maximum allowed size is 10 MB.`);
      return;
    }

    // MIME type check
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setUploadError('Unsupported file type. Please upload a JPEG, PNG, or WebP photo.');
      return;
    }

    setSelectedFile(file);

    // Create local object URL for instant preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Begin upload to server
    await executeUpload(file);
  };

  const executeUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(15);

    try {
      // 1. Obtain short-lived upload authorization token scoped to this attempt
      const authRes = await fetch('/api/upload/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId }),
      });
      const authData = await authRes.json();
      if (!authRes.ok) {
        throw new Error(authData.error || 'Server refused upload authorization.');
      }
      const uploadToken = authData.token;

      // 2. Read binary file data
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const commaIdx = res.indexOf(',');
          resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setUploadProgress(40);
      const base64Data = await base64Promise;

      setUploadProgress(70);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${uploadToken}`,
          'x-upload-token': uploadToken,
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileBase64: base64Data,
          uploadToken,
        }),
      });

      const data = await res.json();
      setUploadProgress(100);

      if (!res.ok) {
        throw new Error(data.error || 'Server rejected file upload.');
      }

      setAttachmentId(data.attachmentId);
      onAttachmentSuccess(data.attachmentId, data.filename, data.sizeBytes);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadError(err.message || 'Failed to upload photo. You can retry or replace the photo.');
      setAttachmentId(null);
    } finally {
      setIsUploading(false);
    }
  };

  const [wasRemoved, setWasRemoved] = useState(false);

  const handleRemove = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setAttachmentId(null);
    setUploadError(null);
    setWasRemoved(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onAttachmentRemoved();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-white">
          Sale Photo — Required <span className="text-rose-400 font-bold">*</span>
        </label>
        <span className="text-[11px] text-gray-400">Supports paste (Ctrl+V), drag & drop, or mobile camera</span>
      </div>

      {!previewUrl ? (
        <div
          ref={dropzoneRef}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-[#95EA00] bg-[#95EA00]/10'
              : 'border-[#444444] hover:border-[#95EA00] bg-[#1e1e1e] hover:bg-[#252525]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center text-gray-300 border border-[#444444]">
              <UploadCloud className="w-5 h-5 text-[#95EA00]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-200">
                Click to browse photo, drag & drop here, or paste from clipboard
              </p>
              <p className="text-xs text-gray-400 mt-0.5">JPEG, PNG, or WebP up to 10 MB (Private Vercel Blob)</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-[#444444] rounded-lg p-3 bg-[#242424] shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="relative w-16 h-16 rounded border border-[#444444] overflow-hidden bg-[#1e1e1e] flex-shrink-0">
                <img
                  src={previewUrl}
                  alt="Sale preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {selectedFile?.name || 'Attached Photo'}
                </p>
                <p className="text-xs text-gray-400">
                  {selectedFile ? formatFileSize(selectedFile.size) : ''}
                </p>
                {attachmentId && !isUploading && (
                  <div className="flex items-center space-x-1 text-[#95EA00] text-xs mt-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#95EA00]" />
                    <span>Upload verified & secured</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-xs text-gray-200 hover:text-white font-medium px-2.5 py-1 rounded border border-[#444444] bg-[#2d2d2d] hover:bg-[#383838] transition-colors"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={isUploading}
                title="Remove photo"
                className="text-gray-400 hover:text-rose-400 p-1 rounded hover:bg-[#2d2d2d] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-300">
                <span className="flex items-center space-x-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#95EA00]" />
                  <span>Authorizing and uploading to private storage...</span>
                </span>
                <span className="font-mono text-[#95EA00]">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-[#1e1e1e] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#A559BD] h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Replacement prompt when photo was removed */}
      {wasRemoved && !previewUrl && (
        <div className="flex items-start space-x-2 text-xs text-amber-200 bg-amber-950/50 border border-amber-800 p-2.5 rounded-md">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-amber-300">Replacement Photo Required</p>
            <p>You removed the previous photo. Please attach a replacement sale photo before submitting your spiff request.</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {uploadError && (
        <div className="flex items-start space-x-2 text-xs text-rose-200 bg-rose-950/50 border border-rose-800 p-2.5 rounded-md">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-rose-300">Upload Issue</p>
            <p>{uploadError}</p>
          </div>
        </div>
      )}
    </div>
  );
};
