import React, { useState, useRef, useEffect } from 'react';
import { Youtube, Volume2 } from 'lucide-react';

interface CustomPlayerProps {
    videoUrl: string;
    brandingText?: string; 
    brandingLogo?: string;
    brandingLogoConfig?: any;
    onEnded?: () => void;
    blockShare?: boolean;
}

export const CustomPlayer: React.FC<CustomPlayerProps> = ({ 
    videoUrl, 
    brandingText, 
    brandingLogo, 
    brandingLogoConfig, 
    onEnded, 
    blockShare = true,
}) => {
    // Extract Video ID
    let videoId = '';
    let isDrive = false;
    try {
        if (videoUrl.includes('youtu.be/')) videoId = videoUrl.split('youtu.be/')[1].split('?')[0];
        else if (videoUrl.includes('v=')) videoId = videoUrl.split('v=')[1].split('&')[0];
        else if (videoUrl.includes('embed/')) videoId = videoUrl.split('embed/')[1].split('?')[0];
        
        if (videoId && videoId.includes('?')) videoId = videoId.split('?')[0];
        
        if (videoUrl.includes('drive.google.com')) {
            isDrive = true;
        }
    } catch(e) {}

    // Construct Native Embed URL
    const embedUrl = isDrive 
        ? videoUrl.replace('/view', '/preview')
        : `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&enablejsapi=1&showinfo=0`;

    if (!videoId && !isDrive) {
        return (
            <div className="w-full h-full bg-slate-900 flex items-center justify-center p-6 text-center">
                <div className="space-y-4">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto">
                        <Youtube size={32} className="text-white/40" />
                    </div>
                    <p className="text-white/60 font-medium">Invalid or unsupported video URL</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-black group overflow-hidden rounded-2xl shadow-2xl border border-white/5" style={{ minHeight: '300px' }}>
             <iframe 
                src={embedUrl} 
                className="w-full h-full absolute inset-0 scale-[1.01]" 
                style={{ border: 'none' }}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture" 
                allowFullScreen
                title="NSTA PLAYER"
             />
             
             {/* Share Button Blocker (Top Right) */}
             {blockShare && (
                 <>
                    {/* Primary top-right blocker for "Open in new tab" and "Share" */}
                    <div 
                        className="absolute top-0 right-0 z-[60] pointer-events-auto cursor-default" 
                        style={{ 
                            width: '180px', 
                            height: '70px',
                            background: 'transparent'
                        }} 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    />
                    {/* Drive specific link icon blocker */}
                    {isDrive && (
                        <div 
                            className="absolute top-2 right-2 z-[61] pointer-events-auto cursor-default" 
                            style={{ 
                                width: '50px', 
                                height: '50px',
                                background: 'transparent'
                            }} 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        />
                    )}
                 </>
             )}

             {/* Bottom Right YouTube Logo Blocker */}
             {!isDrive && (
                 <div 
                    className="absolute bottom-0 right-0 z-50 pointer-events-auto" 
                    style={{ 
                        width: '120px', 
                        height: '60px',
                        background: 'transparent'
                    }} 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                 />
             )}

             {/* UI Overlay Enhancement for Drive Audio */}
             {isDrive && (
                 <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-t from-black/40 to-transparent flex items-center justify-center">
                 </div>
             )}

        </div>
    );
};
