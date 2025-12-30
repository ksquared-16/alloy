/**
 * Client-side image compression and resizing utilities
 */

export interface CompressionOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    maxSizeBytes?: number;
}

/**
 * Resize and compress an image file
 * @param file Original image file
 * @param options Compression options
 * @returns Compressed File object
 */
export async function compressImage(
    file: File,
    options: CompressionOptions = {}
): Promise<File> {
    const {
        maxWidth = 1280,
        maxHeight = 1280,
        quality = 0.6, // Lower quality for better compression
        maxSizeBytes = 3 * 1024 * 1024, // 3MB target (after compression)
    } = options;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                // Create canvas and draw resized image
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Failed to get canvas context"));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Convert to blob with compression
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error("Failed to compress image"));
                            return;
                        }

                        // If still too large, reduce quality further (adaptive compression)
                        if (blob.size > maxSizeBytes) {
                            // Try progressively lower quality until we're under the limit
                            let currentQuality = quality * 0.5;
                            let attempts = 0;
                            const maxAttempts = 3;
                            
                            const tryCompress = (q: number) => {
                                canvas.toBlob(
                                    (smallerBlob) => {
                                        if (!smallerBlob) {
                                            reject(new Error("Failed to compress image further"));
                                            return;
                                        }
                                        // If still too large and we have attempts left, try again with lower quality
                                        if (smallerBlob.size > maxSizeBytes && attempts < maxAttempts) {
                                            attempts++;
                                            tryCompress(q * 0.7);
                                        } else {
                                            const compressedFile = new File(
                                                [smallerBlob],
                                                file.name.replace(/\.[^/.]+$/, ".jpg"),
                                                { type: "image/jpeg" }
                                            );
                                            resolve(compressedFile);
                                        }
                                    },
                                    "image/jpeg",
                                    q
                                );
                            };
                            tryCompress(currentQuality);
                        } else {
                            const compressedFile = new File(
                                [blob],
                                file.name.replace(/\.[^/.]+$/, ".jpg"),
                                { type: "image/jpeg" }
                            );
                            resolve(compressedFile);
                        }
                    },
                    "image/jpeg",
                    quality
                );
            };
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

/**
 * Validate image file size
 * @param file Image file
 * @param maxSizeBytes Maximum size in bytes (default: 5MB)
 * @returns true if valid, false otherwise
 */
export function validateImageSize(file: File, maxSizeBytes: number = 5 * 1024 * 1024): boolean {
    return file.size <= maxSizeBytes;
}

