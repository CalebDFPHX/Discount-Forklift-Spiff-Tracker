import React from 'react';
import { X, Download, Shield, ExternalLink } from 'lucide-react';
import { Attachment } from '../lib/repository';
import { formatFileSize } from '../lib/formatters';
import { getSubmissionPhotos } from '../lib/photoAttachments';

interface PhotoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment?: Attachment | null;
  attachments?: Attachment[];
  requestId: string;
  adminUser: string;
}

export const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({
  isOpen,
  onClose,
  attachment,
  attachments,
  requestId,
  adminUser,
}) => {
  const photos = getSubmissionPhotos({ attachments, attachment });
  if (!isOpen || photos.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-gray-100 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#383838] bg-[#1e1e1e] text-white">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm">Sale Photos ({photos.length})</span>
              <span className="text-xs bg-[#292929] text-[#95EA00] border border-[#444444] px-2 py-0.5 rounded font-mono font-bold">
                {requestId}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {photos.length === 1
                ? `${photos[0].originalFilename} · ${formatFileSize(photos[0].fileSizeBytes)} · Private Vercel Blob`
                : 'All attached sale photos · Private Vercel Blob'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-[#383838] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-[#141414] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {photos.map((photo, index) => {
            const viewUrl = `/api/admin/attachments/${photo.id}/view`;
            return (
              <figure key={photo.id} className="min-w-0 rounded-lg border border-[#333333] bg-[#1e1e1e] p-3">
                <figcaption className="mb-2 text-xs text-gray-300">
                  Photo {index + 1} of {photos.length}: {photo.originalFilename}
                </figcaption>
                <div className="flex min-h-[240px] items-center justify-center">
                  <img
                    src={viewUrl}
                    alt={`Sale confirmation ${index + 1}: ${photo.originalFilename}`}
                    className="max-h-[460px] max-w-full object-contain rounded shadow-lg border border-[#333333]"
                    onError={(event) => {
                      event.currentTarget.alt = `Unable to load ${photo.originalFilename}`;
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-gray-400">
                  {formatFileSize(photo.fileSizeBytes)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1 text-xs text-gray-200 hover:text-white px-3 py-1.5 rounded border border-[#444444] bg-[#2d2d2d] hover:bg-[#383838] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Full View</span>
                  </a>
                  <a
                    href={`/api/admin/attachments/${photo.id}/download`}
                    download={photo.originalFilename}
                    className="inline-flex items-center space-x-1 text-xs bg-[#A559BD] hover:bg-[#934da9] text-white font-bold px-3 py-1.5 rounded shadow-sm transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </figure>
            );
          })}
        </div>

        <div className="p-4 bg-[#1e1e1e] border-t border-[#383838] flex items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5 text-xs text-gray-400 min-w-0">
            <Shield className="w-4 h-4 text-[#95EA00]" />
            <span className="truncate">Authorized Administrator View: <strong className="text-gray-200">{adminUser}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
