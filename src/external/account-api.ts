import type { Env } from '../domain/types';

export type AccountPeerHints = {
  username?: string;
  accessHash?: string;
};

export type SendAccountMessageResult = {
  sendStrategy?: 'username' | 'input_peer';
  resolvedAccessHash?: string;
};

function normalizeUsername(input?: string): string | undefined {
  if (!input) return undefined;
  const cleaned = String(input).trim().replace(/^@+/, '');
  if (!cleaned) return undefined;
  if (!/^[A-Za-z0-9_]{5,32}$/.test(cleaned)) return undefined;
  return cleaned;
}

export async function sendAccountMessage(
  env: Env,
  user_id: string,
  text: string,
  peerHints?: AccountPeerHints
): Promise<SendAccountMessageResult> {
  const serviceUrl = env.MTPROTO_SERVICE_URL?.trim();
  const token = env.INTERNAL_API_TOKEN?.trim();

  if (!serviceUrl) {
    throw new Error('MTPROTO_SERVICE_URL is not configured');
  }
  if (!token) {
    throw new Error('INTERNAL_API_TOKEN is not configured');
  }

  const url = serviceUrl.endsWith('/')
    ? `${serviceUrl}api/send-message`
    : `${serviceUrl}/api/send-message`;

  const chatId = String(user_id).trim();
  const message = String(text ?? '').trim();
  const username = normalizeUsername(peerHints?.username);
  const accessHash = peerHints?.accessHash ? String(peerHints.accessHash).trim() : '';

  if (!chatId) {
    throw new Error('chatId (user_id) is empty');
  }
  if (!message) {
    throw new Error('message text is empty');
  }

  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        chatId,
        message,
        ...(username != null ? { username } : {}),
        ...(accessHash ? { accessHash } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let errorPayload: any = null;
      try {
        errorPayload = await res.json();
      } catch {
        
      }
      const desc =
        (errorPayload && (errorPayload.error || errorPayload.message)) ||
        `HTTP ${res.status} ${res.statusText}`;
      throw new Error(`MTProto service error: ${desc}`);
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      throw new Error('MTProto service returned non-JSON response');
    }

    if (!json || json.success !== true) {
      const errText = json && json.error ? String(json.error) : 'unknown error';
      throw new Error(`MTProto send failed: ${errText}`);
    }
    return {
      sendStrategy: json?.sendStrategy,
      resolvedAccessHash: json?.resolvedAccessHash ? String(json.resolvedAccessHash) : undefined,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('MTProto service timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
