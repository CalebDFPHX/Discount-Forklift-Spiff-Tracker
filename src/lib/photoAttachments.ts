export const MAX_SUBMISSION_PHOTOS = 5;

export function getPhotoCountError(count: number): string | null {
  if (count < 1) {
    return 'Please attach a sale photo before submitting your spiff request.';
  }
  if (count > MAX_SUBMISSION_PHOTOS) {
    return `You can attach a maximum of ${MAX_SUBMISSION_PHOTOS} sale photos.`;
  }
  return null;
}

export function addPhoto<T>(photos: T[], photo: T): T[] {
  return photos.length < MAX_SUBMISSION_PHOTOS ? [...photos, photo] : photos;
}

export function canAddPhoto(count: number): boolean {
  return count < MAX_SUBMISSION_PHOTOS;
}

export function removePhoto<T extends { key: string }>(photos: T[], key: string): T[] {
  return photos.filter((photo) => photo.key !== key);
}

export function getSubmissionPhotos<T>(submission: {
  attachments?: T[];
  attachment?: T | null;
}): T[] {
  return submission.attachments?.length
    ? submission.attachments
    : submission.attachment
      ? [submission.attachment]
      : [];
}
