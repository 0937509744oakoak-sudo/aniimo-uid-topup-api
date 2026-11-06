import { config } from '../config';
import { AniimoProvider, Character, ProviderError } from './types';
// Calls only an endpoint explicitly configured by the authorized operator.
export class HttpAniimoProvider implements AniimoProvider {
  async verify(uid: string, server: string): Promise<Character> {
    if (!config.ANIIMO_VERIFY_URL) throw new ProviderError('NOT_CONFIGURED', 'Authorized Aniimo verification endpoint is not configured');
    const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
    if (config.ANIIMO_API_TOKEN) headers.authorization = `Bearer ${config.ANIIMO_API_TOKEN}`;
    if (config.ANIIMO_API_KEY) headers['x-api-key'] = config.ANIIMO_API_KEY;
    let response: Response;
    try { response = await fetch(config.ANIIMO_VERIFY_URL, { method: 'POST', headers, body: JSON.stringify({ uid, server }), signal: AbortSignal.timeout(8000) }); }
    catch { throw new ProviderError('UPSTREAM_UNAVAILABLE', 'Aniimo verification service is unavailable'); }
    if (response.status === 429) throw new ProviderError('RATE_LIMITED', 'Verification rate limited', Number(response.headers.get('retry-after') || 30));
    if (response.status === 401 || response.status === 403) throw new ProviderError('CHALLENGE', 'Provider rejected the request or requires an authorized challenge flow');
    if (response.status === 404 || response.status === 422) throw new ProviderError('NOT_FOUND', 'UID or server was not found');
    if (!response.ok) throw new ProviderError('UPSTREAM_UNAVAILABLE', `Verification provider returned HTTP ${response.status}`);
    const data: any = await response.json().catch(() => null);
    const name = data?.characterName ?? data?.character?.name; const level = data?.level ?? data?.character?.level;
    if (typeof name !== 'string' || !Number.isInteger(level)) throw new ProviderError('UPSTREAM_UNAVAILABLE', 'Unexpected verification provider response');
    return { uid, server, characterName: name, level };
  }
}
