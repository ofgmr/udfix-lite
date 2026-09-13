import fs from 'fs';
import path from 'path';

export type UdixAccountPlan = 'lite' | 'katir';

export type UdixAccount = {
    plan: UdixAccountPlan;
    email: string | null;
    token: string | null;
    updatedAt: string | null;
};

const ACCOUNT_FILE = 'udfix-account.json';

export const KATIR_ACCOUNT_TOKEN_MIN = 8;

const EMPTY_ACCOUNT: UdixAccount = {
    plan: 'lite',
    email: null,
    token: null,
    updatedAt: null,
};

export function accountFilePath(userDataPath: string): string {
    return path.join(userDataPath, ACCOUNT_FILE);
}

function asPlan(value: unknown): UdixAccountPlan {
    return value === 'katir' ? 'katir' : 'lite';
}

export function loadAccount(userDataPath: string): UdixAccount {
    try {
        const raw = fs.readFileSync(accountFilePath(userDataPath), 'utf8');
        const parsed = JSON.parse(raw) as Partial<UdixAccount>;
        const token = typeof parsed.token === 'string' && parsed.token.trim() ? parsed.token.trim() : null;
        const email = typeof parsed.email === 'string' && parsed.email.trim() ? parsed.email.trim() : null;
        return {
            plan: asPlan(parsed.plan),
            email,
            token,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
        };
    } catch {
        return { ...EMPTY_ACCOUNT };
    }
}

export function saveAccount(userDataPath: string, account: UdixAccount): UdixAccount {
    const next: UdixAccount = {
        plan: account.plan,
        email: account.email,
        token: account.token,
        updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(accountFilePath(userDataPath), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
}

export function isPlausibleKatirToken(token: string): boolean {
    return token.trim().length >= KATIR_ACCOUNT_TOKEN_MIN;
}

/** Local activation only — payment provider verification comes later. */
export function activateKatirAccount(
    userDataPath: string,
    payload: { token: string; email?: string | null },
): { ok: true; account: UdixAccount } | { ok: false; error: string } {
    const token = payload.token.trim();
    if (!isPlausibleKatirToken(token)) {
        return { ok: false, error: 'Katır anahtarı geçersiz.' };
    }
    const email = payload.email?.trim() || null;
    const account = saveAccount(userDataPath, {
        plan: 'katir',
        token,
        email,
        updatedAt: null,
    });
    return { ok: true, account };
}

export function publicAccountView(account: UdixAccount): Omit<UdixAccount, 'token'> & { hasToken: boolean } {
    return {
        plan: account.plan,
        email: account.email,
        updatedAt: account.updatedAt,
        hasToken: Boolean(account.token),
    };
}
