<?php
declare(strict_types=1);

/**
 * TrustLock client for server-side PHP (8.1+, needs the curl and json extensions). One file, no dependencies.
 *
 *   require 'TrustLock.php';
 *   $tl = new TrustLock\Client(getenv('TRUSTLOCK_API_KEY'), 'https://your-trustlock-host');
 *   $tl->users->upsert('cust-1001', 'Amina', 'client');
 *   $contract = $tl->as('cust-1001')->contracts->create([...], "order-$orderId");
 *
 * Keep the API key on your server. Never ship it to a browser or a mobile app. Amounts are minor units (100 = 1 credit).
 */

namespace TrustLock;

final class TrustLockError extends \RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message)
    {
        parent::__construct("$errorCode: $message", $status);
    }
}

final class Http
{
    public function __construct(private string $apiKey, private string $baseUrl, private int $maxRetries, private float $timeout)
    {
        if (!str_starts_with($apiKey, 'tlk_')) {
            throw new \InvalidArgumentException('TrustLock: apiKey should start with tlk_');
        }
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    /** @param mixed $idem a string key, true to make one, or null */
    public function request(string $method, string $path, ?string $user = null, ?array $body = null, string|bool|null $idem = null): mixed
    {
        $headers = ['Authorization: Bearer ' . $this->apiKey, 'Accept: application/json'];
        if ($user !== null) $headers[] = 'TrustLock-User: ' . $user;
        $payload = null;
        if ($body !== null) {
            $payload = json_encode($body === [] ? new \stdClass() : $body, JSON_THROW_ON_ERROR);
            $headers[] = 'Content-Type: application/json';
        }
        $key = $idem === true ? 'sdk-' . self::uuid() : ($idem ?: null);
        if ($key !== null) $headers[] = 'Idempotency-Key: ' . $key;
        // A request may be repeated after a failure only if repeating it cannot do anything twice.
        $repeatable = $method === 'GET' || $key !== null;

        for ($attempt = 0;; $attempt++) {
            $last = $attempt >= $this->maxRetries;
            $retryAfter = 0;
            $ch = curl_init($this->baseUrl . '/api/v1' . $path);
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT_MS => (int) ($this->timeout * 1000),
                CURLOPT_HEADERFUNCTION => function ($c, string $h) use (&$retryAfter) {
                    if (stripos($h, 'retry-after:') === 0) $retryAfter = (float) trim(substr($h, 12));
                    return strlen($h);
                },
            ]);
            if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            $raw = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($raw === false) {
                if (!$repeatable || $last) throw new \RuntimeException("TrustLock: network error: $curlError");
                usleep((int) (200_000 * 2 ** $attempt));
                continue;
            }
            $data = json_decode((string) $raw, true);
            if ($status >= 200 && $status < 300) return $data;
            // 429 was refused before it did anything, so it is always safe to repeat.
            if (!$last && ($status === 429 || ($status >= 500 && $repeatable))) {
                usleep((int) (($status === 429 && $retryAfter > 0 ? min($retryAfter, 30) : 0.2 * 2 ** $attempt) * 1_000_000));
                continue;
            }
            $err = is_array($data) ? ($data['error'] ?? []) : [];
            throw new TrustLockError($status, $err['code'] ?? 'UNKNOWN', $err['message'] ?? "TrustLock answered $status");
        }
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}

final class Users
{
    public function __construct(private Http $h) {}

    /** Link one of your users. Safe to repeat. $role is "client" or "freelancer" and cannot change later. */
    public function upsert(string $id, string $name, string $role): array
    {
        return $this->h->request('POST', '/users', body: ['external_id' => $id, 'name' => $name, 'role' => $role]);
    }

    public function get(string $id): array
    {
        return $this->h->request('GET', '/users/' . rawurlencode($id));
    }
}

final class Webhooks
{
    public function __construct(private Http $h) {}

    /** The response holds the signing `secret` once. Store it. */
    public function create(string $url, array $events = ['*']): array
    {
        return $this->h->request('POST', '/webhook-endpoints', body: ['url' => $url, 'events' => $events]);
    }

    public function list(): array { return $this->h->request('GET', '/webhook-endpoints')['data']; }
    public function get(string $id): array { return $this->h->request('GET', "/webhook-endpoints/$id"); }
    public function delete(string $id): array { return $this->h->request('DELETE', "/webhook-endpoints/$id"); }

    /** Sends a ping now and reports how your server answered. */
    public function test(string $id): array { return $this->h->request('POST', "/webhook-endpoints/$id/test"); }
}

final class Wallet
{
    public function __construct(private Http $h, private string $user) {}

    public function get(): array { return $this->h->request('GET', '/wallet', $this->user); }
    public function topUp(int $amount, ?string $idempotencyKey = null): array
    {
        return $this->h->request('POST', '/wallet/top-ups', $this->user, ['amount' => $amount], $idempotencyKey ?? true);
    }
    public function withdraw(int $amount, ?string $idempotencyKey = null): array
    {
        return $this->h->request('POST', '/wallet/withdrawals', $this->user, ['amount' => $amount], $idempotencyKey ?? true);
    }
}

final class Contracts
{
    public function __construct(private Http $h, private string $user) {}

    private function act(string $id, string $action, ?array $body = null, string|bool|null $idem = null): array
    {
        return $this->h->request('POST', "/contracts/$id/$action", $this->user, $body, $idem);
    }

    public function list(?string $state = null): array
    {
        return $this->h->request('GET', '/contracts' . ($state ? '?state=' . rawurlencode($state) : ''), $this->user)['data'];
    }

    /** Includes `allowed_actions`: what this user can do right now. Drive your buttons from it. */
    public function get(string $id): array { return $this->h->request('GET', "/contracts/$id", $this->user); }

    /** The client proposes a contract to one of your freelancers. Derive the key from YOUR record, e.g. "create-$orderId". */
    public function create(array $contract, ?string $idempotencyKey = null): array
    {
        return $this->h->request('POST', '/contracts', $this->user, $contract, $idempotencyKey ?? true);
    }

    public function accept(string $id): array { return $this->act($id, 'accept'); }
    public function reject(string $id, string $reason): array { return $this->act($id, 'reject', ['reason' => $reason]); }
    public function counter(string $id, array $terms): array { return $this->act($id, 'counter', $terms); }
    public function acceptCounter(string $id): array { return $this->act($id, 'accept-counter'); }
    public function declineCounter(string $id, string $reason): array { return $this->act($id, 'decline-counter', ['reason' => $reason]); }
    public function cancel(string $id, ?string $reason = null): array { return $this->act($id, 'cancel', $reason ? ['reason' => $reason] : null); }

    /** Moves the client's credits into escrow. */
    public function fund(string $id, ?string $idempotencyKey = null): array { return $this->act($id, 'fund', null, $idempotencyKey ?? true); }

    public function startWork(string $id): array { return $this->act($id, 'start-work'); }

    /** Records the file by name, size and SHA-256. The file itself stays with you. */
    public function deliver(string $id, string $fileName, int $sizeBytes, string $sha256, ?string $note = null): array
    {
        $body = ['file_name' => $fileName, 'size_bytes' => $sizeBytes, 'sha256' => $sha256];
        if ($note !== null) $body['note'] = $note;
        return $this->act($id, 'deliver', $body);
    }

    public function requestRevision(string $id, string $reason): array { return $this->act($id, 'request-revision', ['reason' => $reason]); }

    /** Releases the escrow to the freelancer (minus the platform fee). */
    public function approve(string $id, ?string $idempotencyKey = null): array { return $this->act($id, 'approve', null, $idempotencyKey ?? true); }

    public function dispute(string $id, string $reason): array { return $this->act($id, 'dispute', ['reason' => $reason]); }
    public function withdrawDispute(string $id): array { return $this->act($id, 'withdraw-dispute'); }
    public function cancelFunded(string $id): array { return $this->act($id, 'cancel-funded'); }
    public function declineCancel(string $id): array { return $this->act($id, 'decline-cancel'); }
    public function message(string $id, string $text): array { return $this->act($id, 'message', ['text' => $text]); }

    /** Dispute evidence: a note and/or files, each ['file_name' =>, 'size_bytes' =>, 'sha256' =>]. */
    public function submitEvidence(string $id, ?string $text = null, array $files = []): array
    {
        $body = [];
        if ($text !== null) $body['text'] = $text;
        if ($files) $body['files'] = $files;
        return $this->act($id, 'evidence', $body);
    }
}

final class AsUser
{
    public readonly Wallet $wallet;
    public readonly Contracts $contracts;

    public function __construct(Http $h, string $user)
    {
        $this->wallet = new Wallet($h, $user);
        $this->contracts = new Contracts($h, $user);
    }
}

final class Client
{
    public readonly Users $users;
    public readonly Webhooks $webhooks;
    private Http $http;

    public function __construct(string $apiKey, string $baseUrl, int $maxRetries = 2, float $timeoutSeconds = 15.0)
    {
        $this->http = new Http($apiKey, $baseUrl, $maxRetries, $timeoutSeconds);
        $this->users = new Users($this->http);
        $this->webhooks = new Webhooks($this->http);
    }

    /** Everything on the result runs as this user, with exactly the powers they have in TrustLock. */
    public function as(string $userId): AsUser { return new AsUser($this->http, $userId); }

    /** The most recent calls made with your keys in this mode: what you called and why one failed. */
    public function usage(int $limit = 50): array { return $this->http->request('GET', "/usage?limit=$limit")['data']; }

    /**
     * Check a webhook before you trust it. Pass the RAW request body (file_get_contents('php://input'), not re-encoded JSON),
     * the TrustLock-Signature header and your endpoint secret. Returns the event array or throws \UnexpectedValueException.
     * Deduplicate on $event['id']: a delivery can arrive more than once, and a retry keeps its original timestamp,
     * so the default tolerance is a day.
     */
    public static function verifyWebhook(string $rawBody, ?string $signatureHeader, string $secret, int $toleranceSeconds = 86400): array
    {
        $parts = [];
        foreach (explode(',', (string) $signatureHeader) as $p) {
            [$k, $v] = array_pad(explode('=', trim($p), 2), 2, '');
            $parts[$k] = $v;
        }
        if (!ctype_digit($parts['t'] ?? '') || ($parts['v1'] ?? '') === '') {
            throw new \UnexpectedValueException('TrustLock webhook: malformed signature header');
        }
        $t = (int) $parts['t'];
        if (abs(time() - $t) > $toleranceSeconds) throw new \UnexpectedValueException('TrustLock webhook: timestamp outside tolerance');
        if (!hash_equals(hash_hmac('sha256', "$t.$rawBody", $secret), $parts['v1'])) {
            throw new \UnexpectedValueException('TrustLock webhook: signature does not match');
        }
        return json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
    }
}
