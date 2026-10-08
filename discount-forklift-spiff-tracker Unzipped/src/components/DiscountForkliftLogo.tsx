import React, { useState, useEffect, useRef } from 'react';
import { Camera, Upload, X, Check, Image as ImageIcon, RotateCcw } from 'lucide-react';

interface DiscountForkliftLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

// Built-in high-fidelity photo badges for Discount Forklift
const DEFAULT_BRAND_PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 90" width="400" height="90">
  <defs>
    <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#C062DC" />
      <stop offset="50%" stop-color="#A559BD" />
      <stop offset="100%" stop-color="#732B8C" />
    </linearGradient>
    <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#A4F90F" />
      <stop offset="100%" stop-color="#84CE00" />
    </linearGradient>
    <linearGradient id="metalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3A3A3C" />
      <stop offset="100%" stop-color="#1E1E20" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="400" height="90" rx="14" fill="#141416" stroke="#333336" stroke-width="1.5" />
  <rect x="3" y="3" width="394" height="84" rx="11" fill="url(#metalGrad)" />
  
  <!-- Left Emblem -->
  <g transform="translate(14, 12)">
    <rect width="66" height="66" rx="12" fill="url(#purpleGrad)" filter="url(#glow)" />
    <!-- Mast -->
    <path d="M42 12 V50 H47" stroke="url(#greenGrad)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M42 26 H56 V32" stroke="url(#greenGrad)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
    <line x1="36" y1="16" x2="36" y2="48" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.9" />
    <!-- Fork carriage -->
    <path d="M46 34 H58 V52 H54" stroke="url(#greenGrad)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Cab -->
    <path d="M16 22 H32 L35 42 H12 Z" fill="#20102B" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round" />
    <path d="M10 42 H36 V52 H10 Z" fill="#A559BD" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round" />
    <!-- Wheels -->
    <circle cx="16" cy="54" r="7" fill="#111" stroke="url(#greenGrad)" stroke-width="3.5" />
    <circle cx="16" cy="54" r="2.5" fill="#FFF" />
    <circle cx="36" cy="54" r="7" fill="#111" stroke="url(#greenGrad)" stroke-width="3.5" />
    <circle cx="36" cy="54" r="2.5" fill="#FFF" />
  </g>
  
  <!-- Typography & Brand Text -->
  <text x="96" y="44" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="28" fill="#FFFFFF" letter-spacing="1.5">
    DISCOUNT <tspan fill="url(#greenGrad)">FORKLIFT</tspan>
  </text>
  <rect x="96" y="52" width="288" height="2" fill="url(#greenGrad)" rx="1" opacity="0.8" />
  <text x="96" y="70" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" fill="#C479DC" letter-spacing="2">
    PHOENIX SALES SPIFF LEDGER
  </text>
</svg>
`)}`;

const PRESET_PHOTOS = [
  {
    id: 'corporate-badge',
    label: 'Corporate Purple & Lime Emblem',
    src: DEFAULT_BRAND_PHOTO,
  },
  {
    id: 'heavy-equipment',
    label: 'Heavy Industrial Yard Edition',
    src: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 90" width="400" height="90">
  <rect width="400" height="90" rx="14" fill="#0C0D0E" stroke="#95EA00" stroke-width="1.5" />
  <g transform="translate(18, 14)">
    <rect width="62" height="62" rx="10" fill="#95EA00" />
    <path d="M38 12 V46 H43" stroke="#000" stroke-width="5" stroke-linecap="round" />
    <path d="M38 24 H52 V30" stroke="#000" stroke-width="4" stroke-linecap="round" />
    <path d="M14 20 H30 L33 38 H10 Z" fill="#1E1E1E" stroke="#000" stroke-width="2.5" />
    <path d="M8 38 H34 V48 H8 Z" fill="#000" />
    <circle cx="14" cy="49" r="6.5" fill="#FFF" stroke="#000" stroke-width="3" />
    <circle cx="33" cy="49" r="6.5" fill="#FFF" stroke="#000" stroke-width="3" />
  </g>
  <text x="96" y="44" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="28" fill="#95EA00" letter-spacing="1.5">
    DISCOUNT <tspan fill="#FFFFFF">FORKLIFT</tspan>
  </text>
  <text x="96" y="70" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" fill="#E2E8F0" letter-spacing="2">
    COMMERCIAL EQUIPMENT SERVICES
  </text>
</svg>
`)}`,
  },
];

export const DiscountForkliftLogo: React.FC<DiscountForkliftLogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
}) => {
  const [brandPhoto, setBrandPhoto] = useState<string | null>(() => {
    return localStorage.getItem('discount_forklift_brand_photo') || DEFAULT_BRAND_PHOTO;
  });
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
  };

  const titleSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  };

  const subtitleSizes = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
  };

  const photoHeights = {
    sm: 'h-6',
    md: 'h-8 sm:h-9',
    lg: 'h-11',
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('discount_forklift_brand_photo');
      if (stored) {
        setBrandPhoto(stored);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('discount-forklift-photo-changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('discount-forklift-photo-changed', handleStorageChange);
    };
  }, []);

  const handleApplyPhoto = (src: string | null) => {
    if (src) {
      localStorage.setItem('discount_forklift_brand_photo', src);
      setBrandPhoto(src);
    } else {
      localStorage.removeItem('discount_forklift_brand_photo');
      setBrandPhoto(null);
    }
    window.dispatchEvent(new Event('discount-forklift-photo-changed'));
    setIsPhotoModalOpen(false);
    setUploadError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, or WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image size must be under 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        handleApplyPhoto(result);
      }
    };
    reader.onerror = () => {
      setUploadError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className={`flex items-center space-x-3 select-none ${className}`}>
        {/* Precision Industrial Forklift Emblem (when not displaying full banner photo) */}
        {!brandPhoto && (
          <div
            className={`${iconSizes[size]} rounded-xl bg-gradient-to-br from-[#A559BD] to-[#7f3496] p-1.5 shadow-md flex items-center justify-center border border-[#c479dc]/40 flex-shrink-0 group-hover:scale-105 transition-transform duration-200`}
          >
            <svg
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full text-white"
            >
              <path
                d="M32 8V34H35"
                stroke="#95EA00"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M32 18H44V22"
                stroke="#95EA00"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line x1="28" y1="10" x2="28" y2="34" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
              <path
                d="M35 24H45V36H42"
                stroke="#95EA00"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 16H25L27 28H10L14 16Z"
                fill="currentColor"
                fillOpacity="0.25"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="M8 28H28V36H8L8 28Z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="38" r="4.5" fill="#1e1e1e" stroke="#95EA00" strokeWidth="2.5" />
              <circle cx="12" cy="38" r="1.5" fill="#ffffff" />
              <circle cx="28" cy="38" r="4.5" fill="#1e1e1e" stroke="#95EA00" strokeWidth="2.5" />
              <circle cx="28" cy="38" r="1.5" fill="#ffffff" />
            </svg>
          </div>
        )}

        {/* Brand Wordmark & Photo Container */}
        <div className="flex flex-col leading-none">
          <div className="flex items-center space-x-2">
            <span
              className={`font-black tracking-tight text-white uppercase inline-flex items-center gap-2 group/photo relative ${titleSizes[size]}`}
            >
              {brandPhoto ? (
                <div className="relative inline-flex items-center">
                  <img
                    src={brandPhoto}
                    alt="Discount Forklift"
                    className={`${photoHeights[size]} w-auto max-w-[280px] object-contain rounded-lg shadow-sm border border-[#383838]/60 transition-transform duration-200 group-hover:brightness-105`}
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPhotoModalOpen(true);
                    }}
                    title="Change brand photo"
                    aria-label="Change brand photo"
                    className="ml-2 p-1.5 rounded-md bg-[#2b2b2b] hover:bg-[#3d3d3d] text-gray-300 hover:text-[#95EA00] border border-[#444444] transition-colors shadow-sm"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <span>Discount Forklift</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPhotoModalOpen(true);
                    }}
                    title="Change to photo"
                    aria-label="Change to photo"
                    className="p-1 rounded-md bg-[#2b2b2b] hover:bg-[#3d3d3d] text-gray-400 hover:text-[#95EA00] border border-[#444444] transition-colors shadow-sm"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                </>
              )}
            </span>
          </div>

          {!brandPhoto && showSubtitle && (
            <div className="flex items-center space-x-1.5 mt-1">
              <span className={`font-bold tracking-wider uppercase text-[#95EA00] ${subtitleSizes[size]}`}>
                Spiff Tracker
              </span>
              <span className="text-gray-500 text-[10px] font-mono">•</span>
              <span className="text-gray-400 text-[10px] font-mono tracking-tight uppercase">
                Sales Ledger
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Change Brand Photo Modal */}
      {isPhotoModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsPhotoModalOpen(false)}
        >
          <div
            className="bg-[#1e1e1e] border border-[#383838] rounded-xl max-w-md w-full p-6 shadow-2xl text-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#333333]">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-[#A559BD]/20 rounded-lg border border-[#A559BD]/40 text-[#A559BD]">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Change Brand Photo</h3>
                  <p className="text-xs text-gray-400">Update the header logo to a photo or badge</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-[#2c2c2c] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadError && (
              <div className="mt-4 p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-red-300 text-xs">
                {uploadError}
              </div>
            )}

            {/* Current preview */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Current Photo Display
              </label>
              <div className="p-3 bg-[#141414] rounded-lg border border-[#333333] flex items-center justify-center min-h-[60px]">
                {brandPhoto ? (
                  <img
                    src={brandPhoto}
                    alt="Current Brand Preview"
                    className="max-h-12 w-auto object-contain rounded"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs text-gray-400">Default text mode active</span>
                )}
              </div>
            </div>

            {/* Presets */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Select Company Photo Preset
              </label>
              <div className="space-y-2">
                {PRESET_PHOTOS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPhoto(preset.src)}
                    className="w-full p-2.5 rounded-lg border border-[#383838] bg-[#242424] hover:bg-[#2c2c2c] hover:border-[#95EA00]/60 flex items-center justify-between text-left transition-all"
                  >
                    <div className="flex items-center space-x-3">
                      <img
                        src={preset.src}
                        alt={preset.label}
                        className="h-7 w-auto object-contain rounded"
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-xs font-medium text-gray-200">{preset.label}</span>
                    </div>
                    {brandPhoto === preset.src && (
                      <Check className="w-4 h-4 text-[#95EA00] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload File */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Upload Custom Photo File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-lg border border-dashed border-[#555555] hover:border-[#A559BD] bg-[#1a1a1a] hover:bg-[#222222] text-xs font-semibold text-gray-300 hover:text-white flex items-center justify-center space-x-2 transition-colors"
              >
                <Upload className="w-4 h-4 text-[#A559BD]" />
                <span>Upload Photo from Computer (PNG, JPG, WebP)</span>
              </button>
            </div>

            {/* URL Input */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Or Photo Image URL
              </label>
              <div className="flex space-x-2">
                <input
                  type="url"
                  placeholder="https://example.com/logo-photo.png"
                  value={photoUrlInput}
                  onChange={(e) => setPhotoUrlInput(e.target.value)}
                  className="flex-1 bg-[#121212] border border-[#383838] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#95EA00]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (photoUrlInput.trim()) {
                      handleApplyPhoto(photoUrlInput.trim());
                    }
                  }}
                  disabled={!photoUrlInput.trim()}
                  className="px-3 py-1.5 bg-[#A559BD] hover:bg-[#934da9] disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-[#333333] flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleApplyPhoto(null)}
                className="text-xs text-gray-400 hover:text-white flex items-center space-x-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Plain Text</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                className="px-4 py-1.5 bg-[#333333] hover:bg-[#404040] text-white text-xs font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

