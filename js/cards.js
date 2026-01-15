/**
 * Card Generation Module
 * Creates shareable personality cards using Canvas
 */

async function generateCard(personality) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = 600, height = 400;
    canvas.width = width;
    canvas.height = height;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
    ctx.lineWidth = 2;
    ctx.roundRect(10, 10, width - 20, height - 20, 20);
    ctx.stroke();

    // Content
    ctx.textAlign = 'center';
    ctx.font = '60px serif';
    ctx.fillText(personality.emoji, width / 2, 100);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '16px sans-serif';
    ctx.fillText('Your Music Personality', width / 2, 150);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(personality.name, width / 2, 200);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '18px sans-serif';
    ctx.fillText(personality.tagline, width / 2, 250);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '14px sans-serif';
    ctx.fillText('rhythmchamber.com', width / 2, height - 30);

    return canvas;
}

async function downloadCard(personality) {
    const canvas = await generateCard(personality);
    const link = document.createElement('a');
    link.download = 'rhythm-chamber.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

/**
 * Get the share URL with referral tracking
 * @returns {string} The app URL with share referral parameter
 */
function getShareURL() {
    // Use production URL if available, fallback to current origin
    const baseUrl = 'https://rhythmchamber.app';
    return `${baseUrl}?ref=share`;
}

/**
 * Share the personality card using the Web Share API
 * Falls back to download if Web Share is not available
 * 
 * Web Share API enables native sharing to:
 * - iOS: Messages, AirDrop, Instagram, Twitter, WhatsApp, etc.
 * - Android: Any installed app that accepts shares
 * - Desktop: Native share dialogs (on supported browsers)
 * 
 * @param {Object} personality - The personality object
 * @param {Object} options - Optional configuration
 * @param {boolean} options.includeFile - Include the image file (default: true)
 * @param {boolean} options.fallbackToDownload - Download if share fails (default: true)
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>} Result of the share action
 */
async function shareCard(personality, options = {}) {
    const {
        includeFile = true,
        fallbackToDownload = true
    } = options;

    // Generate the card image
    const canvas = await generateCard(personality);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));

    // Handle null blob (can occur with tainted canvas due to CORS or other canvas security issues)
    if (!blob) {
        console.error('[Cards] Failed to generate blob from canvas - canvas may be tainted or corrupted', {
            personality: personality?.name,
            canvasWidth: canvas?.width,
            canvasHeight: canvas?.height
        });
        // Fall back to download if sharing fails due to blob issue
        if (fallbackToDownload) {
            console.log('[Cards] Attempting fallback download due to blob generation failure');
            try {
                downloadCard(personality);
                return 'downloaded';
            } catch (downloadError) {
                console.error('[Cards] Fallback download also failed:', downloadError);
            }
        }
        throw new Error(`Failed to generate shareable image for personality "${personality?.name || 'unknown'}". The canvas may be tainted by cross-origin content.`);
    }

    const file = new File([blob], 'rhythm-chamber-personality.png', { type: 'image/png' });

    // Build the share data with rich content
    // Determine article based on first letter of personality name
    const firstLetter = personality.name.charAt(0).toLowerCase();
    const article = ['a', 'e', 'i', 'o', 'u'].includes(firstLetter) ? 'an' : 'a';

    const shareData = {
        title: 'My Music Personality',
        text: `I'm ${article} ${personality.name}. Discover yours:`,
        url: getShareURL()
    };

    // Add the image file if supported and requested
    if (includeFile) {
        shareData.files = [file];
    }

    // Check if Web Share API is available and can share our data
    if (navigator.share) {
        // First check if file sharing is supported
        const canShareWithFiles = navigator.canShare?.({ files: [file] });

        try {
            if (canShareWithFiles && includeFile) {
                // Share with file (best UX - image appears in share sheet)
                await navigator.share(shareData);
                return 'shared';
            } else {
                // Fallback: Share without file (still useful for link sharing)
                const textOnlyShare = {
                    title: shareData.title,
                    text: shareData.text,
                    url: shareData.url
                };
                await navigator.share(textOnlyShare);
                return 'shared';
            }
        } catch (error) {
            // User cancelled the share or share failed
            if (error.name === 'AbortError') {
                console.log('[Cards] Share cancelled by user');
                return 'cancelled';
            }
            console.warn('[Cards] Share failed:', error);
        }
    }

    // Fallback: Download the card if Web Share is unavailable or failed
    if (fallbackToDownload) {
        downloadCard(personality);
        return 'downloaded';
    }

    return 'cancelled';
}

// ES Module export
export const Cards = { generateCard, downloadCard, shareCard, getShareURL };

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.Cards = Cards;
}

console.log('[Cards] Module loaded');

