/**
 * BCS Enterprise POS - Image Processing & Storage Pipeline
 * 1. Compresses arbitrary images (PNG, JPEG, BMP) into lightweight WebP format.
 * 2. Uploads to Cloudflare Edge -> Private GitHub Repository (barodacomputerandsales/imgstore).
 * 3. Converts WebP to JPEG on-the-fly purely in-memory for instant client downloads.
 * 4. Zero permanent JPEG storage footprint on database or GitHub.
 */

const API_BASE_URL = 'https://backend.bcs.bcsdeveloper.com/api';
const MASTER_API_KEY = 'backend-bcs-pos';

/**
 * Converts a File or Blob into an optimized WebP Blob with optional downscaling.
 * @param {File|Blob} file - Source image
 * @param {number} maxDimension - Max width or height (defaults to 1920px)
 * @param {number} quality - WebP quality 0.0 to 1.0 (defaults to 0.85)
 * @returns {Promise<{ blob: Blob, base64: string, width: number, height: number, sizeKB: number }>}
 */
export async function compressImageToWebP(file, maxDimension = 1920, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            return reject(new Error('Selected file is not a supported image.'));
        }

        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            let { width, height } = img;

            // Downscale proportionally if larger than maxDimension
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // High-quality bicubic image smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (!blob) {
                    return reject(new Error('WebP compression failed on canvas.'));
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result;
                    resolve({
                        blob,
                        base64,
                        width,
                        height,
                        sizeKB: parseFloat((blob.size / 1024).toFixed(1))
                    });
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);

            }, 'image/webp', quality);
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image for compression.'));
        };

        img.src = objectUrl;
    });
}

/**
 * Uploads a compressed product image to the Cloudflare Edge API -> Private GitHub store.
 * @param {Object} params
 * @param {string} params.barcode - Product barcode (enforced as ID)
 * @param {File|Blob|string} params.image - File, Blob, or base64 data URL
 * @param {number} [params.index=1] - Image sequence index (1 = primary hero)
 * @param {boolean} [params.isPrimary=true] - Whether this image is the primary catalog image
 * @param {string} [params.originalFileName] - Original name for registry logging
 * @returns {Promise<Object>} API response with final proxy URL on bcs.bcsdeveloper.com
 */
export async function uploadProductImage({
    barcode,
    image,
    index = 1,
    isPrimary = true,
    originalFileName = ''
}) {
    if (!barcode) throw new Error('Product barcode is required.');

    let imageBase64 = '';

    // If a raw File or Blob was passed, compress it to WebP first
    if (image instanceof Blob || image instanceof File) {
        const compressed = await compressImageToWebP(image);
        imageBase64 = compressed.base64;
        originalFileName = originalFileName || image.name || `${barcode}_${index}.png`;
    } else if (typeof image === 'string') {
        imageBase64 = image;
    } else {
        throw new Error('Invalid image payload.');
    }

    const response = await fetch(`${API_BASE_URL}/image/upload`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': MASTER_API_KEY,
            'x-session-id': localStorage.getItem('sessionId') || '',
            'x-session-port': localStorage.getItem('sessionPort') || ''
        },
        body: JSON.stringify({
            barcode,
            index,
            imageBase64,
            isPrimary,
            originalFileName
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed with HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * Downloads any product WebP image as a standard JPEG on-the-fly.
 * Converts purely in-memory using an offscreen canvas.
 * Zero database rows or GitHub repository files are created.
 * @param {string} imageUrl - URL of the image (e.g. https://bcs.bcsdeveloper.com/31304943_1.webp)
 * @param {string} downloadName - Base filename for downloaded file (e.g. 31304943_1)
 * @param {number} [quality=0.92] - JPEG quality (0.0 to 1.0)
 * @returns {Promise<void>}
 */
export async function downloadImageAsJpeg(imageUrl, downloadName = 'product-image', quality = 0.92) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');

                // Fill white background for clean transparency-to-JPEG conversion
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw WebP image over white background
                ctx.drawImage(img, 0, 0);

                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error('JPEG conversion failed.'));

                    const downloadUrl = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    const cleanName = downloadName.replace(/\.[a-zA-Z0-9]+$/, '');
                    link.download = `${cleanName}.jpeg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(downloadUrl);
                    resolve();
                }, 'image/jpeg', quality);
            } catch (err) {
                reject(err);
            }
        };

        img.onerror = () => reject(new Error(`Failed to load image from ${imageUrl}`));
        img.src = imageUrl;
    });
}
