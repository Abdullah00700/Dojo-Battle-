import React, { useRef, useState, useEffect } from 'react';
import { MobileInput } from '../game/InputManager';
import { ArrowUp, Hand, Footprints, Shield, FastForward, Zap } from 'lucide-react';

export function MobileHUD({ mobileInput }: { mobileInput: MobileInput }) {
    return (
        <div className="absolute inset-0 pointer-events-none flex justify-between items-end p-8 pb-12 select-none">
             {/* Left: Joystick */}
             <div className="pointer-events-auto ml-4 mb-4">
                  <HexJoystick onChange={(val) => mobileInput.state.dirX = val} />
             </div>
             
             {/* Right: Buttons */}
             <div className="pointer-events-auto relative w-[300px] h-[300px] mr-4 mb-4">
                  <HUDButton icon={Zap} color="bg-purple-600/70 active:bg-purple-500" 
                    onDown={() => mobileInput.state.special = true} onUp={() => mobileInput.state.special = false} 
                    positionClasses="bottom-[180px] right-[100px]" />

                  <HUDButton icon={FastForward} color="bg-blue-600/70 active:bg-blue-500" 
                    onDown={() => mobileInput.state.dash = true} onUp={() => mobileInput.state.dash = false} 
                    positionClasses="bottom-[70px] right-[160px]" />
                    
                  <HUDButton icon={Footprints} color="bg-orange-600/70 active:bg-orange-500" 
                    onDown={() => mobileInput.state.kick = true} onUp={() => mobileInput.state.kick = false} 
                    positionClasses="bottom-[90px] right-[90px]" />

                  <HUDButton icon={Hand} color="bg-red-600/70 active:bg-red-500" 
                    onDown={() => mobileInput.state.punch = true} onUp={() => mobileInput.state.punch = false} 
                    positionClasses="bottom-[10px] right-[110px]" />
                    
                  <HUDButton icon={Shield} color="bg-cyan-600/70 active:bg-cyan-500" 
                    onDown={() => mobileInput.state.block = true} onUp={() => mobileInput.state.block = false} 
                    positionClasses="bottom-[150px] right-[20px]" />
                    
                  <HUDButton icon={ArrowUp} color="bg-gray-600/70 active:bg-gray-500" size="w-24 h-24"
                    onDown={() => mobileInput.state.jump = true} onUp={() => mobileInput.state.jump = false} 
                    positionClasses="bottom-0 right-0" />
             </div>
        </div>
    );
}

function HexJoystick({ onChange }: { onChange: (val: number) => void }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activePointer, setActivePointer] = useState<number | null>(null);
    const [offset, setOffset] = useState(0);

    const handlePointerMove = (e: React.PointerEvent) => {
        if (activePointer !== e.pointerId || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        let deltaX = e.clientX - centerX;
        const maxDist = rect.width / 2;
        
        deltaX = Math.max(-maxDist, Math.min(maxDist, deltaX));
        setOffset(deltaX);
        onChange(deltaX / maxDist);
    };

    return (
        <div 
            ref={containerRef}
            className="relative w-32 h-32 bg-slate-800/60 backdrop-blur-sm touch-none transition-opacity"
            style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}
            onPointerDown={(e) => {
                if (activePointer !== null) return;
                setActivePointer(e.pointerId);
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                
                const rect = e.currentTarget.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                let deltaX = e.clientX - centerX;
                const maxDist = rect.width / 2;
                deltaX = Math.max(-maxDist, Math.min(maxDist, deltaX));
                setOffset(deltaX);
                onChange(deltaX / maxDist);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => {
                if (activePointer === e.pointerId) {
                    setActivePointer(null);
                    setOffset(0);
                    onChange(0);
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                }
            }}
            onPointerCancel={(e) => {
                if (activePointer === e.pointerId) {
                    setActivePointer(null);
                    setOffset(0);
                    onChange(0);
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                }
            }}
        >
            {/* Center track line */}
            <div className="absolute top-1/2 left-1/4 right-1/4 h-1 bg-white/10 -translate-y-1/2 rounded-full pointer-events-none" />
            
            {/* Thumbstick */}
            <div 
                className="absolute top-1/2 left-1/2 w-12 h-12 bg-white/90 rounded-full shadow-lg pointer-events-none"
                style={{ transform: `translate(calc(-50% + ${offset}px), -50%)`, transition: activePointer !== null ? 'none' : 'transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)' }}
            />
        </div>
    );
}

function HUDButton({ icon: Icon, color, onDown, onUp, size = "w-16 h-16", positionClasses = "" }: { icon: any, color: string, onDown: () => void, onUp: () => void, size?: string, positionClasses?: string }) {
    const [activePointer, setActivePointer] = useState<number | null>(null);
    return (
        <button
            className={`absolute rounded-full text-white shadow-xl backdrop-blur-sm touch-none flex items-center justify-center transition-all duration-75 ${activePointer !== null ? 'scale-90 brightness-125 ring-4 ring-white/30' : ''} ${color} ${size} ${positionClasses}`}
            onPointerDown={(e) => {
                if (activePointer !== null) return;
                setActivePointer(e.pointerId);
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                onDown();
            }}
            onPointerUp={(e) => {
                if (activePointer === e.pointerId) {
                    setActivePointer(null);
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    onUp();
                }
            }}
            onPointerLeave={(e) => {
                if (activePointer === e.pointerId) {
                    setActivePointer(null);
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    onUp();
                }
            }}
            onPointerCancel={(e) => {
                if (activePointer === e.pointerId) {
                    setActivePointer(null);
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    onUp();
                }
            }}
            onContextMenu={e => e.preventDefault()}
        >
            <Icon size={size === "w-24 h-24" ? 40 : 28} />
        </button>
    );
}
