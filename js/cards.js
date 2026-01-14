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

async function shareCard(personality) {
    const canvas = await generateCard(personality);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'rhythm-chamber.png', { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ title: personality.name, files: [file] });
            return true;
        } catch (e) { /* user cancelled */ }
    }
    downloadCard(personality);
    return 'downloaded';
}

// ES Module export
export const Cards = { generateCard, downloadCard, shareCard };

// Keep window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.Cards = Cards;
}

console.log('[Cards] Module loaded');

