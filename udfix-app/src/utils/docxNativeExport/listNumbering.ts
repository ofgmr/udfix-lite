import { AlignmentType, convertInchesToTwip, LevelFormat, LevelSuffix } from 'docx';
import type { ListStyleType } from '../orderedListExportAnnotate';

/** Word supports up to 9 list levels (0–8). */
export const MAX_LIST_DEPTH = 9;

const HANGING = convertInchesToTwip(0.18);
const LEFT = convertInchesToTwip(0.5);

/** Left indent for a list level (matches numbering level paragraph indent). */
export function listLevelIndentTwips(level: number): number {
    return LEFT + level * convertInchesToTwip(0.25);
}

function level(
    levelIndex: number,
    format: (typeof LevelFormat)[keyof typeof LevelFormat],
    text: string,
    start = 1,
    isLegal = false,
) {
    return {
        level: levelIndex,
        format,
        text,
        alignment: AlignmentType.START,
        start,
        suffix: LevelSuffix.SPACE,
        isLegalNumberingStyle: isLegal,
        style: {
            paragraph: {
                indent: { left: LEFT + levelIndex * convertInchesToTwip(0.25), hanging: HANGING },
            },
        },
    };
}

function depthLevels(
    specs: ReadonlyArray<{ format: (typeof LevelFormat)[keyof typeof LevelFormat]; text: string; isLegal?: boolean }>,
) {
    const padded = [...specs];
    while (padded.length < MAX_LIST_DEPTH) {
        const i = padded.length;
        padded.push({
            format: i % 3 === 0 ? LevelFormat.DECIMAL : i % 3 === 1 ? LevelFormat.LOWER_LETTER : LevelFormat.LOWER_ROMAN,
            text: `%${i + 1}.`,
        });
    }
    return padded.slice(0, MAX_LIST_DEPTH).map((spec, i) => level(i, spec.format, spec.text, 1, spec.isLegal));
}

function defaultLevels() {
    return depthLevels([
        { format: LevelFormat.DECIMAL, text: '%1.' },
        { format: LevelFormat.LOWER_LETTER, text: '%2.' },
        { format: LevelFormat.LOWER_ROMAN, text: '%3.' },
        { format: LevelFormat.DECIMAL, text: '(%4)' },
        { format: LevelFormat.LOWER_LETTER, text: '(%5)' },
        { format: LevelFormat.LOWER_ROMAN, text: '[%6]' },
        { format: LevelFormat.DECIMAL, text: '[%7]' },
        { format: LevelFormat.LOWER_LETTER, text: '%8.' },
        { format: LevelFormat.LOWER_ROMAN, text: '%9.' },
    ]);
}

function romanLevels() {
    return depthLevels([
        { format: LevelFormat.UPPER_ROMAN, text: '%1.' },
        { format: LevelFormat.UPPER_LETTER, text: '%2.' },
        { format: LevelFormat.DECIMAL, text: '%3.' },
        { format: LevelFormat.LOWER_LETTER, text: '%4.' },
        { format: LevelFormat.LOWER_ROMAN, text: '%5.' },
        { format: LevelFormat.DECIMAL, text: '(%6)' },
        { format: LevelFormat.LOWER_LETTER, text: '(%7)' },
        { format: LevelFormat.LOWER_ROMAN, text: '[%8]' },
        { format: LevelFormat.DECIMAL, text: '[%9]' },
    ]);
}

function parenLevels() {
    return depthLevels([
        { format: LevelFormat.DECIMAL, text: '%1)' },
        { format: LevelFormat.LOWER_LETTER, text: '%2)' },
        { format: LevelFormat.LOWER_ROMAN, text: '%3)' },
        { format: LevelFormat.DECIMAL, text: '[%4]' },
        { format: LevelFormat.LOWER_LETTER, text: '[%5]' },
        { format: LevelFormat.LOWER_ROMAN, text: '[%6]' },
        { format: LevelFormat.DECIMAL, text: '(%7)' },
        { format: LevelFormat.LOWER_LETTER, text: '(%8)' },
        { format: LevelFormat.LOWER_ROMAN, text: '(%9)' },
    ]);
}

function outlineLevels() {
    return depthLevels([
        { format: LevelFormat.UPPER_LETTER, text: '%1.' },
        { format: LevelFormat.DECIMAL, text: '%2.' },
        { format: LevelFormat.LOWER_LETTER, text: '%3.' },
        { format: LevelFormat.LOWER_ROMAN, text: '%4.' },
        { format: LevelFormat.LOWER_LETTER, text: '%5.' },
        { format: LevelFormat.DECIMAL, text: '(%6)' },
        { format: LevelFormat.LOWER_LETTER, text: '(%7)' },
        { format: LevelFormat.LOWER_ROMAN, text: '[%8]' },
        { format: LevelFormat.DECIMAL, text: '[%9]' },
    ]);
}

function legalLevels() {
    return depthLevels([
        { format: LevelFormat.DECIMAL, text: '%1.', isLegal: true },
        { format: LevelFormat.DECIMAL, text: '%1.%2.', isLegal: true },
        { format: LevelFormat.DECIMAL, text: '%1.%2.%3.', isLegal: true },
        { format: LevelFormat.DECIMAL, text: '%1.%2.%3.%4.', isLegal: true },
        { format: LevelFormat.DECIMAL, text: '%1.%2.%3.%4.%5.', isLegal: true },
        { format: LevelFormat.DECIMAL, text: '%1.%2.%3.%4.%5.%6.', isLegal: true },
        { format: LevelFormat.DECIMAL, text: '%1.%2.%3.%4.%5.%6.%7.', isLegal: true },
        { format: LevelFormat.DECIMAL, text: '%1.%2.%3.%4.%5.%6.%7.%8.', isLegal: true },
        { format: LevelFormat.DECIMAL, text: '%1.%2.%3.%4.%5.%6.%7.%8.%9.', isLegal: true },
    ]);
}

function bulletLevels() {
    const bullets = ['\u2022', '\u25E6', '\u25AA'];
    return Array.from({ length: MAX_LIST_DEPTH }, (_, i) =>
        level(i, LevelFormat.BULLET, bullets[i % bullets.length] ?? '\u2022'),
    );
}

export function listReferenceForType(type: ListStyleType): string {
    switch (type) {
        case 'legal':
            return 'udfix-legal';
        case 'roman':
            return 'udfix-roman';
        case 'paren':
            return 'udfix-paren';
        case 'outline':
            return 'udfix-outline';
        case 'default':
        default:
            return 'udfix-default';
    }
}

export function buildDocxNumberingConfig(extraStarts: ReadonlyArray<{ reference: string; start: number }> = []) {
    const base = [
        { reference: 'udfix-default', levels: defaultLevels() },
        { reference: 'udfix-legal', levels: legalLevels() },
        { reference: 'udfix-roman', levels: romanLevels() },
        { reference: 'udfix-paren', levels: parenLevels() },
        { reference: 'udfix-outline', levels: outlineLevels() },
        { reference: 'udfix-bullet', levels: bulletLevels() },
    ];
    const extras = extraStarts.map(({ reference, start }) => {
        const kind = reference.replace(/^udfix-(\w+)-start-\d+$/, '$1') as ListStyleType;
        switch (kind) {
            case 'legal':
                return {
                    reference,
                    levels: legalLevels().map((l, i) => (i === 0 ? { ...l, start } : l)),
                };
            case 'roman':
                return {
                    reference,
                    levels: romanLevels().map((l, i) => (i === 0 ? { ...l, start } : l)),
                };
            case 'paren':
                return {
                    reference,
                    levels: parenLevels().map((l, i) => (i === 0 ? { ...l, start } : l)),
                };
            case 'outline':
                return {
                    reference,
                    levels: outlineLevels().map((l, i) => (i === 0 ? { ...l, start } : l)),
                };
            case 'default':
            default:
                return {
                    reference,
                    levels: defaultLevels().map((l, i) => (i === 0 ? { ...l, start } : l)),
                };
        }
    });
    return { config: [...base, ...extras] };
}

export function numberingReferenceForList(type: ListStyleType, start: number): string {
    if (start <= 1) return listReferenceForType(type);
    return `udfix-${type}-start-${start}`;
}
