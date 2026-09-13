import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ESignatureBadgeIconProps extends React.SVGAttributes<SVGSVGElement> {
    /** Render size in CSS pixels */
    size?: number;
}

/** Premium gold seal with ribbons, rotating gear ring, and curved security text. */
export function ESignatureBadgeIcon({
    size = 28,
    className,
    ...props
}: ESignatureBadgeIconProps) {
    const uid = React.useId().replace(/:/g, '');
    const goldGradId = `${uid}-gold-grad-premium`;
    const ribbonGradId = `${uid}-ribbon-red`;
    const securePathId = `${uid}-secure-text-path`;

    const gearShadow = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
    const shieldShadow = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))';

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="E-imzalı"
            className={cn('shrink-0 seal-premium-animated', className)}
            {...props}
        >
            <defs>
                <linearGradient id={goldGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fef08a" />
                    <stop offset="30%" stopColor="#f59e0b" />
                    <stop offset="70%" stopColor="#d97706" />
                    <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
                <linearGradient id={ribbonGradId} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="50%" stopColor="#dc2626" />
                    <stop offset="100%" stopColor="#7f1d1d" />
                </linearGradient>
            </defs>

            <g>
                <path
                    d="M41,60 L30,94 L43,88 L52,94 L46,60"
                    fill={`url(#${ribbonGradId})`}
                    stroke={`url(#${goldGradId})`}
                    strokeWidth="0.8"
                    strokeLinejoin="round"
                />
                <path d="M33,90 L43,84 L46,60" stroke="#7f1d1d" strokeWidth="0.5" opacity="0.6" />
            </g>

            <g>
                <path
                    d="M59,60 L70,94 L57,88 L48,94 L54,60"
                    fill={`url(#${ribbonGradId})`}
                    stroke={`url(#${goldGradId})`}
                    strokeWidth="0.8"
                    strokeLinejoin="round"
                />
                <path d="M67,90 L57,84 L54,60" stroke="#7f1d1d" strokeWidth="0.5" opacity="0.6" />
            </g>

            <g>
                <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 50 42"
                    to="360 50 42"
                    dur="45s"
                    repeatCount="indefinite"
                />
                <circle
                    cx="50"
                    cy="42"
                    r="32.5"
                    fill="none"
                    stroke={`url(#${goldGradId})`}
                    strokeWidth="2"
                    strokeDasharray="1.5, 3"
                />
                <path
                    d="M50,11 L54,16 L59,13 L61,19 L66,17 L67,23 L72,22 L71,28 L76,29 L74,35 L78,37 L75,42 L78,47 L74,49 L76,55 L71,56 L72,62 L67,61 L66,67 L61,65 L59,71 L54,68 L50,73 L46,68 L41,71 L39,65 L34,67 L33,61 L28,62 L29,56 L24,55 L26,49 L22,47 L25,42 L22,37 L26,35 L24,29 L29,28 L28,22 L33,23 L34,17 L39,19 L41,13 L46,16 Z"
                    fill={`url(#${goldGradId})`}
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    style={{ filter: gearShadow }}
                />
                <circle
                    cx="50"
                    cy="42"
                    r="26.5"
                    fill="none"
                    stroke={`url(#${goldGradId})`}
                    strokeWidth="1.8"
                />
            </g>

            <circle
                cx="50"
                cy="42"
                r="23.5"
                fill="#0b0f19"
                stroke={`url(#${goldGradId})`}
                strokeWidth="1.5"
            />
            <circle
                cx="50"
                cy="42"
                r="21"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="0.5"
                strokeDasharray="1.5, 1.5"
                opacity="0.7"
            />

            <g>
                <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 50 42"
                    to="-360 50 42"
                    dur="60s"
                    repeatCount="indefinite"
                />
                <path id={securePathId} d="M 50, 18 A 24, 24 0 1, 1 49.9, 18" fill="none" />
                <text
                    fontFamily="Roboto, system-ui, sans-serif"
                    fontSize="3.2"
                    fontWeight="800"
                    fill="#fef08a"
                    letterSpacing="0.8"
                >
                    <textPath href={`#${securePathId}`} startOffset="0%">
                        • GÜVENLİ ELEKTRONİK İMZA • 5070 S.K. • DOĞRULANMIŞ İMZA •
                    </textPath>
                </text>
            </g>

            <circle cx="50" cy="42" r="14" fill="#0f172a" stroke={`url(#${goldGradId})`} strokeWidth="1" />

            <g style={{ filter: shieldShadow }}>
                <path
                    d="M43,34.5 C43,34.5 50,32 50,32 C50,32 57,34.5 57,34.5 C57,41.5 53.5,47.5 50,51.5 C46.5,47.5 43,41.5 43,34.5 Z"
                    fill={`url(#${goldGradId})`}
                />
                <path
                    d="M44.5,35.5 C44.5,35.5 50,33.5 50,33.5 C50,33.5 55.5,35.5 55.5,35.5 C55.5,41 52.5,46 50,49.5 C47.5,46 44.5,41 44.5,35.5 Z"
                    fill="#0b0f19"
                />
                <path
                    d="M46.5,41 L49,43.5 L53.5,39"
                    fill="none"
                    stroke={`url(#${goldGradId})`}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </g>

            <path
                d="M 32,32 A 20,20 0 0, 1 68,32 A 20,20 0 0, 0 32,32"
                fill="#ffffff"
                opacity="0.12"
                pointerEvents="none"
            />
        </svg>
    );
}

export default ESignatureBadgeIcon;
