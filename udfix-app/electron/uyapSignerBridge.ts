import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type BridgeUyapSignatureProfile = {
    standard: string;
    digestAlgorithm: string;
};

export type BridgeUyapSignRequest =
    | { provider: 'token'; tokenPin: string }
    | {
          provider: 'mobile';
          gsmNo: string;
          tcKimlikNo: string;
          operator: 'turkcell' | 'turktelekom' | 'vodafone';
          displayText?: string;
      };

export class UyapSigningError extends Error {
    readonly code:
        | 'SIGNER_NOT_CONFIGURED'
        | 'SIGNER_NOT_FOUND'
        | 'INVALID_TOKEN_PIN'
        | 'TOKEN_NOT_PRESENT'
        | 'TOKEN_LOCKED'
        | 'CERTIFICATE_NOT_FOUND'
        | 'CERTIFICATE_INVALID'
        | 'CERTIFICATE_EXPIRED'
        | 'MOBILE_APPROVAL_REJECTED'
        | 'MOBILE_TIMEOUT'
        | 'MOBILE_OPERATOR_UNREACHABLE'
        | 'MOBILE_CONFIG_INVALID'
        | 'LICENSE_INVALID'
        | 'SIGN_OUTPUT_MISSING'
        | 'SIGN_COMMAND_FAILED';

    constructor(
        code:
            | 'SIGNER_NOT_CONFIGURED'
            | 'SIGNER_NOT_FOUND'
            | 'INVALID_TOKEN_PIN'
            | 'TOKEN_NOT_PRESENT'
            | 'TOKEN_LOCKED'
            | 'CERTIFICATE_NOT_FOUND'
            | 'CERTIFICATE_INVALID'
            | 'CERTIFICATE_EXPIRED'
            | 'MOBILE_APPROVAL_REJECTED'
            | 'MOBILE_TIMEOUT'
            | 'MOBILE_OPERATOR_UNREACHABLE'
            | 'MOBILE_CONFIG_INVALID'
            | 'LICENSE_INVALID'
            | 'SIGN_OUTPUT_MISSING'
            | 'SIGN_COMMAND_FAILED',
        message: string,
    ) {
        super(message);
        this.name = 'UyapSigningError';
        this.code = code;
    }
}

function redactSecrets(input: string, secrets: string[]): string {
    let withMasked = input;
    for (const secret of secrets) {
        if (!secret) continue;
        withMasked = withMasked.split(secret).join('[REDACTED]');
    }
    const withPinMasked = withMasked;
    return withPinMasked.replace(/pin\s*[:=]\s*\S+/gi, 'pin=[REDACTED]');
}

function envConfig(...keys: string[]): string | undefined {
    for (const key of keys) {
        const value = process.env[key]?.trim();
        if (value) return value;
    }
    return undefined;
}

function resolvePackagedResourcesPath(): string | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const electron = require('electron') as typeof import('electron');
        if (electron.app?.isPackaged) {
            return process.resourcesPath;
        }
    } catch {
        // Unit tests and non-Electron runners do not ship the Electron app module.
    }
    return undefined;
}

function resolveProjectRootCandidates(): string[] {
    const candidates = new Set<string>();
    const packagedResources = resolvePackagedResourcesPath();
    if (packagedResources) {
        candidates.add(packagedResources);
    }
    const cwd = process.cwd();
    candidates.add(cwd);
    candidates.add(path.resolve(cwd, '..'));
    candidates.add(path.resolve(__dirname, '..'));
    candidates.add(path.resolve(__dirname, '../..'));
    return Array.from(candidates);
}

function resolveMa3Root(): string | undefined {
    const fromEnv = envConfig('UDFIX_MA3_ROOT', 'NOMAI_MA3_ROOT');
    if (fromEnv && fs.existsSync(fromEnv)) {
        return fromEnv;
    }
    const roots = resolveProjectRootCandidates();
    for (const root of roots) {
        const candidate = path.resolve(root, 'ma3api-java-signature-2.3.11.8');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function resolveMa3JarPath(ma3Root?: string): string | undefined {
    const fromEnv = envConfig('UDFIX_MA3_JAR_PATH', 'NOMAI_MA3_JAR_PATH');
    if (fromEnv && fs.existsSync(fromEnv)) {
        return fromEnv;
    }
    if (!ma3Root) {
        return undefined;
    }
    const candidate = path.join(ma3Root, 'lib', 'ma3api-signature-2.3.11.8.jar');
    if (fs.existsSync(candidate)) {
        return candidate;
    }
    return undefined;
}

function resolveMa3LauncherScript(): string | undefined {
    const roots = resolveProjectRootCandidates();
    for (const root of roots) {
        const candidate = path.resolve(root, 'scripts', 'uyap-signer-ma3.sh');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function resolveMa3LicensePath(ma3Root?: string): string | undefined {
    const fromEnv = envConfig('UDFIX_MA3_LICENSE_XML', 'NOMAI_MA3_LICENSE_XML');
    if (fromEnv && fs.existsSync(fromEnv)) {
        return fromEnv;
    }
    if (!ma3Root) {
        return undefined;
    }
    const candidate = path.join(ma3Root, 'lisans', 'lisans.xml');
    if (fs.existsSync(candidate)) {
        return candidate;
    }
    return undefined;
}

function resolveSignerCommand(): {
    command: string;
    args: string[];
    extraEnv?: Record<string, string>;
} {
    const customCommand = envConfig('UDFIX_UYAP_SIGNER_CMD', 'NOMAI_UYAP_SIGNER_CMD');
    if (customCommand) {
        return {
            command: process.platform === 'win32' ? 'cmd.exe' : 'bash',
            args: process.platform === 'win32' ? ['/d', '/s', '/c', customCommand] : ['-lc', customCommand],
        };
    }

    const ma3Root = resolveMa3Root();
    const ma3JarPath = resolveMa3JarPath(ma3Root);
    const ma3LicensePath = resolveMa3LicensePath(ma3Root);
    const ma3LauncherScript = process.platform === 'win32' ? undefined : resolveMa3LauncherScript();
    if (ma3LauncherScript) {
        const extraEnv: Record<string, string> = {
            NOMAI_MA3_ROOT: ma3Root ?? '',
            NOMAI_MA3_JAR_PATH: ma3JarPath ?? '',
            NOMAI_MA3_LIB_DIR: ma3Root ? path.join(ma3Root, 'lib') : '',
        };
        if (ma3LicensePath) {
            extraEnv.NOMAI_MA3_LICENSE_XML = ma3LicensePath;
        }
        return {
            command: 'bash',
            args: [ma3LauncherScript],
            extraEnv,
        };
    }

    if (ma3JarPath) {
        return {
            command: 'java',
            args: [
                '-jar',
                ma3JarPath,
                '--input-env',
                'NOMAI_SIGN_INPUT',
                '--output-env',
                'NOMAI_SIGN_OUTPUT',
                '--pin-env',
                'NOMAI_TOKEN_PIN',
            ],
            extraEnv: ma3Root
                ? {
                      NOMAI_MA3_ROOT: ma3Root,
                  }
                : undefined,
        };
    }

    throw new UyapSigningError(
        'SIGNER_NOT_CONFIGURED',
        [
            'İmzalayıcı yapılandırılmamış.',
            'UDFIX_UYAP_SIGNER_CMD (veya NOMAI_UYAP_SIGNER_CMD) tanımlayın',
            'ya da MA3 klasörünü proje köküne yerleştirip scripts/uyap-signer-ma3.sh launcher akışını kullanın.',
        ].join(' '),
    );
}

function extractMa3FailureDetail(rawMessage: string): string | null {
    const match = rawMessage.match(/MA3_ERR_[A-Z_]+:\s*(.+)/i);
    if (!match?.[1]) return null;
    const cleaned = match[1]
        .split(/\r?\n/)[0]
        ?.replace(/^java\.lang\.\w+:\s*/i, '')
        .trim();
    return cleaned && cleaned.length > 0 ? cleaned : null;
}

function signingErrorMessage(summary: string, rawMessage: string): string {
    const detail = extractMa3FailureDetail(rawMessage);
    if (!detail || summary.toLowerCase().includes(detail.toLowerCase())) {
        return summary;
    }
    return `${summary} — ${detail}`;
}

function mapSignerFailure(rawMessage: string): UyapSigningError {
    const lowered = rawMessage.toLowerCase();
    if (
        lowered.includes('certificate expired') ||
        lowered.includes('cert_expired') ||
        lowered.includes('validity period') ||
        lowered.includes('notafter') ||
        lowered.includes('ma3_err_certificate_expired') ||
        (lowered.includes('sertifika') && lowered.includes('tarih'))
    ) {
        return new UyapSigningError('CERTIFICATE_EXPIRED', 'Sertifika Tarihi Geçmiş');
    }
    if (lowered.includes('enoent')) {
        return new UyapSigningError('SIGNER_NOT_FOUND', 'İmzalayıcı komut bulunamadı. Java/komut yolu doğrulanmalı.');
    }
    if (lowered.includes('pin') && (lowered.includes('wrong') || lowered.includes('invalid') || lowered.includes('hatalı'))) {
        return new UyapSigningError('INVALID_TOKEN_PIN', 'Token şifresi hatalı görünüyor. Lütfen PIN bilgisini tekrar girin.');
    }
    if (
        lowered.includes('ckr_pin_locked') ||
        (lowered.includes('pin') && (lowered.includes('blocked') || lowered.includes('lock')))
    ) {
        return new UyapSigningError('TOKEN_LOCKED', 'Token PIN denemeleri kilitlenmiş görünüyor. Kart/ara katman üzerinden kilidi açın.');
    }
    if (
        lowered.includes('no terminal found') ||
        lowered.includes('no card') ||
        lowered.includes('kart bulunamad') ||
        lowered.includes('akis') ||
        lowered.includes('pkcs11') ||
        lowered.includes('turktrust')
    ) {
        return new UyapSigningError('TOKEN_NOT_PRESENT', 'E-imza token/okuyucu bulunamadı veya PKCS#11 middleware erişilemiyor.');
    }
    if (lowered.includes('token') && (lowered.includes('not found') || lowered.includes('takili') || lowered.includes('yok'))) {
        return new UyapSigningError('TOKEN_NOT_PRESENT', 'E-imza token bulunamadı veya erişilemiyor.');
    }
    if (
        (lowered.includes('certificate') && (lowered.includes('not found') || lowered.includes('missing') || lowered.includes('bulun'))) ||
        lowered.includes('no qualified certificate in smartcard') ||
        lowered.includes('no certificate in smartcard')
    ) {
        return new UyapSigningError('CERTIFICATE_NOT_FOUND', 'İmzalama sertifikası bulunamadı.');
    }
    if (
        lowered.includes('ma3_err_certificate') ||
        lowered.includes('certificate') ||
        lowered.includes('sertifika')
    ) {
        return new UyapSigningError('CERTIFICATE_INVALID', 'Sertifika Geçersiz');
    }
    if (
        lowered.includes('ma3_err_mobile_reject') ||
        (lowered.includes('mssp') &&
            (lowered.includes('reject') ||
                lowered.includes('denied') ||
                lowered.includes('approval rejected') ||
                lowered.includes('kullanici reddetti') ||
                lowered.includes('kullanıcı reddetti')))
    ) {
        return new UyapSigningError(
            'MOBILE_APPROVAL_REJECTED',
            signingErrorMessage('Mobil imza onayi reddedildi.', rawMessage),
        );
    }
    if (
        lowered.includes('ma3_err_mobile_timeout') ||
        (lowered.includes('mssp') &&
            (lowered.includes('timeout') ||
                lowered.includes('time out') ||
                lowered.includes('zaman asimi') ||
                lowered.includes('zaman aşimi') ||
                lowered.includes('zaman aşımı')))
    ) {
        return new UyapSigningError(
            'MOBILE_TIMEOUT',
            signingErrorMessage('Mobil imza onayi zaman asimina ugradi.', rawMessage),
        );
    }
    if (
        lowered.includes('ma3_err_mobile_operator') ||
        (lowered.includes('mssp') &&
            (lowered.includes('operator') ||
                lowered.includes('vodafone') ||
                lowered.includes('turkcell') ||
                lowered.includes('turktelekom') ||
                lowered.includes('turktelekom') ||
                lowered.includes('avea') ||
                lowered.includes('unreachable') ||
                lowered.includes('connection refused') ||
                lowered.includes('could not send message')))
    ) {
        return new UyapSigningError(
            'MOBILE_OPERATOR_UNREACHABLE',
            signingErrorMessage('Mobil operator MSSP servisine erisilemiyor.', rawMessage),
        );
    }
    if (
        lowered.includes('ma3_err_mobile_config') ||
        (lowered.includes('mobile') &&
            (lowered.includes('operator required') ||
                lowered.includes('msisdn required') ||
                lowered.includes('tc required') ||
                lowered.includes('unknown mobile operator') ||
                lowered.includes('invalid msisdn') ||
                lowered.includes('invalid phone') ||
                lowered.includes('telefon') ||
                lowered.includes('gsm') ||
                lowered.includes('numara')))
    ) {
        return new UyapSigningError(
            'MOBILE_CONFIG_INVALID',
            signingErrorMessage('Telefon numarası yanlış veya mobil imza bilgileri eksik.', rawMessage),
        );
    }
    if (
        lowered.includes('license') ||
        lowered.includes('lisans') ||
        lowered.includes('licenseutil') ||
        lowered.includes('license xml')
    ) {
        return new UyapSigningError('LICENSE_INVALID', 'MA3 lisans dosyası bulunamadı veya geçersiz.');
    }
    return new UyapSigningError(
        'SIGN_COMMAND_FAILED',
        signingErrorMessage('İmzalama komutu başarısız oldu.', rawMessage),
    );
}

async function runCommand(params: {
    contentPath: string;
    signPath: string;
    signRequest: BridgeUyapSignRequest;
    profile: BridgeUyapSignatureProfile;
    debug?: boolean;
}): Promise<{ stdout: string; stderr: string }> {
    const resolved = resolveSignerCommand();
    const env: Record<string, string> = {
        ...process.env,
        ...(resolved.extraEnv ?? {}),
        NOMAI_SIGN_INPUT: params.contentPath,
        NOMAI_SIGN_OUTPUT: params.signPath,
        NOMAI_SIGN_STANDARD: params.profile.standard,
        NOMAI_SIGN_DIGEST: params.profile.digestAlgorithm,
        NOMAI_SIGN_PROVIDER: params.signRequest.provider,
    };
    if (params.signRequest.provider === 'token') {
        env.NOMAI_TOKEN_PIN = params.signRequest.tokenPin;
    } else {
        env.NOMAI_MOBILE_GSM = params.signRequest.gsmNo;
        env.NOMAI_MOBILE_TC = params.signRequest.tcKimlikNo;
        env.NOMAI_MOBILE_OPERATOR = params.signRequest.operator;
        env.NOMAI_MOBILE_DISPLAY_TEXT = params.signRequest.displayText ?? '';
    }
    if (params.debug) {
        console.info('[uyap-sign][bridge] launching signer command', {
            command: resolved.command,
            args: resolved.args,
            hasCustomCommand:
                Boolean(process.env.UDFIX_UYAP_SIGNER_CMD?.trim()) ||
                Boolean(process.env.NOMAI_UYAP_SIGNER_CMD?.trim()),
            contentPath: params.contentPath,
            signPath: params.signPath,
        });
    }

    return new Promise((resolve, reject) => {
        const child = spawn(resolved.command, resolved.args, {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', (error) => {
            reject(error);
        });
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Signer exited with code ${String(code)}. ${stderr}`));
                return;
            }
            if (params.debug) {
                console.info('[uyap-sign][bridge] signer command exited successfully');
            }
            resolve({ stdout, stderr });
        });
    });
}

async function runOpenSslVerify(contentPath: string, signPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child = spawn('openssl', ['smime', '-verify', '-inform', 'DER', '-in', signPath, '-content', contentPath, '-noverify'], {
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', (error) => reject(error));
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr || `openssl verify exited with code ${String(code)}`));
                return;
            }
            resolve();
        });
    });
}

export async function signDetachedContentXml(params: {
    contentXml: string;
    signRequest: BridgeUyapSignRequest;
    profile: BridgeUyapSignatureProfile;
    verifyWithOpenSsl?: boolean;
    debug?: boolean;
}): Promise<{
    signatureBytes: Uint8Array;
    notes: string[];
    signerName?: string;
    signedAtIso?: string;
    certificateValidUntilIso?: string;
}> {
    const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'udfix-uyap-sign-'));
    const contentPath = path.join(tmpRoot, 'content.xml');
    const signPath = path.join(tmpRoot, 'sign.sgn');
    const sensitiveValues =
        params.signRequest.provider === 'token'
            ? [params.signRequest.tokenPin]
            : [params.signRequest.tcKimlikNo, params.signRequest.gsmNo];
    try {
        if (params.debug) {
            console.info('[uyap-sign][bridge] detached signing started', {
                profile: params.profile,
                verifyWithOpenSsl: params.verifyWithOpenSsl === true,
            });
        }
        await fs.promises.writeFile(contentPath, params.contentXml, 'utf8');
        const { stdout, stderr } = await runCommand({
            contentPath,
            signPath,
            signRequest: params.signRequest,
            profile: params.profile,
            debug: params.debug,
        });
        let signerName: string | undefined;
        let certificateValidUntilIso: string | undefined;
        const cleanedStdoutLines: string[] = [];
        for (const line of stdout.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('UDFIX_SIGNER_NAME=')) {
                signerName = trimmed.slice('UDFIX_SIGNER_NAME='.length).trim() || undefined;
                continue;
            }
            if (trimmed.startsWith('UDFIX_CERT_VALID_UNTIL=')) {
                certificateValidUntilIso =
                    trimmed.slice('UDFIX_CERT_VALID_UNTIL='.length).trim() || undefined;
                continue;
            }
            cleanedStdoutLines.push(trimmed);
        }

        const hasSignFile = fs.existsSync(signPath);
        if (!hasSignFile) {
            throw new UyapSigningError(
                'SIGN_OUTPUT_MISSING',
                'İmzalama tamamlandı ancak sign.sgn üretilemedi. Signer çıktısını kontrol edin.',
            );
        }

        if (params.verifyWithOpenSsl) {
            await runOpenSslVerify(contentPath, signPath);
        }

        const bytes = await fs.promises.readFile(signPath);
        if (params.debug) {
            console.info('[uyap-sign][bridge] detached signing produced output', {
                signatureLength: bytes.length,
                signerName: signerName ?? null,
            });
        }
        return {
            signatureBytes: new Uint8Array(bytes),
            notes: [...cleanedStdoutLines, stderr.trim()].filter((v) => v.length > 0),
            signerName,
            signedAtIso: new Date().toISOString(),
            certificateValidUntilIso,
        };
    } catch (error) {
        if (params.debug) {
            console.warn('[uyap-sign][bridge] detached signing failed', {
                error:
                    error instanceof Error
                        ? redactSecrets(error.message, sensitiveValues)
                        : String(error),
            });
        }
        if (error instanceof UyapSigningError) {
            throw error;
        }
        const raw = error instanceof Error ? error.message : String(error);
        const mapped = mapSignerFailure(redactSecrets(raw, sensitiveValues));
        throw mapped;
    } finally {
        await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    }
}
