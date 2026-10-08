import React from 'react';
import { X, Download, Shield, ExternalLink } from 'lucide-react';
import { Attachment } from '../lib/repository';
import { formatFileSize } from '../lib/formatters';

interface PhotoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: Attachment | null;
  requestId: string;
  adminUser: string;
}

export const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({
  isOpen,
  onClose,
  attachment,
  requestId,
  adminUser,
}) => {
  if (!isOpen || !attachment) return null;

  const viewUrl = `/api/admin/attachments/${attachment.id}/view`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-gray-100">
        <div className="flex items-center justify-between p-4 border-b border-[#383838] bg-[#1e1e1e] text-white">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm">Sale Photo Verification</span>
              <span className="text-xs bg-[#292929] text-[#95EA00] border border-[#444444] px-2 py-0.5 rounded font-mono font-bold">
                {requestId}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {attachment.originalFilename} · {formatFileSize(attachment.fileSizeBytes)} · Private Vercel Blob
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-[#383838] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-[#141414] flex items-center justify-center min-h-[320px] max-h-[500px] overflow-auto">
          <img
            src={viewUrl}
            alt="Sale confirmation"
            className="max-h-[460px] max-w-full object-contain rounded shadow-lg border border-[#333333]"
            onError={(e) => {
              (e.target as any).style.display = 'none';
            }}
          />
        </div>

        <div className="p-4 bg-[#1e1e1e] border-t border-[#383838] flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-gray-400">
            <Shield className="w-4 h-4 text-[#95EA00]" />
            <span>Authorized Administrator View: <strong className="text-gray-200">{adminUser}</strong></span>
          </div>

          <div className="flex items-center space-x-2">
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
              href={viewUrl}
              download={attachment.originalFilename}
              className="inline-flex items-center space-x-1 text-xs bg-[#A559BD] hover:bg-[#934da9] text-white font-bold px-3 py-1.5 rounded shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
